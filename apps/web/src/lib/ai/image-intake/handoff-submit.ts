/**
 * AI Photo / Image Intake — AI Review handoff submit flow (Phase 6).
 *
 * After advisor explicitly confirms the handoff action (preview/confirm flow),
 * this module submits the structured handoff payload to the AI Review entrypoint.
 *
 * Safety rules:
 * - NEVER auto-submits — requires explicit advisor confirm
 * - Lane separation preserved: image intake does NOT trigger AI Review work itself
 * - The submit is a clean fire-and-advisory: we hand off the payload metadata
 *   and signal that AI Review should be initiated, but do not run the review pipeline
 * - Full audit trail: every submit is logged with handoffId + advisor userId
 * - Flag-gated: IMAGE_INTAKE_HANDOFF_SUBMIT_ENABLED + per-user percentage gate
 *
 * What "submit" means:
 * - We write a structured audit record (via logAudit)
 * - We return a typed HandoffSubmitResult for the orchestrator
 * - Actual AI Review pipeline is initiated by the consumer of this result
 *   (route handler / action executor), not by image intake
 *
 * Cost: Zero model calls.
 */

import { logAudit } from "@/lib/audit";
import { randomUUID } from "crypto";
import type { ReviewHandoffPayload, HandoffSubmitResult } from "./types";

// ---------------------------------------------------------------------------
// Advisor confirm check
// ---------------------------------------------------------------------------

/**
 * Whether the advisor action payload signals explicit handoff confirmation.
 * Looks for a specific action type in the confirmed canonical action.
 */
export function isHandoffConfirmAction(confirmedActionType: string | null | undefined): boolean {
  return confirmedActionType === "submit_ai_review_handoff" ||
    confirmedActionType === "initiate_ai_review";
}

// ---------------------------------------------------------------------------
// Handoff submit
// ---------------------------------------------------------------------------

/**
 * Submits the AI Review handoff after advisor confirmation.
 *
 * @param payload      The structured handoff payload from handoff-payload.ts
 * @param advisorUserId The user who confirmed the action
 * @param flagEnabled  Whether handoff submit flag is active for this user
 * @param confirmedAction The canonical action type that was confirmed
 */
export async function submitHandoffAfterConfirm(
  payload: ReviewHandoffPayload | null,
  advisorUserId: string,
  flagEnabled: boolean,
  confirmedAction: string | null,
): Promise<HandoffSubmitResult> {
  // Guard: no payload
  if (!payload) {
    return {
      status: "skipped_no_payload",
      handoffId: null,
      reason: "Handoff payload nebyl připraven — nic k odeslání.",
      auditRef: null,
    };
  }

  // Guard: flag not enabled
  if (!flagEnabled) {
    return {
      status: "skipped_flag_disabled",
      handoffId: payload.handoffId,
      reason: "AI Review handoff submit není zapnutý pro tohoto uživatele.",
      auditRef: null,
    };
  }

  // Guard: advisor confirm required
  if (!isHandoffConfirmAction(confirmedAction)) {
    return {
      status: "skipped_no_confirm",
      handoffId: payload.handoffId,
      reason: "Handoff submit vyžaduje explicitní potvrzení poradce (submit_ai_review_handoff).",
      auditRef: null,
    };
  }

  try {
    // Log the handoff submit event (audit trail)
    const auditRef = randomUUID();
    await logAudit({
      tenantId: payload.metadata.tenantId,
      userId: advisorUserId,
      action: "image_intake_handoff_submitted",
      entityType: "ai_review_handoff",
      entityId: payload.handoffId,
      meta: {
        handoffId: payload.handoffId,
        status: payload.status,
        sourceAssetIds: payload.sourceAssetIds,
        detectedInputType: payload.detectedInputType,
        signals: payload.handoffReasons,
        clientId: payload.bindingContext.clientId,
        caseId: payload.bindingContext.caseId,
        laneNote: payload.laneNote,
        auditRef,
      },
    });

    return {
      status: "submitted",
      handoffId: payload.handoffId,
      reason: `Handoff byl zaznamenán a připraven k zahájení AI Review (handoffId: ${payload.handoffId}).`,
      auditRef,
    };
  } catch (err) {
    return {
      status: "failed",
      handoffId: payload.handoffId,
      reason: `Handoff submit selhal: ${err instanceof Error ? err.message : "neznámá chyba"}.`,
      auditRef: null,
    };
  }
}

/**
 * Builds a canonical action proposal for the advisor confirm flow.
 * Returns an action candidate that, when confirmed, triggers submitHandoffAfterConfirm.
 */
export function buildHandoffSubmitAction(
  payload: ReviewHandoffPayload,
): {
  intentType: "create_internal_note";
  writeAction: "createInternalNote";
  label: string;
  reason: string;
  confidence: number;
  requiresConfirmation: true;
  params: Record<string, unknown>;
} {
  return {
    intentType: "create_internal_note",
    writeAction: "createInternalNote",
    label: "Předat do AI Review",
    reason: payload.orientationSummary ?? "Dokument doporučen pro AI Review zpracování.",
    confidence: payload.bindingContext.bindingConfidence,
    requiresConfirmation: true,
    params: {
      _imageIntakeOutputMode: "no_action_archive_only",
      _reviewHandoffPayloadId: payload.handoffId,
      _reviewHandoffStatus: payload.status,
      _handoffConfirmAction: "submit_ai_review_handoff",
      _laneNote: payload.laneNote,
    },
  };
}

