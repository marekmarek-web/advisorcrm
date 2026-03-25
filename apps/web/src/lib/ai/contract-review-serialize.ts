import type { ContractReviewRow } from "./review-queue-repository";
import { maskSensitiveEnvelopeForUi } from "./document-sensitivity";
import { buildPipelineInsightsFromReviewRow } from "./pipeline-review-insights";
import { evaluateApplyReadiness } from "./quality-gates";

/** Shared JSON body for GET contract/document review detail (Plan 3 §11.3 alias). */
export function serializeContractReviewDetailResponse(
  row: ContractReviewRow,
  includeDebug: boolean
): Record<string, unknown> {
  const safePayload =
    row.extractedPayload && typeof row.extractedPayload === "object"
      ? maskSensitiveEnvelopeForUi(row.extractedPayload as Parameters<typeof maskSensitiveEnvelopeForUi>[0])
      : row.extractedPayload;

  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    processingStatus: row.processingStatus,
    errorMessage: row.errorMessage,
    extractedPayload: safePayload,
    clientMatchCandidates: row.clientMatchCandidates,
    draftActions: row.draftActions,
    confidence: row.confidence,
    reasonsForReview: row.reasonsForReview,
    reviewStatus: row.reviewStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    rejectReason: row.rejectReason,
    appliedBy: row.appliedBy,
    appliedAt: row.appliedAt,
    matchedClientId: row.matchedClientId ?? undefined,
    createNewClientConfirmed: row.createNewClientConfirmed ?? undefined,
    applyResultPayload: row.applyResultPayload ?? undefined,
    reviewDecisionReason: row.reviewDecisionReason ?? undefined,
    inputMode: row.inputMode ?? undefined,
    extractionMode: row.extractionMode ?? undefined,
    detectedDocumentType: row.detectedDocumentType ?? undefined,
    detectedDocumentSubtype: row.detectedDocumentSubtype ?? undefined,
    lifecycleStatus: row.lifecycleStatus ?? undefined,
    documentIntent: row.documentIntent ?? undefined,
    extractionTrace: row.extractionTrace ?? undefined,
    validationWarnings: row.validationWarnings ?? undefined,
    fieldConfidenceMap: row.fieldConfidenceMap ?? undefined,
    classificationReasons: row.classificationReasons ?? undefined,
    dataCompleteness: row.dataCompleteness ?? undefined,
    sensitivityProfile: row.sensitivityProfile ?? undefined,
    sectionSensitivity: row.sectionSensitivity ?? undefined,
    relationshipInference: row.relationshipInference ?? undefined,
    originalExtractedPayload: row.originalExtractedPayload ?? undefined,
    correctedPayload: row.correctedPayload ?? undefined,
    correctedFields: row.correctedFields ?? undefined,
    correctedDocumentType: row.correctedDocumentType ?? undefined,
    correctedLifecycleStatus: row.correctedLifecycleStatus ?? undefined,
    fieldMarkedNotApplicable: row.fieldMarkedNotApplicable ?? undefined,
    linkedClientOverride: row.linkedClientOverride ?? undefined,
    linkedDealOverride: row.linkedDealOverride ?? undefined,
    confidenceOverride: row.confidenceOverride ?? undefined,
    ignoredWarnings: row.ignoredWarnings ?? undefined,
    correctionReason: row.correctionReason ?? undefined,
    correctedBy: row.correctedBy ?? undefined,
    correctedAt: row.correctedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pipelineInsights: buildPipelineInsightsFromReviewRow(row),
    processingTiming: (() => {
      const t = row.extractionTrace ?? {};
      const pre = typeof t.preprocessDurationMs === "number" ? t.preprocessDurationMs : undefined;
      const pipe = typeof t.pipelineDurationMs === "number" ? t.pipelineDurationMs : undefined;
      if (pre == null && pipe == null && t.extractionSecondPass == null) return undefined;
      return {
        preprocessDurationMs: pre,
        pipelineDurationMs: pipe,
        totalMs: pre != null && pipe != null ? pre + pipe : undefined,
        extractionSecondPass: t.extractionSecondPass,
      };
    })(),
    applyGate: evaluateApplyReadiness(row),
    debug: includeDebug
      ? {
          classification: {
            detectedDocumentType: row.detectedDocumentType ?? undefined,
            detectedDocumentSubtype: row.detectedDocumentSubtype ?? undefined,
            lifecycleStatus: row.lifecycleStatus ?? undefined,
            documentIntent: row.documentIntent ?? undefined,
            classificationReasons: row.classificationReasons ?? undefined,
          },
          verification: {
            validationWarnings: row.validationWarnings ?? undefined,
            reasonsForReview: row.reasonsForReview ?? undefined,
            dataCompleteness: row.dataCompleteness ?? undefined,
          },
          matching: row.clientMatchCandidates ?? undefined,
          suggestedActions: row.draftActions ?? undefined,
          extractionTrace: row.extractionTrace ?? undefined,
          sensitivityProfile: row.sensitivityProfile ?? undefined,
          sectionSensitivity: row.sectionSensitivity ?? undefined,
          relationshipInference: row.relationshipInference ?? undefined,
        }
      : undefined,
  };
}
