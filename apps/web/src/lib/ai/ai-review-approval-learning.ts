import {
  acceptCorrectionEventsForReview,
  createEvalCaseFromCorrections,
  listCorrectionEventsForReview,
} from "./ai-review-learning-repository";
import {
  buildAiReviewLearningPatterns,
  isCriticalCorrectionField,
} from "./ai-review-learning";

export type AiReviewApprovalLearningSummary = {
  acceptedCorrectionIds: string[];
  createdEvalCaseIds: string[];
  patternRebuildStatus: "skipped_no_corrections" | "ok" | "failed";
};

export async function handleAiReviewApprovalLearning(params: {
  tenantId: string;
  reviewId: string;
  acceptedAt: Date;
  expectedOutputJson: unknown;
}): Promise<AiReviewApprovalLearningSummary> {
  const acceptedCorrectionIds = await acceptCorrectionEventsForReview({
    tenantId: params.tenantId,
    reviewId: params.reviewId,
    acceptedAt: params.acceptedAt,
  });

  const summary: AiReviewApprovalLearningSummary = {
    acceptedCorrectionIds,
    createdEvalCaseIds: [],
    patternRebuildStatus: acceptedCorrectionIds.length > 0 ? "ok" : "skipped_no_corrections",
  };

  if (acceptedCorrectionIds.length === 0) {
    console.info("[ai-review-learning] approval accepted corrections", {
      reviewId: params.reviewId,
      acceptedCount: 0,
      evalCaseIds: [],
      patternRebuildStatus: summary.patternRebuildStatus,
    });
    return summary;
  }

  const acceptedIdSet = new Set(acceptedCorrectionIds);
  const acceptedEvents = (await listCorrectionEventsForReview({
    tenantId: params.tenantId,
    reviewId: params.reviewId,
    limit: Math.max(acceptedCorrectionIds.length + 10, 100),
  })).filter((event) => acceptedIdSet.has(event.id));

  const criticalCorrectionIds = acceptedEvents
    .filter((event) => isCriticalCorrectionField(event.fieldPath))
    .map((event) => event.id);

  if (criticalCorrectionIds.length > 0) {
    try {
      const evalCaseId = await createEvalCaseFromCorrections({
        tenantId: params.tenantId,
            reviewId: params.reviewId,
        correctionIds: criticalCorrectionIds,
        piiScrubbed: false,
      });
          if (evalCaseId) summary.createdEvalCaseIds.push(evalCaseId);
    } catch (error) {
      console.warn("[ai-review-learning] eval case draft creation failed", {
        reviewId: params.reviewId,
        criticalCount: criticalCorrectionIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const first = acceptedEvents[0];
    const patterns = await buildAiReviewLearningPatterns({
      tenantId: params.tenantId,
      institutionName: first?.institutionName ?? null,
      productName: first?.productName ?? null,
      documentType: first?.documentType ?? null,
    });
    summary.patternRebuildStatus = "ok";
    console.info("[ai-review-learning] approval learning hook completed", {
      reviewId: params.reviewId,
      acceptedCount: acceptedCorrectionIds.length,
      criticalCount: criticalCorrectionIds.length,
      evalCaseIds: summary.createdEvalCaseIds,
      patternRebuildStatus: summary.patternRebuildStatus,
      patternDraftCount: patterns.length,
    });
  } catch (error) {
    summary.patternRebuildStatus = "failed";
    console.warn("[ai-review-learning] pattern rebuild failed after approval", {
      reviewId: params.reviewId,
      acceptedCount: acceptedCorrectionIds.length,
      evalCaseIds: summary.createdEvalCaseIds,
      patternRebuildStatus: summary.patternRebuildStatus,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return summary;
}
