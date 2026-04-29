"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import type { TenantContextDb } from "@/lib/db/with-tenant-context";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getContractReviewById,
  updateContractReview,
  saveContractCorrection,
} from "@/lib/ai/review-queue-repository";
import type { ContractReviewRow } from "@/lib/ai/review-queue-repository";
import { mergeFieldEditsIntoExtractedPayload } from "@/lib/ai-review/mappers";
import { buildManualCorrectionEventInput } from "@/lib/ai/ai-review-correction-events";
import { createDraftCorrectionEvent } from "@/lib/ai/ai-review-learning-repository";
import { handleAiReviewApprovalLearning } from "@/lib/ai/ai-review-approval-learning";
import { runAiReviewDeterministicValidators } from "@/lib/ai/ai-review-contract-validator";
import { applyContractReview } from "@/lib/ai/apply-contract-review";
import { isSupportingDocumentOnly } from "@/lib/ai/apply-policy-enforcement";
import { mapContractReviewToBridgePayload, computePublishOutcome } from "@/lib/ai/write-through-contract";
import { mapDocumentLinkWarningToApplyWarning } from "@/lib/ai/apply-warning-mapper";
import { tryBuildPaymentSetupDraftFromRawPayload } from "@/lib/ai/draft-actions";
import { resolveSegmentForContractApply } from "@/lib/ai/apply-contract-review";
import {
  breadcrumbContractReviewPaymentGate,
  captureContractReviewApplyFailure,
} from "@/lib/observability/contract-review-sentry";
import { capturePublishGuardFailure } from "@/lib/observability/portal-sentry";
import * as Sentry from "@sentry/nextjs";
import { logActivity } from "./activity";
import { contacts, documents, contracts, clientPaymentSetups, auditLog } from "db";
import { eq, and } from "db";
import { notifyClientAdvisorSharedDocument } from "@/lib/documents/notify-client-visible-document";

export type ContractReviewActionResult =
  | {
      ok: true;
      payload?: import("@/lib/ai/review-queue-repository").ApplyResultPayload;
      /**
       * Non-fatal post-commit warning the UI MUST display. Apply succeeded
       * (CRM tx committed) but a downstream step (e.g. reviewStatus persist)
       * failed. Shown as a banner so user does not see a plain "Uloženo" toast.
       */
      warning?: { code: string; message: string };
    }
  | { ok: false; error: string; blockedReasons?: string[] };

export type TrackContractReviewFieldCorrectionResult =
  | { ok: true; created: boolean; fieldPath?: string; correctionEventId?: string }
  | { ok: false; error: string };

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

/**
 * F0-3 (C-04): Reason-y, které ani advisor-confirmed apply NESMÍ override-nout.
 * Tyto gate-y indikují strukturální fail (AI neklasifikovala, pipeline failed,
 * klient match je dvojsmyslný) — nejsou to warning/confidence kategorie, ale
 * tvrdé bloky. Pokud se dostanou do pendingApply, apply musí failnout.
 */
const UNOVERRIDABLE_GATE_REASONS = new Set<string>([
  "LOW_CLASSIFICATION_CONFIDENCE",
  "PIPELINE_FAILED_STEP",
  "LLM_CLIENT_MATCH_AMBIGUOUS",
]);

function canResolveClientBeforeApply(reviewStatus: string | null): boolean {
  return reviewStatus === null || reviewStatus === "pending" || reviewStatus === "approved";
}

function canTrackDraftCorrection(reviewStatus: string | null): boolean {
  return reviewStatus === null || reviewStatus === "pending" || reviewStatus === "approved";
}

export async function trackContractReviewFieldCorrection(
  id: string,
  input: {
    fieldId: string;
    correctedValue: unknown;
    fieldPath?: string | null;
    fieldLabel?: string | null;
    originalAiValue?: unknown;
    sourcePage?: number | null;
    evidenceSnippet?: string | null;
  }
): Promise<TrackContractReviewFieldCorrectionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }

  const row = await getContractReviewById(id, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };
  if (!canTrackDraftCorrection(row.reviewStatus ?? null)) {
    return { ok: false, error: "Ruční opravy lze evidovat jen před dokončením revize." };
  }

  const eventInput = buildManualCorrectionEventInput(row, {
    fieldId: input.fieldId,
    fieldPath: input.fieldPath,
    fieldLabel: input.fieldLabel,
    originalAiValue: input.originalAiValue,
    correctedValue: input.correctedValue,
    sourcePage: input.sourcePage,
    evidenceSnippet: input.evidenceSnippet,
    createdBy: auth.userId,
  });
  if (!eventInput) return { ok: true, created: false };

  const correctionEventId = await createDraftCorrectionEvent(eventInput);
  return {
    ok: true,
    created: true,
    fieldPath: eventInput.fieldPath,
    correctionEventId,
  };
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
  let expectedOutputJson: unknown = row.extractedPayload ?? {};
  if (raw && Object.keys(edits).length > 0) {
    const { merged, correctedFields } = mergeFieldEditsIntoExtractedPayload(raw, edits);
    if (merged.documentClassification && merged.extractedFields) {
      runAiReviewDeterministicValidators(merged as unknown as import("@/lib/ai/document-review-types").DocumentReviewEnvelope, row.userDeclaredDocumentIntent, "");
    }
    expectedOutputJson = merged;
    if (correctedFields.length > 0) {
      await saveContractCorrection(id, auth.tenantId, {
        correctedPayload: merged,
        correctedFields,
        correctedBy: auth.userId,
        correctionReason: options?.correctionReason?.trim() || null,
      });
    }
  }

  const reviewedAt = new Date();
  await updateContractReview(id, auth.tenantId, {
    reviewStatus: "approved",
    reviewedBy: auth.userId,
    reviewedAt,
    rejectReason: null,
  });
  await handleAiReviewApprovalLearning({
    tenantId: auth.tenantId,
    reviewId: id,
    acceptedAt: reviewedAt,
    expectedOutputJson,
  }).catch((error) => {
    console.warn("[contract-review] approval learning hook failed", {
      reviewId: id,
      error: error instanceof Error ? error.message : String(error),
    });
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
  const contact = await withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, clientId), eq(contacts.tenantId, auth.tenantId)))
      .limit(1);
    return row ?? null;
  });
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

export async function persistManualReviewWarningState(
  reviewId: string,
  warningText: string,
  state: "confirmed" | "ignored"
): Promise<ContractReviewActionResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };
  if (row.reviewStatus === "applied") return { ok: true };

  const clean = warningText.trim().replace(/\s+/g, " ");
  if (!clean) return { ok: false, error: "Chybí text kontroly." };

  const existing = Array.isArray(row.ignoredWarnings) ? (row.ignoredWarnings as string[]) : [];
  const confirmedKey = `manual_review:confirmed:${clean}`;
  const ignoredKey = `manual_review:ignored:${clean}`;
  const next = existing.filter((item) => item !== confirmedKey && item !== ignoredKey);
  next.push(state === "confirmed" ? confirmedKey : ignoredKey);
  await updateContractReview(reviewId, auth.tenantId, {
    ignoredWarnings: Array.from(new Set(next)),
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

  // F0-3 (C-04): Hard blok pro supporting dokumenty (payslip, tax return,
  // bank statement, atd.). Tyto dokumenty nesmí vytvořit smlouvu/contract
  // apply ani když advisor klikl Approve. Bypass přes explicitní
  // `overrideReason` je ponechaný jako emergency path (audit-logován níže).
  const supportingPayload =
    rawRow.extractedPayload && typeof rawRow.extractedPayload === "object"
      ? (rawRow.extractedPayload as Record<string, unknown>)
      : null;
  if (
    supportingPayload &&
    isSupportingDocumentOnly(supportingPayload) &&
    !options?.overrideReason
  ) {
    breadcrumbContractReviewPaymentGate({
      reviewId: id,
      blockedReasons: ["SUPPORTING_DOCUMENT_ONLY"],
      hadOverride: false,
    });
    return {
      ok: false,
      error:
        "Podpůrný dokument (např. mzdový list, daňové přiznání, výpis z účtu) nelze publikovat jako smlouvu. Nahrajte správný typ dokumentu nebo kontaktujte support.",
      blockedReasons: ["SUPPORTING_DOCUMENT_ONLY"],
    };
  }

  const row = injectContractDraftActionIfMissing(regeneratePaymentDraftActions(rawRow));

  const { evaluateApplyReadiness, applyReasonsPendingOverride } = await import("@/lib/ai/quality-gates");
  const gate = evaluateApplyReadiness(row);
  const pendingApply = applyReasonsPendingOverride(gate);
  if (pendingApply.length > 0) {
    // F0-3 (C-04): hard-block důvody, které NIKDO nesmí override-nout, jdou
    // first — nezávisle na tom, zda je advisor-confirmed apply.
    const hardBlocks = pendingApply.filter((r) => UNOVERRIDABLE_GATE_REASONS.has(r));
    if (hardBlocks.length > 0) {
      breadcrumbContractReviewPaymentGate({
        reviewId: id,
        blockedReasons: hardBlocks,
        hadOverride: false,
      });
      return {
        ok: false,
        error: `Kritické důvody blokování nelze přeskočit: ${hardBlocks.join(", ")}`,
        blockedReasons: hardBlocks,
      };
    }
    const dbIgnored = Array.isArray(rawRow.ignoredWarnings) ? (rawRow.ignoredWarnings as string[]) : [];
    const explicitOverrides = options?.overrideGateReasons ?? [];
    // Advisor-confirmed flow: when advisor approved the review, auto-override all
    // publishability/proposal/payment gate reasons EXCEPT hard-blocks above.
    // The advisor takes responsibility for the rest.
    const isAdvisorConfirmedApply = rawRow.reviewStatus === "approved";
    const advisorOverridableReasons = pendingApply.filter(
      (r) => !UNOVERRIDABLE_GATE_REASONS.has(r),
    );
    const overrides = isAdvisorConfirmedApply
      ? Array.from(new Set([...advisorOverridableReasons, ...explicitOverrides, ...dbIgnored]))
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
      // Apply proběhl úspěšně (CRM tx committed), ale reviewStatus persist HARD-FAIL.
      // Vracíme ok:true (abychom nespustili retry, který by ztratil idempotenci apply)
      // ALE s machine-readable warningem — UI MUSÍ zobrazit, že stav záznamu je
      // rozbitý, ne plnohodnotné „Uloženo". Bez toho = false-success.
      return {
        ok: true,
        payload: bridgedPayload,
        warning: {
          code: "review_status_persist_failed",
          message:
            "Zápis do CRM proběhl, ale stav záznamu se nepodařilo uložit. Kontaktujte support — technický tým byl upozorněn.",
        },
      };
    }
  }

  // effectiveClientId: prefer matchedClientId, fallback na createdClientId / linkedClientId
  const effectiveClientId =
    row.matchedClientId ??
    result.payload.createdClientId ??
    result.payload.linkedClientId ??
    null;

  // FL-1 — canonical transaction: coverage + document link jsou v apply tx.
  // Post-commit zbývá jen:
  //   1. notifikace klienta (při nově zveřejněném dokumentu),
  //   2. activity log pro nově vložený document,
  //   3. fallback link pro supporting-doc case (bez createdContractId).
  const inTxPayload = result.payload as Record<string, unknown>;
  const inTxDocumentId = typeof inTxPayload.linkedDocumentId === "string" ? inTxPayload.linkedDocumentId : null;
  const inTxDocLinkWasInsert = inTxPayload.__docLinkWasInsert === true;
  const inTxVisibilityOn = inTxPayload.__docLinkVisibilityOn === true;
  delete inTxPayload.__docLinkWasInsert;
  delete inTxPayload.__docLinkVisibilityOn;

  if (inTxDocumentId) {
    bridgedPayload.linkedDocumentId = inTxDocumentId;

    if (inTxDocLinkWasInsert) {
      try {
        await logActivity("document", inTxDocumentId, "upload", {
          contactId: effectiveClientId,
          source: "contract_ai_review",
          reviewId: id,
        });
      } catch {
        /* best-effort */
      }
    }

    if (inTxVisibilityOn || inTxDocLinkWasInsert) {
      try {
        await notifyClientAdvisorSharedDocument({
          tenantId: auth.tenantId,
          contactId: effectiveClientId!,
          documentId: inTxDocumentId,
          documentName: row.fileName,
          reason: inTxVisibilityOn ? "visibility_on" : "upload",
        });
      } catch {
        /* best-effort */
      }
    }
  } else if (effectiveClientId && !result.payload.createdContractId) {
    // Supporting-doc path (žádný contract se nevytvořil) — link ven z tx přes
    // plnohodnotný server action, protože se nedotýká coverage. SOFT fail, aby
    // neodpustil apply toho, co v tx už sedne.
    try {
      const linkResult = await linkContractReviewFileToContactDocuments(id, {
        visibleToClient: true,
        contractId: undefined,
        overrideContactId: row.matchedClientId ? undefined : effectiveClientId,
      });
      if (linkResult.ok && linkResult.documentId) {
        bridgedPayload.linkedDocumentId = linkResult.documentId;
      } else if (!linkResult.ok) {
        (bridgedPayload as Record<string, unknown>).documentLinkWarning =
          linkResult.error ?? "document_link_failed";
      }
    } catch (linkErr) {
      (bridgedPayload as Record<string, unknown>).documentLinkWarning = "document_link_exception";
      try {
        Sentry.withScope((scope) => {
          scope.setTag("feature", "contract_review_apply");
          scope.setTag("post_commit_step", "document_linking_supporting");
          scope.setTag("severity", "soft_fail");
          scope.setContext("apply_post_commit", {
            reviewId: id,
            tenantId: auth.tenantId,
            error: linkErr instanceof Error ? linkErr.message.slice(0, 1000) : String(linkErr),
          });
          Sentry.captureMessage(
            `[SOFT] apply_document_linking_failed: ${linkErr instanceof Error ? linkErr.message.slice(0, 150) : "unknown"}`,
            "warning",
          );
        });
      } catch {
        /* noop */
      }
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

  // P2-S1: surface attach-only silent-fail as a toast warning. Without this,
  // apply returned ok=true + generic "Údaje propsány do Aidvisory" toast while
  // the document was silently left unlinked. The `documentLinkWarning` badge in
  // AIReviewExtractionShell is not enough — advisor must see an immediate
  // error-style toast on apply.
  //
  // Mapping is kept in `apply-warning-mapper.ts` so it can be unit-tested
  // without "use server" boundary mocking, and so all warning codes share
  // one canonical Czech copy.
  const applyWarning = mapDocumentLinkWarningToApplyWarning(
    bridgedPayload.documentLinkWarning ?? null
  );

  if (applyWarning) {
    return { ok: true, payload: bridgedPayload, warning: applyWarning };
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

  const linkResult = await withTenantContextFromAuth(auth, async (tx) => {
    const [dup] = await tx
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
      const [curr] = await tx
        .select({ vis: documents.visibleToClient, contractId: documents.contractId })
        .from(documents)
        .where(eq(documents.id, dup.id))
        .limit(1);
      const updates: Record<string, unknown> = {};
      if (visible && curr && !curr.vis) updates.visibleToClient = true;
      if (options?.contractId && !curr?.contractId) updates.contractId = options.contractId;
      if (Object.keys(updates).length > 0) {
        await tx
          .update(documents)
          .set(updates)
          .where(eq(documents.id, dup.id));
      }
      return {
        kind: "dup" as const,
        id: dup.id,
        notifyVisibility: Boolean(updates.visibleToClient),
      };
    }

    const [inserted] = await tx
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

    return { kind: "new" as const, id: inserted?.id ?? null };
  });

  if (linkResult.kind === "dup") {
    if (linkResult.notifyVisibility) {
      try {
        await notifyClientAdvisorSharedDocument({
          tenantId: auth.tenantId,
          contactId,
          documentId: linkResult.id,
          documentName: row.fileName,
          reason: "visibility_on",
        });
      } catch {
        /* best-effort */
      }
    }
    return { ok: true, documentId: linkResult.id };
  }

  const newId = linkResult.id;
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

/**
 * Shared CRM writer used by both per-field confirm and bulk "Potvrdit vše"
 * flows. Writes the normalized field value into the matching column in
 * contacts / contracts based on scope + fieldKey. Payment-scope writes and
 * needsHumanReview flip are handled by the callers (idempotent rules differ).
 */
async function applyConfirmationCrmWrite(
  tx: TenantContextDb,
  tenantId: string,
  scope: "contact" | "contract" | "payment",
  targetId: string | null,
  fieldKey: string,
  normalizedValue: string | null,
): Promise<void> {
  if (!targetId || !normalizedValue) return;
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
      await tx
        .update(contacts)
        .set(contactPatch)
        .where(and(eq(contacts.id, targetId), eq(contacts.tenantId, tenantId)));
    }
    return;
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
      await tx
        .update(contracts)
        .set(contractPatch)
        .where(and(eq(contracts.id, targetId), eq(contracts.tenantId, tenantId)));
    }
  }
}

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

  await withTenantContextFromAuth(auth, async (tx) => {
    // Pro payment scope: nastav needsHumanReview = false v clientPaymentSetups
    // (jen pokud jsou všechna pending payment pole potvrzena)
    if (scope === "payment" && targetId) {
      const allPaymentPending = scopeEnforcement.pendingConfirmationFields;
      const alreadyConfirmedPayment = Object.entries(existingConfirmed)
        .filter(([, v]) => (v as { scope: string }).scope === "payment")
        .map(([k]) => k);
      const remainingPending = allPaymentPending.filter(
        (f) => f !== fieldKey && !alreadyConfirmedPayment.includes(f)
      );
      if (remainingPending.length === 0) {
        await tx
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
      await applyConfirmationCrmWrite(tx, auth.tenantId, scope, targetId, fieldKey, normalizedValue);
    }

    await tx.insert(auditLog).values({
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

export type AcknowledgeContactMergeConflictsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Trvalé skrytí banneru „AI přinesla odlišnou hodnotu / manuální má přednost“ na detailu kontaktu.
 * Nezapisuje extrahovanou hodnotu do CRM — jen audit + značka v applyResultPayload.
 */
export async function acknowledgeContactMergeConflicts(
  reviewId: string,
  fieldKeys: string[],
): Promise<AcknowledgeContactMergeConflictsResult> {
  const auth = await requireAuthInAction();
  const canWrite =
    hasPermission(auth.roleName, "documents:write") ||
    hasPermission(auth.roleName, "contacts:write");
  if (!canWrite) {
    return { ok: false, error: "Nemáte oprávnění." };
  }

  const uniqueKeys = Array.from(new Set(fieldKeys.map((k) => k.trim()).filter(Boolean)));
  if (uniqueKeys.length === 0) {
    return { ok: false, error: "Chybí pole k potvrzení." };
  }

  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) {
    return { ok: false, error: "Kontrola dokumentu nenalezena." };
  }
  if (row.reviewStatus !== "applied") {
    return { ok: false, error: "Potvrzení je možné jen u aplikovaných kontrol." };
  }

  const payload = row.applyResultPayload;
  if (!payload) {
    return { ok: false, error: "Chybí výsledek aplikace kontroly." };
  }

  const rawMerge = payload.pendingFields ?? [];
  const byKey = new Map(rawMerge.map((e) => [e.fieldKey, e]));

  const existingAck = payload.mergeConflictAcknowledgedTrace ?? {};
  const nextAck = { ...existingAck };
  let changed = false;

  for (const key of uniqueKeys) {
    const entry = byKey.get(key);
    if (!entry) {
      return {
        ok: false,
        error: "Toto upozornění už není aktuální — obnovte stránku.",
      };
    }
    if (entry.reason !== "manual_protected") {
      return {
        ok: false,
        error: `Pole „${key}“ nelze jen přečíst — vyžaduje ruční doplnění nebo úpravu v CRM.`,
      };
    }
    if (!nextAck[key]) {
      nextAck[key] = {
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: auth.userId,
        reason: "manual_protected",
      };
      changed = true;
    }
  }

  if (!changed) {
    return { ok: true };
  }

  await withTenantContextFromAuth(auth, async (tx) => {
    await tx.insert(auditLog).values({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "acknowledge_contact_merge_conflict",
      entityType: "contract_review",
      entityId: reviewId,
      meta: {
        reviewId,
        fieldKeys: uniqueKeys,
      },
    });
  });

  await updateContractReview(reviewId, auth.tenantId, {
    applyResultPayload: {
      ...payload,
      mergeConflictAcknowledgedTrace: nextAck,
    },
  });

  return { ok: true };
}

// ─── Fáze 12: Ruční doplnění manual_required pole ─────────────────────────────

export type ConfirmManualFieldResult =
  | { ok: true; updatedPayload: import("@/lib/ai/review-queue-repository").ApplyResultPayload }
  | { ok: false; error: string };

/**
 * Potvrdí manuálně zadanou hodnotu pro manual_required pole.
 *
 * Na rozdíl od confirmPendingField:
 * - Přijme hodnotu zadanou poradcem (value param)
 * - Zapíše ji přímo do contacts/contracts/client_payment_setups
 * - Přesune pole z manualRequiredFields do autoAppliedFields v trace
 * - Idempotentní: opakované volání se stejnou nebo novou hodnotou je bezpečné
 */
export async function confirmManualField(
  reviewId: string,
  fieldKey: string,
  scope: "contact" | "contract" | "payment",
  value: string,
): Promise<ConfirmManualFieldResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }

  const trimmedValue = value?.trim() ?? "";
  if (!trimmedValue) {
    return { ok: false, error: "Hodnota nesmí být prázdná." };
  }

  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };

  if (row.reviewStatus !== "applied") {
    return { ok: false, error: "Ruční doplnění je možné jen u aplikovaných kontrol." };
  }

  const trace = row.applyResultPayload?.policyEnforcementTrace;
  if (!trace) {
    return { ok: false, error: "Enforcement trace nenalezen — nelze ověřit stav pole." };
  }

  if (trace.supportingDocumentGuard && (scope === "contract" || scope === "payment")) {
    return { ok: false, error: "Podpůrný dokument nemůže mít potvrzení smluvních nebo platebních polí." };
  }

  const scopeEnforcement = scope === "contact"
    ? trace.contactEnforcement
    : scope === "contract"
      ? trace.contractEnforcement
      : trace.paymentEnforcement;

  if (!scopeEnforcement) {
    return { ok: false, error: `Scope "${scope}" nemá enforcement data.` };
  }

  if (!scopeEnforcement.manualRequiredFields.includes(fieldKey)) {
    return { ok: false, error: `Pole "${fieldKey}" není ve stavu "vyžaduje ruční doplnění" pro scope "${scope}".` };
  }

  // Zjisti target ID pro scope
  let targetId: string | null = null;
  if (scope === "contact") {
    targetId = row.applyResultPayload?.createdClientId ?? row.applyResultPayload?.linkedClientId ?? null;
  } else if (scope === "contract") {
    targetId = row.applyResultPayload?.createdContractId ?? null;
  } else if (scope === "payment") {
    targetId = row.applyResultPayload?.createdPaymentSetupId ?? null;
  }

  await withTenantContextFromAuth(auth, async (tx) => {
    if (targetId) {
      if (scope === "contact") {
        const contactPatch: Record<string, unknown> = { updatedAt: new Date() };
        if (fieldKey === "fullName") {
          const parts = trimmedValue.split(/\s+/).filter(Boolean);
          if (parts.length === 1) {
            contactPatch.firstName = parts[0];
          } else {
            contactPatch.firstName = parts.slice(0, -1).join(" ");
            contactPatch.lastName = parts.slice(-1).join(" ");
          }
        } else if (fieldKey === "address") {
          contactPatch.street = trimmedValue;
        } else if ([
          "firstName", "lastName", "email", "phone", "personalId", "birthDate",
          "idCardNumber", "idCardIssuedBy", "idCardValidUntil", "idCardIssuedAt",
          "generalPractitioner", "city", "zip", "street",
        ].includes(fieldKey)) {
          contactPatch[fieldKey] = trimmedValue;
        }
        if (Object.keys(contactPatch).length > 1) {
          await tx
            .update(contacts)
            .set(contactPatch)
            .where(and(eq(contacts.id, targetId), eq(contacts.tenantId, auth.tenantId)));
        }
      }

      if (scope === "contract") {
        const contractPatch: Record<string, unknown> = { updatedAt: new Date() };
        if (fieldKey === "institutionName" || fieldKey === "insurer" || fieldKey === "provider") {
          contractPatch.partnerName = trimmedValue;
        } else if (fieldKey === "productName") {
          contractPatch.productName = trimmedValue;
        } else if (fieldKey === "contractNumber") {
          contractPatch.contractNumber = trimmedValue;
        } else if (fieldKey === "policyStartDate" || fieldKey === "effectiveDate" || fieldKey === "startDate") {
          contractPatch.startDate = trimmedValue;
        } else if (fieldKey === "premiumAmount" || fieldKey === "totalMonthlyPremium") {
          contractPatch.premiumAmount = trimmedValue;
        } else if (fieldKey === "premiumAnnual" || fieldKey === "annualPremium") {
          contractPatch.premiumAnnual = trimmedValue;
        }
        if (Object.keys(contractPatch).length > 1) {
          await tx
            .update(contracts)
            .set(contractPatch)
            .where(and(eq(contracts.id, targetId), eq(contracts.tenantId, auth.tenantId)));
        }
      }

      if (scope === "payment") {
        const paymentPatch: Record<string, unknown> = { updatedAt: new Date() };
        if (fieldKey === "variableSymbol" || fieldKey === "vs") {
          paymentPatch.variableSymbol = trimmedValue;
        } else if (fieldKey === "iban" || fieldKey === "accountNumber") {
          paymentPatch.iban = trimmedValue;
        } else if (fieldKey === "paymentAmount" || fieldKey === "monthlyPremium" || fieldKey === "premiumAmount") {
          paymentPatch.amount = trimmedValue;
        } else if (fieldKey === "paymentFrequency" || fieldKey === "frequency") {
          paymentPatch.frequency = trimmedValue;
        }
        if (Object.keys(paymentPatch).length > 1) {
          await tx
            .update(clientPaymentSetups)
            .set(paymentPatch)
            .where(and(eq(clientPaymentSetups.id, targetId), eq(clientPaymentSetups.tenantId, auth.tenantId)));
        }

        const existingConfirmedPayment = row.applyResultPayload?.confirmedFieldsTrace ?? {};
        const alreadyConfirmedManual = Object.keys(existingConfirmedPayment).filter(
          (k) => (existingConfirmedPayment[k] as { scope: string })?.scope === "payment" &&
            scopeEnforcement.manualRequiredFields.includes(k)
        );
        const remainingManual = scopeEnforcement.manualRequiredFields.filter(
          (f) => f !== fieldKey && !alreadyConfirmedManual.includes(f)
        );
        const allPaymentPendingConfirmed = (scopeEnforcement.pendingConfirmationFields ?? []).every(
          (f) => existingConfirmedPayment[f]
        );
        if (remainingManual.length === 0 && allPaymentPendingConfirmed) {
          await tx
            .update(clientPaymentSetups)
            .set({ needsHumanReview: false, visibleToClient: true, updatedAt: new Date() })
            .where(and(eq(clientPaymentSetups.id, targetId), eq(clientPaymentSetups.tenantId, auth.tenantId)));
        }
      }
    }

    await tx.insert(auditLog).values({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "confirm_manual_field",
      entityType: "contract_review",
      entityId: reviewId,
      meta: { reviewId, fieldKey, scope, targetId, value: trimmedValue },
    });
  });

  // Aktualizuj trace — přesuň pole z manualRequiredFields do autoAppliedFields
  const existingConfirmed = row.applyResultPayload?.confirmedFieldsTrace ?? {};
  const updatedTrace = {
    ...existingConfirmed,
    [fieldKey]: {
      confirmedAt: new Date().toISOString(),
      confirmedBy: auth.userId,
      scope,
      targetId,
      fromValue: trimmedValue,
      source: "manual_fill" as const,
    },
  };

  const updatedPolicyTrace = {
    ...trace,
    [scope === "contact" ? "contactEnforcement" : scope === "contract" ? "contractEnforcement" : "paymentEnforcement"]: {
      ...scopeEnforcement,
      manualRequiredFields: scopeEnforcement.manualRequiredFields.filter((f) => f !== fieldKey),
      autoAppliedFields: [...scopeEnforcement.autoAppliedFields, fieldKey],
    },
    summary: {
      ...trace.summary,
      totalManualRequired: Math.max(0, (trace.summary.totalManualRequired ?? 0) - 1),
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

// ─── Fáze 12b: Bulk potvrzení všech prefill_confirm (pending) polí ─────────────

export type ConfirmAllPendingFieldsResult =
  | { ok: true; confirmedCount: number; updatedPayload: import("@/lib/ai/review-queue-repository").ApplyResultPayload }
  | { ok: false; error: string };

/**
 * Potvrdí všechna prefill_confirm pole (pendingConfirmationFields) najednou.
 * Ekvivalent opakování confirmPendingField pro každé pole.
 */
export async function confirmAllPendingFields(
  reviewId: string,
): Promise<ConfirmAllPendingFieldsResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }

  const row = await getContractReviewById(reviewId, auth.tenantId);
  if (!row) return { ok: false, error: "Položka nenalezena." };

  if (row.reviewStatus !== "applied") {
    return { ok: false, error: "Potvrzení polí je možné jen u aplikovaných kontrol." };
  }

  const trace = row.applyResultPayload?.policyEnforcementTrace;
  if (!trace) {
    return { ok: false, error: "Enforcement trace nenalezen." };
  }

  const scopeKeys: Array<{ scope: "contact" | "contract" | "payment"; enforcement: typeof trace.contactEnforcement }> = [
    { scope: "contact", enforcement: trace.contactEnforcement },
    { scope: "contract", enforcement: trace.contractEnforcement },
    { scope: "payment", enforcement: trace.paymentEnforcement },
  ];

  const existingConfirmed = row.applyResultPayload?.confirmedFieldsTrace ?? {};
  let updatedTrace = { ...existingConfirmed };
  let updatedPolicyTrace = { ...trace };
  let confirmedCount = 0;

  await withTenantContextFromAuth(auth, async (tx) => {
    for (const { scope, enforcement } of scopeKeys) {
      if (!enforcement) continue;
      if (trace.supportingDocumentGuard && (scope === "contract" || scope === "payment")) continue;

      let targetId: string | null = null;
      if (scope === "contact") {
        targetId = row.applyResultPayload?.createdClientId ?? row.applyResultPayload?.linkedClientId ?? null;
      } else if (scope === "contract") {
        targetId = row.applyResultPayload?.createdContractId ?? null;
      } else if (scope === "payment") {
        targetId = row.applyResultPayload?.createdPaymentSetupId ?? null;
      }

      const pendingFields = enforcement.pendingConfirmationFields.filter((f) => !updatedTrace[f]);

      for (const fieldKey of pendingFields) {
        const extractedFields = (row.extractedPayload as Record<string, unknown> | null)?.extractedFields as
          | Record<string, { value?: unknown } | undefined>
          | undefined;
        const fromValue = extractedFields?.[fieldKey]?.value ?? null;
        const normalizedValue =
          fromValue == null ? null : typeof fromValue === "string" ? fromValue.trim() : String(fromValue);

        if ((scope === "contact" || scope === "contract") && targetId && normalizedValue) {
          await applyConfirmationCrmWrite(tx, auth.tenantId, scope, targetId, fieldKey, normalizedValue);
        }

        updatedTrace = {
          ...updatedTrace,
          [fieldKey]: {
            confirmedAt: new Date().toISOString(),
            confirmedBy: auth.userId,
            scope,
            targetId,
            fromValue: normalizedValue,
          },
        };
        confirmedCount++;
      }

      if (pendingFields.length > 0) {
        const enforcementKey = scope === "contact" ? "contactEnforcement" : scope === "contract" ? "contractEnforcement" : "paymentEnforcement";
        updatedPolicyTrace = {
          ...updatedPolicyTrace,
          [enforcementKey]: {
            ...enforcement,
            pendingConfirmationFields: enforcement.pendingConfirmationFields.filter((f) => !updatedTrace[f]),
            autoAppliedFields: [...enforcement.autoAppliedFields, ...pendingFields],
          },
        };

        if (scope === "payment" && targetId) {
          await tx
            .update(clientPaymentSetups)
            .set({ needsHumanReview: false, visibleToClient: true, updatedAt: new Date() })
            .where(and(eq(clientPaymentSetups.id, targetId), eq(clientPaymentSetups.tenantId, auth.tenantId)));
        }
      }
    }

    if (confirmedCount > 0) {
      const totalPending = Object.values(updatedPolicyTrace).reduce((acc, v) => {
        if (v && typeof v === "object" && "pendingConfirmationFields" in v) {
          return acc + (v as { pendingConfirmationFields: string[] }).pendingConfirmationFields.length;
        }
        return acc;
      }, 0);

      updatedPolicyTrace = {
        ...updatedPolicyTrace,
        summary: {
          ...trace.summary,
          totalPendingConfirmation: totalPending,
          totalAutoApplied: trace.summary.totalAutoApplied + confirmedCount,
        },
      };

      await tx.insert(auditLog).values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        action: "confirm_all_pending_fields",
        entityType: "contract_review",
        entityId: reviewId,
        meta: { reviewId, confirmedCount },
      });
    }
  });

  if (confirmedCount === 0) {
    return {
      ok: true,
      confirmedCount: 0,
      updatedPayload: row.applyResultPayload!,
    };
  }

  const updatedPayload = {
    ...row.applyResultPayload!,
    policyEnforcementTrace: updatedPolicyTrace,
    confirmedFieldsTrace: updatedTrace,
  };

  await updateContractReview(reviewId, auth.tenantId, {
    applyResultPayload: updatedPayload,
  });

  return { ok: true, confirmedCount, updatedPayload };
}
