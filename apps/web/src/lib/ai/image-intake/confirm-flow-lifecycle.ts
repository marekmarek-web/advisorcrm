/**
 * AI Photo / Image Intake — confirm-flow lifecycle integration (Phase 10).
 *
 * Connects the advisor confirm flow directly to AI Review lifecycle feedback.
 *
 * Flow:
 *   1. When confirm step params contain `_handoffConfirmAction = "submit_ai_review_handoff"`,
 *      the execution layer calls `runHandoffSubmitOnConfirm()`.
 *   2. This submits to AI Review queue (via submitToAiReviewQueue) and stores reviewRowId
 *      in session.lastImageIntakeHandoffReviewRowId.
 *   3. On next request (or same response), `getLifecycleFeedbackForSession()` looks up the
 *      stored rowId and returns current lifecycle status — single DB read, no polling.
 *   4. The result is injected into the assistant response message/metadata.
 *
 * Safety rules:
 * - No auto-submit without advisor confirm
 * - Lane separation maintained: does NOT run AI Review work itself
 * - DB lookup is non-throwing (safe degradation to "unavailable")
 * - No request-time overhead beyond one DB read (same as existing lifecycle helper)
 * - reviewRowId stored in session only — not persisted separately
 *
 * Cost: Zero model calls. At most 1 DB write (queue row) + 1 DB read (status).
 */

import "server-only";
import type { AssistantSession } from "../assistant-session";
import type { ReviewHandoffPayload, HandoffSubmitResult, HandoffLifecycleFeedback } from "./types";
import { submitToAiReviewQueue } from "./handoff-queue-integration";
import { getHandoffLifecycleFeedback, buildHandoffLifecycleNote, buildPreparedHandoffFeedback } from "./handoff-lifecycle";

// ---------------------------------------------------------------------------
// Confirm-time submit: called when execution plan step is confirmed
// ---------------------------------------------------------------------------

/**
 * Runs handoff submit when advisor confirms an execution plan step that carries
 * `_handoffConfirmAction = "submit_ai_review_handoff"`.
 *
 * Stores the resulting reviewRowId in session for lifecycle tracking.
 * Returns the HandoffSubmitResult — safe to ignore on failure.
 *
 * @param step        Confirmed execution step params
 * @param handoffPayload The ReviewHandoffPayload from the current image intake run
 * @param session     Current assistant session (reviewRowId stored here)
 * @param advisorUserId Authenticated user performing the confirm
 */
export async function runHandoffSubmitOnConfirm(
  stepParams: Record<string, unknown>,
  handoffPayload: ReviewHandoffPayload | null,
  session: AssistantSession,
  advisorUserId: string,
): Promise<HandoffSubmitResult & { reviewRowId: string | null }> {
  const confirmedAction = typeof stepParams._handoffConfirmAction === "string"
    ? stepParams._handoffConfirmAction
    : null;

  const result = await submitToAiReviewQueue(
    handoffPayload,
    advisorUserId,
    confirmedAction,
  );

  // Store rowId in session for lifecycle tracking on next response
  if (result.status === "submitted" && result.reviewRowId) {
    session.lastImageIntakeHandoffReviewRowId = result.reviewRowId;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Post-confirm lifecycle lookup: safe, single DB read
// ---------------------------------------------------------------------------

/**
 * Returns lifecycle feedback for the last submitted handoff in this session.
 *
 * Returns null if no handoff has been submitted in this session.
 * Returns "unavailable" feedback if DB lookup fails.
 * Never throws.
 */
export async function getLifecycleFeedbackForSession(
  session: AssistantSession,
  tenantId: string,
): Promise<HandoffLifecycleFeedback | null> {
  const reviewRowId = session.lastImageIntakeHandoffReviewRowId;
  if (!reviewRowId) return null;

  return getHandoffLifecycleFeedback(reviewRowId, tenantId);
}

// ---------------------------------------------------------------------------
// Build lifecycle confirm response note
// ---------------------------------------------------------------------------

/**
 * Builds a human-readable outcome note for the advisor after confirm.
 *
 * Maps HandoffSubmitResult + optional lifecycle feedback into a single
 * plain-text message fragment suitable for the assistant response.
 */
export function buildConfirmFlowLifecycleNote(
  submitResult: HandoffSubmitResult & { reviewRowId: string | null },
  lifecycleFeedback: HandoffLifecycleFeedback | null,
): string {
  const base = buildHandoffSubmitNote(submitResult);
  if (!lifecycleFeedback || lifecycleFeedback.status === "unknown") return base;

  const lifecycleNote = buildHandoffLifecycleNote(lifecycleFeedback);
  return `${base} | ${lifecycleNote}`;
}

function buildHandoffSubmitNote(result: HandoffSubmitResult & { reviewRowId: string | null }): string {
  switch (result.status) {
    case "submitted":
      return `Handoff byl úspěšně předán do AI Review fronty (ID: ${result.reviewRowId ?? result.handoffId ?? "n/a"}).`;
    case "skipped_no_confirm":
      return "Handoff nebyl odeslán — vyžaduje explicitní potvrzení poradce.";
    case "skipped_no_payload":
      return "Handoff nebyl odeslán — žádný payload k odeslání.";
    case "skipped_flag_disabled":
    case "skipped_tenant_feature_disabled":
      return "Handoff nebyl odeslán — funkce není pro tuto konfiguraci povolena.";
    case "failed":
      return `Handoff se nepodařilo odeslat: ${result.reason ?? "neznámá chyba"}.`;
    default:
      return result.reason ?? "Stav handoffu: neznámý.";
  }
}

// ---------------------------------------------------------------------------
// Pre-submit preview helper (for preview payload before confirm)
// ---------------------------------------------------------------------------

/**
 * Returns "prepared" lifecycle feedback for the pre-submit preview step.
 * Shows the advisor that handoff is ready but not yet submitted.
 */
export { buildPreparedHandoffFeedback };
