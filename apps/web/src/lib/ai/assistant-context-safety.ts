/**
 * Phase 2B: context safety guards for assistant write operations.
 * Prevents writes to wrong client, stale entity, or cross-entity mismatches.
 */

import type { AssistantSession } from "./assistant-session";
import type { EntityResolutionResult } from "./assistant-entity-resolution";
import type { ExecutionPlan, WriteActionType } from "./assistant-domain-model";
import { AssistantTelemetryAction, logAssistantTelemetry } from "./assistant-telemetry";

export type ContextSafetyVerdict = {
  safe: boolean;
  requiresConfirmation: boolean;
  warnings: string[];
  blockedReason: string | null;
};

const REVIEW_ACTIONS = new Set<WriteActionType>([
  "approveAiContractReview",
  "applyAiContractReviewToCrm",
  "linkAiContractReviewToDocuments",
]);

/** Akce, kde `documentId` v kroku musí sedět se zamčeným dokumentem (pokud lock existuje). */
const DOCUMENT_LOCK_ACTIONS = new Set<WriteActionType>([
  "classifyDocument",
  "triggerDocumentReview",
  "attachDocumentToClient",
  "attachDocumentToOpportunity",
  "setDocumentVisibleToClient",
  "linkDocumentToMaterialRequest",
]);

function effectiveLockedReviewId(session: AssistantSession): string | null {
  return session.contextLock.lockedReviewId ?? session.activeReviewId ?? null;
}

function effectiveLockedDocumentId(session: AssistantSession): string | null {
  return session.lockedDocumentId ?? session.contextLock.lockedDocumentId ?? null;
}

/**
 * Validate that the resolved entity context is safe for the planned writes.
 * Must be called after entity resolution and before plan execution.
 */
export function verifyWriteContextSafety(
  session: AssistantSession,
  resolution: EntityResolutionResult,
  plan: ExecutionPlan,
): ContextSafetyVerdict {
  const warnings: string[] = [];
  let blocked: string | null = null;
  let needsConfirmation = false;

  const resolvedContactId = resolution.client?.entityId ?? null;
  const lockedContactId = session.lockedClientId ?? null;

  const reviewOnlyPlan =
    plan.steps.length > 0 &&
    plan.steps.every((s) => s.isReadOnly || REVIEW_ACTIONS.has(s.action));

  if (!resolvedContactId && plan.steps.some((s) => !s.isReadOnly) && !reviewOnlyPlan) {
    blocked = "NO_CLIENT_FOR_WRITE";
    warnings.push("Chybí klient pro zápis. Otevřete kartu kontaktu nebo upřesněte jméno.");
  }

  if (resolvedContactId && lockedContactId && resolvedContactId !== lockedContactId) {
    needsConfirmation = true;
    const resolvedLabel = resolution.client?.displayLabel || "nový klient";
    warnings.push(
      `Detekován jiný klient (${resolvedLabel}) než je zamčený kontext. Akce vyžadují explicitní potvrzení.`,
    );
  }

  if (resolution.client?.ambiguous) {
    blocked = "AMBIGUOUS_CLIENT";
    warnings.push("Klient je nejednoznačný — zápis blokován do jednoznačného výběru.");
  }

  if (resolution.opportunity?.ambiguous) {
    needsConfirmation = true;
    warnings.push("Obchod je nejednoznačný — ověřte, zda se jedná o správný případ.");
  }

  if (resolution.client?.confidence != null && resolution.client.confidence < 0.6) {
    needsConfirmation = true;
    warnings.push("Nízká jistota identifikace klienta — doporučuji ověřit.");
  }

  const planContactId = plan.contactId;
  if (resolvedContactId && planContactId && resolvedContactId !== planContactId) {
    blocked = "PLAN_CLIENT_MISMATCH";
    warnings.push("ID klienta v plánu neodpovídá resolved klientovi. Zápis blokován.");
  }

  const lockedOpp = session.lockedOpportunityId ?? null;
  const lockedReview = effectiveLockedReviewId(session);
  const lockedDoc = effectiveLockedDocumentId(session);

  for (const step of plan.steps) {
    if (step.isReadOnly) continue;

    const oppId = typeof step.params.opportunityId === "string" ? step.params.opportunityId : null;
    if (lockedOpp && oppId && oppId !== lockedOpp) {
      blocked = "OPPORTUNITY_LOCK_MISMATCH";
      warnings.push(
        "Krok plánu cílí na jiný obchod než je zamčený kontext — zápis blokován.",
      );
      break;
    }

    if (REVIEW_ACTIONS.has(step.action)) {
      const rid = typeof step.params.reviewId === "string" ? step.params.reviewId : null;
      if (lockedReview && rid && rid !== lockedReview) {
        blocked = "REVIEW_LOCK_MISMATCH";
        warnings.push(
          "Krok cílí na jiné AI review než je zamčený kontext — zápis blokován.",
        );
        break;
      }
    }

    if (DOCUMENT_LOCK_ACTIONS.has(step.action)) {
      const did = typeof step.params.documentId === "string" ? step.params.documentId : null;
      if (lockedDoc && did && did !== lockedDoc) {
        blocked = "DOCUMENT_LOCK_MISMATCH";
        warnings.push(
          "Krok cílí na jiný dokument než je zamčený kontext — zápis blokován.",
        );
        break;
      }
    }
  }

  if (resolution.document?.ambiguous) {
    needsConfirmation = true;
    warnings.push("Dokument je nejednoznačný — ověřte správný soubor.");
  }

  logAssistantTelemetry(AssistantTelemetryAction.ENTITY_RESOLUTION, {
    contextSafety: {
      safe: !blocked,
      requiresConfirmation: needsConfirmation,
      warningCount: warnings.length,
      blockedReason: blocked,
    },
  });

  return {
    safe: !blocked,
    requiresConfirmation: needsConfirmation || plan.steps.some(s => s.requiresConfirmation),
    warnings,
    blockedReason: blocked,
  };
}

/**
 * Pre-execution tenant guard: persisted plan must match session tenant.
 */
export function verifyTenantConsistency(session: AssistantSession, plan: ExecutionPlan): ContextSafetyVerdict {
  const tid = plan.tenantId;
  if (tid == null || tid === "") {
    return { safe: true, requiresConfirmation: false, warnings: [], blockedReason: null };
  }
  if (tid !== session.tenantId) {
    return {
      safe: false,
      requiresConfirmation: false,
      warnings: ["Plán patří jinému tenantovi než aktuální session — zápis blokován."],
      blockedReason: "PLAN_TENANT_MISMATCH",
    };
  }
  return { safe: true, requiresConfirmation: false, warnings: [], blockedReason: null };
}

/**
 * Validate that a session has a non-stale lock on a specific entity.
 */
export function hasActiveLock(
  session: AssistantSession,
  entityType: "client" | "opportunity" | "document" | "review",
  entityId: string,
): boolean {
  switch (entityType) {
    case "client":
      return session.lockedClientId === entityId;
    case "opportunity":
      return session.lockedOpportunityId === entityId;
    case "document":
      return session.lockedDocumentId === entityId;
    case "review":
      return session.contextLock.lockedReviewId === entityId || session.activeReviewId === entityId;
    default:
      return false;
  }
}
