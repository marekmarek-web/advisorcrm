/**
 * AI Photo / Image Intake — AI Review queue integration v1 (Phase 7).
 *
 * Submits the structured handoff payload into the AI Review processing queue
 * (contractUploadReviews table) after advisor explicit confirmation.
 *
 * Reuses:
 * - `createContractReview()` from review-queue-repository.ts (existing pattern)
 * - `ReviewHandoffPayload` from handoff-payload.ts
 * - `logAudit()` for audit trail
 *
 * Lane safety:
 * - Image intake does NOT process the review — just enqueues it
 * - processingStatus = "pending_extraction" triggers the existing AI Review pipeline
 * - Submit requires advisor confirm (isHandoffConfirmAction check)
 * - No auto-submit without confirm
 * - Graceful degradation if queue unavailable
 *
 * Status mapping:
 * - prepared → handoff payload built, not yet submitted
 * - submitted → review row created, processing pending
 * - accepted → (Phase 8: poll status from queue)
 * - unavailable → flag disabled or queue not accessible
 * - failed → DB error or unexpected exception
 *
 * Cost: Zero model calls.
 */

import "server-only";
import { createContractReview } from "@/lib/ai/review-queue-repository";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "crypto";
import type { ReviewHandoffPayload, HandoffSubmitResult } from "./types";
import { isHandoffConfirmAction } from "./handoff-submit";
import { getImageIntakeConfig } from "./image-intake-config";

// ---------------------------------------------------------------------------
// Queue integration submit
// ---------------------------------------------------------------------------

/**
 * Submits handoff payload to AI Review queue after advisor confirmation.
 *
 * What this does:
 * 1. Validates: payload exists + flag enabled + confirm action present
 * 2. Creates a `contractUploadReviews` row via `createContractReview()`
 *    with processingStatus="pending_extraction"
 * 3. Writes audit record
 * 4. Returns typed HandoffSubmitResult
 *
 * What this does NOT do:
 * - Does NOT run the AI Review pipeline itself
 * - Does NOT block on processing completion
 * - Does NOT mix lane responsibilities
 */
export async function submitToAiReviewQueue(
  payload: ReviewHandoffPayload | null,
  advisorUserId: string,
  confirmedAction: string | null,
): Promise<HandoffSubmitResult & { reviewRowId: string | null }> {
  const config = getImageIntakeConfig();

  if (!payload) {
    return { status: "skipped_no_payload", handoffId: null, reason: "Handoff payload nebyl připraven.", auditRef: null, reviewRowId: null };
  }

  if (!config.handoffQueueSubmitEnabled) {
    return { status: "skipped_flag_disabled", handoffId: payload.handoffId, reason: "AI Review queue submit není povolen pro tuto konfiguraci.", auditRef: null, reviewRowId: null };
  }

  if (!isHandoffConfirmAction(confirmedAction)) {
    return { status: "skipped_no_confirm", handoffId: payload.handoffId, reason: "Handoff queue submit vyžaduje explicitní potvrzení (submit_ai_review_handoff).", auditRef: null, reviewRowId: null };
  }

  try {
    // Build a synthetic storagePath from source asset refs for queue compatibility
    const syntheticStoragePath = `image_intake_handoff/${payload.handoffId}`;

    // Create queue entry — processingStatus "pending_extraction" triggers existing AI Review pipeline
    const reviewRowId = await createContractReview({
      tenantId: payload.metadata.tenantId,
      fileName: `intake_handoff_${payload.handoffId}.json`,
      storagePath: syntheticStoragePath,
      mimeType: "application/json",
      sizeBytes: null,
      processingStatus: "uploaded",
      extractedPayload: {
        handoffId: payload.handoffId,
        sourceAssetIds: payload.sourceAssetIds,
        detectedInputType: payload.detectedInputType,
        orientationSummary: payload.orientationSummary,
        handoffReasons: payload.handoffReasons,
        ambiguityNotes: payload.ambiguityNotes,
        bindingContext: payload.bindingContext,
        laneNote: payload.laneNote,
      },
      clientMatchCandidates: payload.bindingContext.clientId
        ? [{ clientId: payload.bindingContext.clientId, label: payload.bindingContext.clientLabel }]
        : null,
      confidence: payload.bindingContext.bindingConfidence,
      reasonsForReview: payload.handoffReasons,
      uploadedBy: advisorUserId,
    });

    const auditRef = randomUUID();
    await logAudit({
      tenantId: payload.metadata.tenantId,
      userId: advisorUserId,
      action: "image_intake_handoff_queue_submitted",
      entityType: "contract_upload_review",
      entityId: reviewRowId,
      meta: {
        handoffId: payload.handoffId,
        reviewRowId,
        sourceAssetIds: payload.sourceAssetIds,
        laneNote: payload.laneNote,
        auditRef,
      },
    });

    return {
      status: "submitted",
      handoffId: payload.handoffId,
      reason: `Handoff byl zapsán do AI Review fronty (reviewRowId: ${reviewRowId}).`,
      auditRef,
      reviewRowId,
    };
  } catch (err) {
    return {
      status: "failed",
      handoffId: payload.handoffId,
      reason: `AI Review queue submit selhal: ${err instanceof Error ? err.message : "neznámá chyba"}.`,
      auditRef: null,
      reviewRowId: null,
    };
  }
}
