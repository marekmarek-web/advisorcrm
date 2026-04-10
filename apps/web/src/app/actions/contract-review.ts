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
import { mapContractReviewToBridgePayload } from "@/lib/ai/contracts-analyses-bridge";
import { tryBuildPaymentSetupDraftFromRawPayload } from "@/lib/ai/draft-actions";
import {
  breadcrumbContractReviewPaymentGate,
  captureContractReviewApplyFailure,
} from "@/lib/observability/contract-review-sentry";
import { capturePublishGuardFailure } from "@/lib/observability/portal-sentry";
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

  const row = regeneratePaymentDraftActions(rawRow);

  const { evaluateApplyReadiness, applyReasonsPendingOverride } = await import("@/lib/ai/quality-gates");
  const gate = evaluateApplyReadiness(row);
  const pendingApply = applyReasonsPendingOverride(gate);
  if (pendingApply.length > 0) {
    // Merge explicit overrides from call site + persisted ignoredWarnings from DB
    const dbIgnored = Array.isArray(rawRow.ignoredWarnings) ? (rawRow.ignoredWarnings as string[]) : [];
    const overrides = Array.from(new Set([...(options?.overrideGateReasons ?? []), ...dbIgnored]));
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
          overrideReason: options?.overrideReason ?? null,
        },
      }).catch(() => {});
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

  const bridgedPayload = mapContractReviewToBridgePayload({
    review: row,
    payload: result.payload,
  });

  await updateContractReview(id, auth.tenantId, {
    reviewStatus: "applied",
    appliedBy: auth.userId,
    appliedAt: new Date(),
    applyResultPayload: bridgedPayload,
  });

  // 5D: Auto-link the reviewed document into the client's document vault (visible)
  // effectiveClientId: prefer matchedClientId, fallback to createdClientId / linkedClientId from apply result
  const effectiveClientId =
    row.matchedClientId ??
    result.payload.createdClientId ??
    result.payload.linkedClientId ??
    null;
  if (effectiveClientId) {
    try {
      const linkResult = await linkContractReviewFileToContactDocuments(id, {
        visibleToClient: true,
        contractId: result.payload.createdContractId ?? undefined,
        // When client was just created, matchedClientId is still null — pass explicitly
        overrideContactId: row.matchedClientId ? undefined : effectiveClientId,
      });
      if (linkResult.ok && linkResult.documentId && result.payload.createdContractId) {
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
            .set({
              sourceDocumentId: linkResult.documentId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(contracts.tenantId, auth.tenantId),
                eq(contracts.id, result.payload.createdContractId)
              )
            );
        }
      }
    } catch {
      /* best-effort — review already applied, doc linking is secondary */
    }
  }

  // 5E: Auto-set coverage for life insurance contracts (ZP segment)
  if (effectiveClientId && result.payload.createdContractId) {
    const { upsertCoverageFromAppliedReview } = await import("@/lib/ai/apply-coverage-from-review");
    await upsertCoverageFromAppliedReview({
      tenantId: auth.tenantId,
      userId: auth.userId,
      contactId: effectiveClientId,
      contractId: result.payload.createdContractId,
      row,
    }).catch(() => {/* best-effort */});
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
      // Všechna payment pending pole jsou potvrzena → odblokuj payment setup
      await db
        .update(clientPaymentSetups)
        .set({ needsHumanReview: false, updatedAt: new Date() })
        .where(
          and(
            eq(clientPaymentSetups.id, targetId),
            eq(clientPaymentSetups.tenantId, auth.tenantId),
          )
        );
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
      fromValue,
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
      fromValue,
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
