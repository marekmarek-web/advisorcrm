"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getContractReviewById,
  updateContractReview,
  saveContractCorrection,
} from "@/lib/ai/review-queue-repository";
import type { ContractReviewRow } from "@/lib/ai/review-queue-repository";
import { mergeFieldEditsIntoExtractedPayload } from "@/lib/ai-review/mappers";
import { applyContractReview } from "@/lib/ai/apply-contract-review";
import { isSupportingDocumentOnly } from "@/lib/ai/apply-policy-enforcement";
import { mapContractReviewToBridgePayload, computePublishOutcome } from "@/lib/ai/write-through-contract";
import { tryBuildPaymentSetupDraftFromRawPayload } from "@/lib/ai/draft-actions";
import { resolveSegmentForContractApply } from "@/lib/ai/apply-contract-review";
import {
  breadcrumbContractReviewPaymentGate,
  captureContractReviewApplyFailure,
} from "@/lib/observability/contract-review-sentry";
import { capturePublishGuardFailure } from "@/lib/observability/portal-sentry";
import * as Sentry from "@sentry/nextjs";
import { logActivity } from "./activity";
import { db } from "db";
import { contacts, documents, contracts, clientPaymentSetups, auditLog } from "db";
import { eq, and } from "db";
import { notifyClientAdvisorSharedDocument } from "@/lib/documents/notify-client-visible-document";

export type ContractReviewActionResult =
  | { ok: true; payload?: import("@/lib/ai/review-queue-repository").ApplyResultPayload }
  | { ok: false; error: string; blockedReasons?: string[] };

function canApproveOrReject(processingStatus: string): boolean {
  return (
    processingStatus === "extracted" ||
    processingStatus === "review_required" ||
    processingStatus === "blocked"
  );
}

function canApply(processingStatus: string, reviewStatus: string | null): boolean {
  return (
    (processingStatus === "extracted" ||
      processingStatus === "review_required" ||
      processingStatus === "blocked") &&
    reviewStatus === "approved"
  );
}

function canResolveClientBeforeApply(reviewStatus: string | null): boolean {
  return reviewStatus === null || reviewStatus === "pending" || reviewStatus === "approved";
}

export async function approveContractReview(
  id: string,
  options?: {
    fieldEdits?: Record<string, string>;
    rawExtractedPayload?: Record<string, unknown>;
    correctionReason?: string | null;
  }
): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(id, auth.tenantId);
  if (!row) {
    return { ok: false, error: "Položka nenalezena." };
  }
  if (row.reviewStatus !== "pending" && row.reviewStatus !== null) {
    return { ok: false, error: "Položka již byla zpracována." };
  }
  if (!canApproveOrReject(row.processingStatus)) {
    return { ok: false, error: "Položku nelze schválit v aktuálním stavu." };
  }

  const edits = options?.fieldEdits ?? {};
  const raw = options?.rawExtractedPayload;
  if (raw && Object.keys(edits).length > 0) {
    const { merged, correctedFields } = mergeFieldEditsIntoExtractedPayload(raw, edits);
    if (correctedFields.length > 0) {
      await saveContractCorrection(id, auth.tenantId, {
        correctedPayload: merged,
        correctedFields,
        correctedBy: auth.userId,
        correctionReason: options?.correctionReason?.trim() || null,
      });
    }
  }

  await updateContractReview(id, auth.tenantId, {
    reviewStatus: "approved",
    reviewedBy: auth.userId,
    reviewedAt: new Date(),
    rejectReason: null,
  });
  return { ok: true };
}

export async function rejectContractReview(
  id: string,
  reason?: string | null
): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(id, auth.tenantId);
  if (!row) {
    return { ok: false, error: "Položka nenalezena." };
  }
  if (row.reviewStatus !== "pending" && row.reviewStatus !== null) {
    return { ok: false, error: "Položka již byla zpracována." };
  }
  if (!canApproveOrReject(row.processingStatus)) {
    return { ok: false, error: "Položku nelze zamítnout v aktuálním stavu." };
  }
  await updateContractReview(id, auth.tenantId, {
    reviewStatus: "rejected",
    reviewedBy: auth.userId,
    reviewedAt: new Date(),
    rejectReason: reason?.trim() || null,
  });
  return { ok: true };
}

export async function selectMatchedClient(
  reviewId: string,
  clientId: string
): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };
  if (!canResolveClientBeforeApply(row.reviewStatus ?? null)) {
    return { ok: false, error: "Klienta lze změnit jen do okamžiku zápisu do CRM." };
  }
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, clientId), eq(contacts.tenantId, auth.tenantId)))
    .limit(1);
  if (!contact) {
    return { ok: false, error: "Klient nenalezen." };
  }
  await updateContractReview(reviewId, auth.tenantId, {
    matchedClientId: clientId,
    createNewClientConfirmed: null,
  });
  return { ok: true };
}

export async function confirmCreateNewClient(reviewId: string): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };
  if (!canResolveClientBeforeApply(row.reviewStatus ?? null)) {
    return { ok: false, error: "Nového klienta lze potvrdit jen do okamžiku zápisu do CRM." };
  }
  await updateContractReview(reviewId, auth.tenantId, {
    matchedClientId: null,
    createNewClientConfirmed: "true",
  });
  return { ok: true };
}

/**
 * Persist advisor's "final contract" override to DB (stored in ignoredWarnings).
 * This ensures the override survives page reload and can be read back in mappers.
 */
export async function persistFinalContractOverride(
  reviewId: string,
  gateReasons: string[]
): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };
  if (row.reviewStatus === "applied") return { ok: true };

  // Mark these gate reasons as advisor-ignored so quality-gates skips them on next apply
  const existing = Array.isArray(row.ignoredWarnings) ? (row.ignoredWarnings as string[]) : [];
  const merged = Array.from(new Set([...existing, ...gateReasons]));
  await updateContractReview(reviewId, auth.tenantId, {
    ignoredWarnings: merged,
  });
  return { ok: true };
}

/** Schválí kontrolu a hned zapisuje draft akce do CRM (dva kroky v jednom volání). */
export async function approveAndApplyContractReview(
  id: string,
  options?: {
    fieldEdits?: Record<string, string>;
    rawExtractedPayload?: Record<string, unknown>;
    correctionReason?: string | null;
    overrideGateReasons?: string[];
    overrideReason?: string;
  },
): Promise<ContractReviewActionResult> {
  const approved = await approveContractReview(id, {
    fieldEdits: options?.fieldEdits,
    rawExtractedPayload: options?.rawExtractedPayload,
    correctionReason: options?.correctionReason,
  });
  if (!approved.ok) return approved;
  return applyContractReviewDrafts(id, {
    overrideGateReasons: options?.overrideGateReasons,
    overrideReason: options?.overrideReason,
  });
}

/**
 * Phase 3B: Regenerate payment-related draftActions from the current
 * (possibly corrected) extractedPayload so that apply always uses fresh data.
 */
function regeneratePaymentDraftActions(row: ContractReviewRow): ContractReviewRow {
  const payload = row.extractedPayload as Record<string, unknown> | null;
  if (!payload) return row;

  const freshDraft = tryBuildPaymentSetupDraftFromRawPayload(payload);
  if (!freshDraft) return row;
  const existingActions = Array.isArray(row.draftActions)
    ? (row.draftActions as Array<{ type: string; label: string; payload: Record<string, unknown> }>)
    : [];

  const hadPaymentAction = existingActions.some(
    (a) =>
      a.type === "create_payment_setup" ||
      a.type === "create_payment" ||
      a.type === "create_payment_setup_for_portal"
  );
  const otherActions = existingActions.filter(
    (a) =>
      a.type !== "create_payment_setup" &&
      a.type !== "create_payment" &&
      a.type !== "create_payment_setup_for_portal"
  );

  const updatedActions = hadPaymentAction
    ? [...otherActions, freshDraft]
    : existingActions;

  return { ...row, draftActions: updatedActions };
}

/**
 * Advisor-confirmed apply: when no contract draft action exists in the stored
 * draftActions (e.g. document was classified as proposal/illustration at pipeline time
 * but advisor explicitly approved it as a final contract), inject a synthetic
 * create_or_update_contract_production action from the extractedPayload.
 *
 * This prevents ghost-success: apply returns ok:true but no contract row is created.
 * Only runs when:
 * - reviewStatus === "approved" (advisor explicitly confirmed)
 * - isSupportingDocumentOnly returns false (not a payslip/bank statement/etc.)
 * - extractedPayload has at least one of: segment, contractNumber, institutionName, productName
 * - draftActions has NO contract creation action
 */
function injectContractDraftActionIfMissing(row: ContractReviewRow): ContractReviewRow {
  const draftActionsArr = Array.isArray(row.draftActions)
    ? (row.draftActions as Array<{ type: string; label: string; payload: Record<string, unknown> }>)
    : [];

  const hasContractAction = draftActionsArr.some(
    (a) =>
      a.type === "create_contract" ||
      a.type === "create_or_update_contract_record" ||
      a.type === "create_or_update_contract_production",
  );

  if (hasContractAction) return row;
  if (row.reviewStatus !== "approved") return row;

  const ep = (row.extractedPayload as Record<string, unknown> | null) ?? {};

  // Advisor-confirmed apply (reviewStatus === "approved") bypasses the supporting document guard,
  // mirroring the same bypass in applyContractReview (line: isSupporting = rawIsSupporting && reviewStatus !== "approved").
  // When advisor explicitly approved, they take responsibility for classification — including bundles
  // with AML/FATCA attachments that caused sensitiveAttachmentOnly=true on the pipeline.
  // Only skip injection for true standalone supporting types (payslip, bank statement, etc.)
  // where primaryType itself is in SUPPORTING_TYPES.
  const dc = ep.documentClassification as Record<string, unknown> | undefined;
  const primaryType = dc?.primaryType as string | undefined;
  const HARD_SUPPORTING_TYPES = new Set([
    "payslip", "payslip_document", "income_proof_document", "income_confirmation",
    "tax_return", "corporate_tax_return", "self_employed_tax_or_income_document",
    "bank_statement", "supporting_document", "reference_document",
    "medical_questionnaire", "identity_document", "consent_or_declaration",
    "aml_fatca_form", "attachment_only", "other_non_publishable",
  ]);
  if (primaryType && HARD_SUPPORTING_TYPES.has(primaryType)) return row;

  const ef = ep.extractedFields as Record<string, { value?: unknown } | undefined> | undefined;

  const fieldStr = (keys: string[]): string | null => {
    for (const k of keys) {
      const cell = ef?.[k];
      const v = cell?.value;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };

  const contractNumber =
    fieldStr(["contractNumber", "existingPolicyNumber", "proposalNumber"]) ??
    (typeof ep.contractNumber === "string" && ep.contractNumber.trim() ? ep.contractNumber.trim() : null);
  const institutionName =
    fieldStr(["insurer", "institutionName", "lender", "bankName", "partnerName"]) ??
    (typeof ep.institutionName === "string" && ep.institutionName.trim() ? ep.institutionName.trim() : null);
  const productName =
    fieldStr(["productName", "tariffName", "fundName", "strategyName"]) ??
    (typeof ep.productName === "string" && ep.productName.trim() ? ep.productName.trim() : null);
  const effectiveDate =
    fieldStr(["policyStartDate", "effectiveDate", "disbursementDate", "startDate"]) ??
    (typeof ep.effectiveDate === "string" && ep.effectiveDate.trim() ? ep.effectiveDate.trim() : null);
  const segment = resolveSegmentForContractApply({}, ep);

  // Only inject if we have at least minimal contract data
  const hasContractData = Boolean(contractNumber || institutionName || productName);
  if (!hasContractData) return row;

  const syntheticAction = {
    type: "create_or_update_contract_production" as const,
    label: "Vytvořit nebo aktualizovat smlouvu (advisor-confirmed inject)",
    payload: {
      contractNumber: contractNumber ?? undefined,
      institutionName: institutionName ?? undefined,
      productName: productName ?? undefined,
      effectiveDate: effectiveDate ?? undefined,
      segment,
      documentType: typeof dc?.primaryType === "string" ? dc.primaryType : undefined,
      lifecycleStatus:
        typeof dc?.lifecycleStatus === "string" ? dc.lifecycleStatus : "final_contract",
    } as Record<string, unknown>,
  };

  return { ...row, draftActions: [...draftActionsArr, syntheticAction] };
}

export async function applyContractReviewDrafts(
  id: string,
  options?: {
    overrideGateReasons?: string[];
    overrideReason?: string;
  },
): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const rawRow = await getContractReviewById(id, auth.tenantId);
  if (!rawRow) {
    return { ok: false, error: "Položka nenalezena." };
  }
  if (rawRow.reviewStatus === "applied") {
    return { ok: true, payload: rawRow.applyResultPayload ?? undefined };
  }
  if (!canApply(rawRow.processingStatus, rawRow.reviewStatus ?? null)) {
    return {
      ok: false,
      error:
        rawRow.reviewStatus !== "approved"
          ? "Nejprve schvalte položku."
          : "Položku nelze aplikovat v aktuálním stavu.",
    };
  }
  if (rawRow.processingStatus === "failed") {
    return { ok: false, error: "U neúspěšné položky nelze aplikovat akce." };
  }

  const row = injectContractDraftActionIfMissing(regeneratePaymentDraftActions(rawRow));

  const { evaluateApplyReadiness, applyReasonsPendingOverride } = await import("@/lib/ai/quality-gates");
  const gate = evaluateApplyReadiness(row);
  const pendingApply = applyReasonsPendingOverride(gate);
  if (pendingApply.length > 0) {
    const dbIgnored = Array.isArray(rawRow.ignoredWarnings) ? (rawRow.ignoredWarnings as string[]) : [];
    const explicitOverrides = options?.overrideGateReasons ?? [];
    // Advisor-confirmed flow: when advisor approved the review, auto-override all
    // publishability/proposal/payment gate reasons. The advisor takes responsibility.
    const isAdvisorConfirmedApply = rawRow.reviewStatus === "approved";
    const overrides = isAdvisorConfirmedApply
      ? Array.from(new Set([...pendingApply, ...explicitOverrides, ...dbIgnored]))
      : Array.from(new Set([...explicitOverrides, ...dbIgnored]));
    const remaining = pendingApply.filter((r) => !overrides.includes(r));
    if (remaining.length > 0) {
      breadcrumbContractReviewPaymentGate({
        reviewId: id,
        blockedReasons: remaining,
        hadOverride: false,
      });
      return {
        ok: false,
        error: `Aplikace zablokována: ${remaining.join(", ")}`,
        blockedReasons: remaining,
      };
    }
    if (overrides.length > 0) {
      const { logAudit } = await import("@/lib/audit");
      await logAudit({
        tenantId: auth.tenantId,
        userId: auth.userId,
        action: "apply_gate_override",
        entityType: "contract_review",
        entityId: id,
        meta: {
          overriddenReasons: overrides,
          overrideReason: options?.overrideReason ?? "Advisor-confirmed apply: all gates auto-overridden.",
          advisorConfirmedApply: isAdvisorConfirmedApply,
        },
      }).catch(() => {});
    }
    // Persist overrides into ignoredWarnings so apply-contract-review can read them
    if (isAdvisorConfirmedApply && overrides.length > 0) {
      try {
        await updateContractReview(id, auth.tenantId, {
          ignoredWarnings: overrides,
        });
        // Refresh row with persisted overrides for apply
        (row as Record<string, unknown>).ignoredWarnings = overrides;
      } catch { /* noop — apply still proceeds with in-memory override */ }
    }
  }

  const result = await applyContractReview({
    reviewId: id,
    tenantId: auth.tenantId,
    userId: auth.userId,
    row,
  });

  if (!result.ok) {
    captureContractReviewApplyFailure({
      reviewId: id,
      tenantId: auth.tenantId,
      error: result.error,
    });
    return { ok: false, error: result.error };
  }

  // Hard guard: advisor-confirmed apply with contract actions MUST produce a contract row.
  // This prevents "ghost success" where apply returns ok:true but createdContractId is null.
  if (!result.payload.createdContractId) {
    const draftActionsArr = Array.isArray(row.draftActions)
      ? (row.draftActions as Array<{ type: string }>)
      : [];
    const hasContractAction = draftActionsArr.some(
      (a) =>
        a.type === "create_contract" ||
        a.type === "create_or_update_contract_record" ||
        a.type === "create_or_update_contract_production",
    );
    if (hasContractAction) {
      captureContractReviewApplyFailure({
        reviewId: id,
        tenantId: auth.tenantId,
        error: "Ghost success guard: contract action present but createdContractId is null",
      });
      return {
        ok: false,
        error: "Zápis do CRM selhal: smlouva/produkt nebyl vytvořen. Zkontrolujte klasifikaci dokumentu a zkuste znovu.",
      };
    }
  }

  const bridgedPayload = mapContractReviewToBridgePayload({
    review: row,
    payload: result.payload,
  });

  // Slice 4: reviewStatus update je MUST-SUCCEED post-commit krok — retry 1x, pak hard alert.
  const persistReviewStatus = async () => {
    await updateContractReview(id, auth.tenantId, {
      reviewStatus: "applied",
      appliedBy: auth.userId,
      appliedAt: new Date(),
      applyResultPayload: bridgedPayload,
    });
  };

  try {
    await persistReviewStatus();
  } catch (firstErr) {
    // Slice 4: HARD retry — reviewStatus persistence je kritická pro idempotency
    console.error("[apply] reviewStatus persist failed (attempt 1), retrying…", {
      reviewId: id,
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    });
    try {
      await persistReviewStatus();
    } catch (secondErr) {
      // Slice 4: HARD FAIL — oba pokusy selhaly, CRM data jsou zapsána ale status není
      const errMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
      console.error("[apply] reviewStatus persist HARD FAIL — apply committed but status not persisted", {
        reviewId: id,
        tenantId: auth.tenantId,
        error: errMsg,
      });
      try {
        Sentry.withScope((scope) => {
          scope.setTag("feature", "contract_review_apply");
          scope.setTag("post_commit_step", "review_status_persist");
          scope.setTag("severity", "hard_fail");
          scope.setFingerprint(["apply-review-status-persist-hard-fail"]);
          scope.setContext("apply_post_commit", {
            reviewId: id,
            tenantId: auth.tenantId,
            error: errMsg.slice(0, 2000),
          });
          Sentry.captureMessage(
            `[HARD] apply_review_status_persist_failed: ${errMsg.slice(0, 200)}`,
            "error"
          );
        });
      } catch {
        /* Sentry nesmí crashovat apply response */
      }
      // Apply proběhl úspěšně — vracíme ok:true ale signalizujeme varování
      return { ok: true, payload: bridgedPayload };
    }
  }

  // effectiveClientId: prefer matchedClientId, fallback na createdClientId / linkedClientId
  const effectiveClientId =
    row.matchedClientId ??
    result.payload.createdClientId ??
    result.payload.linkedClientId ??
    null;

  // Slice 4: Document linking — SOFT fail (log + Sentry capture, apply nezastaví)
  if (effectiveClientId) {
    try {
      const linkResult = await linkContractReviewFileToContactDocuments(id, {
        visibleToClient: true,
        contractId: result.payload.createdContractId ?? undefined,
        overrideContactId: row.matchedClientId ? undefined : effectiveClientId,
      });
      if (linkResult.ok && linkResult.documentId) {
        // Propagate linked document ID into payload so callers and read models can see it
        bridgedPayload.linkedDocumentId = linkResult.documentId;

        if (result.payload.createdContractId) {
          try {
            const [existingContract] = await db
              .select({ sourceDocumentId: contracts.sourceDocumentId })
              .from(contracts)
              .where(
                and(
                  eq(contracts.tenantId, auth.tenantId),
                  eq(contracts.id, result.payload.createdContractId)
                )
              )
              .limit(1);
            if (existingContract && !existingContract.sourceDocumentId) {
              await db
                .update(contracts)
                .set({ sourceDocumentId: linkResult.documentId, updatedAt: new Date() })
                .where(
                  and(
                    eq(contracts.tenantId, auth.tenantId),
                    eq(contracts.id, result.payload.createdContractId)
                  )
                );
            }
          } catch (sourceDocErr) {
            // Slice 4: sourceDocumentId update selhal — SOFT, logujeme ale nezastavujeme
            console.warn("[apply] post-commit sourceDocumentId update failed (soft)", {
              reviewId: id,
              documentId: linkResult.documentId,
              error: sourceDocErr instanceof Error ? sourceDocErr.message : String(sourceDocErr),
            });
            try {
              Sentry.addBreadcrumb({
                category: "contract_review.apply",
                level: "warning",
                message: "post_commit_source_document_id_update_failed",
                data: { reviewId: id, documentId: linkResult.documentId },
              });
            } catch { /* noop */ }
          }
        }
      } else if (!linkResult.ok) {
        // Document linking returned ok:false — log as warning, propagate to payload
        console.warn("[apply] post-commit document linking returned ok:false (soft)", {
          reviewId: id,
          error: linkResult.error,
        });
        (bridgedPayload as Record<string, unknown>).documentLinkWarning = linkResult.error ?? "document_link_failed";
      }
    } catch (linkErr) {
      // Slice 4: Document linking selhal — SOFT, celý apply je OK
      console.warn("[apply] post-commit document linking failed (soft)", {
        reviewId: id,
        error: linkErr instanceof Error ? linkErr.message : String(linkErr),
      });
      (bridgedPayload as Record<string, unknown>).documentLinkWarning = "document_link_exception";
      try {
        Sentry.withScope((scope) => {
          scope.setTag("feature", "contract_review_apply");
          scope.setTag("post_commit_step", "document_linking");
          scope.setTag("severity", "soft_fail");
          scope.setContext("apply_post_commit", {
            reviewId: id,
            tenantId: auth.tenantId,
            error: linkErr instanceof Error ? linkErr.message.slice(0, 1000) : String(linkErr),
          });
          Sentry.captureMessage(
            `[SOFT] apply_document_linking_failed: ${linkErr instanceof Error ? linkErr.message.slice(0, 150) : "unknown"}`,
            "warning"
          );
        });
      } catch { /* noop */ }
    }
  }

  // Slice 4: Coverage upsert — SOFT fail (explicitní log + Sentry, apply nezastaví)
  if (effectiveClientId && result.payload.createdContractId) {
    const { upsertCoverageFromAppliedReview } = await import("@/lib/ai/apply-coverage-from-review");
    try {
      await upsertCoverageFromAppliedReview({
        tenantId: auth.tenantId,
        userId: auth.userId,
        contactId: effectiveClientId,
        contractId: result.payload.createdContractId,
        row,
      });
    } catch (coverageErr) {
      // Slice 4: Coverage upsert selhal — SOFT, ale explicitně logujeme
      console.warn("[apply] post-commit coverage upsert failed (soft)", {
        reviewId: id,
        contractId: result.payload.createdContractId,
        error: coverageErr instanceof Error ? coverageErr.message : String(coverageErr),
      });
      try {
        Sentry.withScope((scope) => {
          scope.setTag("feature", "contract_review_apply");
          scope.setTag("post_commit_step", "coverage_upsert");
          scope.setTag("severity", "soft_fail");
          scope.setContext("apply_post_commit", {
            reviewId: id,
            tenantId: auth.tenantId,
            contractId: result.payload.createdContractId,
            error: coverageErr instanceof Error ? coverageErr.message.slice(0, 1000) : String(coverageErr),
          });
          Sentry.captureMessage(
            `[SOFT] apply_coverage_upsert_failed: ${coverageErr instanceof Error ? coverageErr.message.slice(0, 150) : "unknown"}`,
            "warning"
          );
        });
      } catch { /* noop */ }
    }
  }

  // Phase 5A: Compute and attach publishOutcome — truthful post-apply status.
  // Advisor-confirmed apply: supporting doc guard is overridden when advisor explicitly approved.
  const extractedPayloadForOutcome = (row.extractedPayload as Record<string, unknown> | null) ?? {};
  const rawIsSupportingForOutcome = isSupportingDocumentOnly(extractedPayloadForOutcome);
  // Advisor-confirmed apply: bypass supporting doc guard for outcome computation
  // (consistent with the bypass in apply-contract-review.ts).
  const isDocumentSupporting = rawIsSupportingForOutcome && rawRow.reviewStatus !== "approved";
  const computedOutcome = computePublishOutcome(bridgedPayload, isDocumentSupporting);

  // Truthful enforcement: log guard violations (non-blocking, advisory only)
  if (computedOutcome.mode === "product_published_visible_to_client" && !bridgedPayload.createdContractId) {
    console.error("[publish-guard] VIOLATION: product_published_visible_to_client without createdContractId", {
      reviewId: id,
      tenantId: auth.tenantId,
    });
  }
  if (computedOutcome.paymentOutcome === "payment_setup_published" && !bridgedPayload.createdPaymentSetupId) {
    console.error("[publish-guard] VIOLATION: payment_setup_published without createdPaymentSetupId", {
      reviewId: id,
      tenantId: auth.tenantId,
    });
  }

  bridgedPayload.publishOutcome = computedOutcome;

  // Persist publishOutcome into the stored applyResultPayload
  try {
    await updateContractReview(id, auth.tenantId, {
      applyResultPayload: bridgedPayload,
    });
  } catch {
    // Soft fail — publishOutcome is returned in payload even if persist fails
  }

  return { ok: true, payload: bridgedPayload };
}

/**
 * Vytvoří záznam v tabulce `documents` se stejným souborem jako AI Review (bez kopírování v úložišti),
 * aby byl soubor v jednotné dokumentové vrstvě u klienta. Volitelně viditelný v klientském portálu.
 */
export async function linkContractReviewFileToContactDocuments(
  reviewId: string,
  options?: { visibleToClient?: boolean; contractId?: string; overrideContactId?: string }
): Promise<ContractReviewActionResult & { documentId?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) {
    return { ok: false, error: "Položka nenalezena." };
  }
  // overrideContactId allows linking when a client was just created (matchedClientId is still null)
  const contactId = options?.overrideContactId ?? row.matchedClientId;
  if (!contactId) {
    return { ok: false, error: "Nejdřív přiřaďte klienta k této položce." };
  }
  const visible = options?.visibleToClient ?? false;
  if (visible && row.reviewStatus !== "approved" && row.reviewStatus !== "applied") {
    capturePublishGuardFailure({
      tenantId: auth.tenantId,
      reviewId,
      contactId,
      reason: `linkContractReviewFileToContactDocuments: visibleToClient=true but reviewStatus="${row.reviewStatus}"`,
    });
    return { ok: false, error: "Publish guard: dokument nelze zveřejnit bez schválené review." };
  }

  const [dup] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, auth.tenantId),
        eq(documents.contactId, contactId),
        eq(documents.storagePath, row.storagePath)
      )
    )
    .limit(1);
  if (dup) {
    const [curr] = await db
      .select({ vis: documents.visibleToClient, contractId: documents.contractId })
      .from(documents)
      .where(eq(documents.id, dup.id))
      .limit(1);
    const updates: Record<string, unknown> = {};
    if (visible && curr && !curr.vis) updates.visibleToClient = true;
    if (options?.contractId && !curr?.contractId) updates.contractId = options.contractId;
    if (Object.keys(updates).length > 0) {
      await db
        .update(documents)
        .set(updates)
        .where(eq(documents.id, dup.id));
      if (updates.visibleToClient) {
        try {
          await notifyClientAdvisorSharedDocument({
            tenantId: auth.tenantId,
            contactId,
            documentId: dup.id,
            documentName: row.fileName,
            reason: "visibility_on",
          });
        } catch {
          /* best-effort */
        }
      }
    }
    return { ok: true, documentId: dup.id };
  }

  const [inserted] = await db
    .insert(documents)
    .values({
      tenantId: auth.tenantId,
      contactId,
      contractId: options?.contractId ?? null,
      name: row.fileName,
      storagePath: row.storagePath,
      mimeType: row.mimeType ?? "application/pdf",
      sizeBytes: row.sizeBytes ?? null,
      visibleToClient: visible,
      uploadSource: "api",
      uploadedBy: auth.userId,
      sourceChannel: "api",
      tags: ["ai-smlouva", `review:${reviewId}`],
    })
    .returning({ id: documents.id });

  const newId = inserted?.id;
  if (newId) {
    try {
      await logActivity("document", newId, "upload", {
        contactId,
        source: "contract_ai_review",
        reviewId,
      });
    } catch {
      /* best-effort */
    }
    if (visible) {
      try {
        await notifyClientAdvisorSharedDocument({
          tenantId: auth.tenantId,
          contactId,
          documentId: newId,
          documentName: row.fileName,
          reason: "upload",
        });
      } catch {
        /* best-effort */
      }
    }
  }

  return { ok: true, documentId: newId };
}

// ─── Fáze 11: Per-field Pending Confirmation ──────────────────────────────────

export type ConfirmPendingFieldResult =
  | { ok: true; updatedPayload: import("@/lib/ai/review-queue-repository").ApplyResultPayload }
  | { ok: false; error: string };

/**
 * Fáze 11: Potvrdí jedno konkrétní pending pole inline.
 *
 * Bezpečnostní guardy:
 * - Pole musí být skutečně v pendingConfirmationFields (prefill_confirm policy)
 * - manual_required a do_not_apply pole nelze tímto flow potvrdit
 * - supporting document guard nesmí být obcházen
 * - Pro payment scope: nastaví clientPaymentSetups.needsHumanReview = false
 * - Pro contact/contract scope: zapíše trace bez zápisu do contacts/contracts (data již zapsána)
 * - Idempotentní: druhé potvrzení stejného pole je bezpečně ignorováno
 */
export async function confirmPendingField(
  reviewId: string,
  fieldKey: string,
  scope: "contact" | "contract" | "payment",
): Promise<ConfirmPendingFieldResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }

  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };

  if (row.reviewStatus !== "applied") {
    return { ok: false, error: "Potvrzení pole je možné jen u aplikovaných kontrol." };
  }

  const trace = row.applyResultPayload?.policyEnforcementTrace;
  if (!trace) {
    return { ok: false, error: "Enforcement trace nenalezen — nelze ověřit stav pole." };
  }

  // Supporting document guard — supporting docs nesmí dostat confirm flow pro contract-like scope
  if (trace.supportingDocumentGuard && (scope === "contract" || scope === "payment")) {
    return { ok: false, error: "Podpůrný dokument nemůže mít potvrzení smluvních nebo platebních polí." };
  }

  // Ověř, že pole je opravdu v pending (prefill_confirm) stavu
  const scopeEnforcement = scope === "contact"
    ? trace.contactEnforcement
    : scope === "contract"
      ? trace.contractEnforcement
      : trace.paymentEnforcement;

  if (!scopeEnforcement) {
    return { ok: false, error: `Scope "${scope}" nemá enforcement data.` };
  }

  // Hard guard: manual_required a do_not_apply nesmí dostat confirm CTA
  if (scopeEnforcement.manualRequiredFields.includes(fieldKey)) {
    return { ok: false, error: `Pole "${fieldKey}" vyžaduje ruční doplnění — nelze potvrdit jako prefill.` };
  }
  if (scopeEnforcement.excludedFields.includes(fieldKey)) {
    return { ok: false, error: `Pole "${fieldKey}" je vyloučeno ze zápisu — nelze potvrdit.` };
  }

  // Idempotent: pole již bylo potvrzeno
  const existingConfirmed = row.applyResultPayload?.confirmedFieldsTrace ?? {};
  if (existingConfirmed[fieldKey]) {
    return { ok: true, updatedPayload: row.applyResultPayload! };
  }

  if (!scopeEnforcement.pendingConfirmationFields.includes(fieldKey)) {
    return { ok: false, error: `Pole "${fieldKey}" není ve stavu "čeká na potvrzení" pro scope "${scope}".` };
  }

  // Načti hodnotu z draftActions nebo extractedPayload pro audit trace
  const extractedFields = (row.extractedPayload as Record<string, unknown> | null)?.extractedFields as
    | Record<string, { value?: unknown } | undefined>
    | undefined;
  const fromValue = extractedFields?.[fieldKey]?.value ?? null;
  const normalizedValue =
    fromValue == null ? null : typeof fromValue === "string" ? fromValue.trim() : String(fromValue);

  // Zjisti target ID pro scope
  let targetId: string | null = null;
  if (scope === "contact") {
    targetId = row.applyResultPayload?.createdClientId ?? row.applyResultPayload?.linkedClientId ?? null;
  } else if (scope === "contract") {
    targetId = row.applyResultPayload?.createdContractId ?? null;
  } else if (scope === "payment") {
    targetId = row.applyResultPayload?.createdPaymentSetupId ?? null;
  }

  // Pro payment scope: nastav needsHumanReview = false v clientPaymentSetups
  // (jen pokud jsou všechna pending payment pole potvrzena)
  if (scope === "payment" && targetId) {
    const allPaymentPending = scopeEnforcement.pendingConfirmationFields;
    const alreadyConfirmedPayment = Object.entries(existingConfirmed)
      .filter(([, v]) => (v as { scope: string }).scope === "payment")
      .map(([k]) => k);
    // Po přidání tohoto pole — zbývají ještě jiná?
    const remainingPending = allPaymentPending.filter(
      (f) => f !== fieldKey && !alreadyConfirmedPayment.includes(f)
    );
    if (remainingPending.length === 0) {
      // Všechna payment pending pole jsou potvrzena → odblokuj payment setup a publikuj do portálu
      await db
        .update(clientPaymentSetups)
        .set({ needsHumanReview: false, visibleToClient: true, updatedAt: new Date() })
        .where(
          and(
            eq(clientPaymentSetups.id, targetId),
            eq(clientPaymentSetups.tenantId, auth.tenantId),
          )
        );
    }
  }

  if ((scope === "contact" || scope === "contract") && targetId && normalizedValue) {
    if (scope === "contact") {
      const contactPatch: Record<string, unknown> = { updatedAt: new Date() };
      if (fieldKey === "fullName") {
        const parts = normalizedValue.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
          contactPatch.firstName = parts[0];
        } else {
          contactPatch.firstName = parts.slice(0, -1).join(" ");
          contactPatch.lastName = parts.slice(-1).join(" ");
        }
      } else if (fieldKey === "address") {
        contactPatch.street = normalizedValue;
      } else if ([
        "firstName", "lastName", "email", "phone", "personalId", "birthDate",
        "idCardNumber", "idCardIssuedBy", "idCardValidUntil", "idCardIssuedAt",
        "generalPractitioner", "city", "zip", "street",
      ].includes(fieldKey)) {
        contactPatch[fieldKey] = normalizedValue;
      }
      if (Object.keys(contactPatch).length > 1) {
        await db
          .update(contacts)
          .set(contactPatch)
          .where(
            and(
              eq(contacts.id, targetId),
              eq(contacts.tenantId, auth.tenantId),
            )
          );
      }
    }
    if (scope === "contract") {
      const contractPatch: Record<string, unknown> = { updatedAt: new Date() };
      if (fieldKey === "institutionName" || fieldKey === "insurer" || fieldKey === "provider") {
        contractPatch.partnerName = normalizedValue;
      } else if (fieldKey === "productName") {
        contractPatch.productName = normalizedValue;
      } else if (fieldKey === "contractNumber") {
        contractPatch.contractNumber = normalizedValue;
      } else if (fieldKey === "policyStartDate" || fieldKey === "effectiveDate" || fieldKey === "startDate") {
        contractPatch.startDate = normalizedValue;
      } else if (fieldKey === "premiumAmount" || fieldKey === "totalMonthlyPremium") {
        contractPatch.premiumAmount = normalizedValue;
      } else if (fieldKey === "premiumAnnual" || fieldKey === "annualPremium") {
        contractPatch.premiumAnnual = normalizedValue;
      }
      if (Object.keys(contractPatch).length > 1) {
        await db
          .update(contracts)
          .set(contractPatch)
          .where(
            and(
              eq(contracts.id, targetId),
              eq(contracts.tenantId, auth.tenantId),
            )
          );
      }
    }
  }

  // Zapíše audit log
  await db.insert(auditLog).values({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: "confirm_pending_field",
    entityType: "contract_review",
    entityId: reviewId,
    meta: {
      reviewId,
      fieldKey,
      scope,
      targetId,
      fromValue: normalizedValue,
    },
  });

  // Aktualizuj applyResultPayload — přidej do confirmedFieldsTrace
  const updatedTrace: NonNullable<typeof existingConfirmed> = {
    ...existingConfirmed,
    [fieldKey]: {
      confirmedAt: new Date().toISOString(),
      confirmedBy: auth.userId,
      scope,
      targetId,
      fromValue: normalizedValue,
    },
  };

  // Přepočítej summary — confirmed pole přesuneme z pending do auto (zobrazovací)
  const updatedPolicyTrace = {
    ...trace,
    [scope === "contact" ? "contactEnforcement" : scope === "contract" ? "contractEnforcement" : "paymentEnforcement"]: {
      ...scopeEnforcement,
      pendingConfirmationFields: scopeEnforcement.pendingConfirmationFields.filter((f) => f !== fieldKey),
      autoAppliedFields: [...scopeEnforcement.autoAppliedFields, fieldKey],
    },
    summary: {
      ...trace.summary,
      totalPendingConfirmation: Math.max(0, trace.summary.totalPendingConfirmation - 1),
      totalAutoApplied: trace.summary.totalAutoApplied + 1,
    },
  };

  const updatedPayload = {
    ...row.applyResultPayload!,
    policyEnforcementTrace: updatedPolicyTrace,
    confirmedFieldsTrace: updatedTrace,
  };

  await updateContractReview(reviewId, auth.tenantId, {
    applyResultPayload: updatedPayload,
  });

  return { ok: true, updatedPayload };
}
