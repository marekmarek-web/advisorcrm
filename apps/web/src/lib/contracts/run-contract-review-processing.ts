/**
 * Heavy contract review pipeline — runs after HTTP response (next/server after)
 * so the client can poll instead of holding a long POST.
 */

import path from "node:path";
import type { AuditRequestContext } from "@/lib/audit";
import { logAudit } from "@/lib/audit";
import { updateContractReview } from "@/lib/ai/review-queue-repository";
import { runContractUnderstandingPipeline } from "@/lib/ai/contract-understanding-pipeline";
import {
  findClientCandidates,
  buildAllDraftActions,
  applyAidvisorDraftCanonicalTypes,
} from "@/lib/ai/draft-actions";
import {
  findMatchedCompanies,
  findMatchedDeals,
  findMatchedExistingContracts,
  findMatchedHouseholds,
  isMatchingAmbiguous,
} from "@/lib/ai/client-matching";
import { logOpenAICall } from "@/lib/openai";
import { preprocessForAiExtraction } from "@/lib/documents/processing/preprocess-for-ai";
import { evaluateContractReviewScanGate } from "@/lib/contracts/contract-review-scan-gate";
import {
  isAiReviewLlmPostprocessEnabled,
  parseAiReviewClientMatchKind,
  runAiReviewClientMatchLlm,
} from "@/lib/ai/ai-review-llm-postprocess";

export type RunContractReviewProcessingParams = {
  id: string;
  userId: string;
  tenantId: string;
  fileUrl: string;
  mimeType: string;
  storagePath: string;
  requestContext: AuditRequestContext;
  processingStartedAtMs: number;
};

function maskForLog(value: unknown): string {
  if (value == null) return "—";
  const s = String(value);
  if (s.length <= 4) return "***";
  return s.slice(0, 2) + "***" + s.slice(-2);
}

export async function runContractReviewProcessing(params: RunContractReviewProcessingParams): Promise<void> {
  const { id, userId, tenantId, fileUrl, mimeType, storagePath, requestContext, processingStartedAtMs } =
    params;

  let preprocessedUrl = fileUrl;
  let adobePreprocessResult: Awaited<ReturnType<typeof preprocessForAiExtraction>> | null = null;
  let preprocessThrew = false;
  const preprocessStartedAt = Date.now();
  let preprocessDurationMs: number | undefined;
  let pipelineDurationMs: number | undefined;

  try {
    adobePreprocessResult = await preprocessForAiExtraction(
      fileUrl,
      storagePath,
      tenantId,
      id,
      mimeType
    );
    preprocessDurationMs = Date.now() - preprocessStartedAt;
    preprocessedUrl = adobePreprocessResult.fileUrl;

    if (adobePreprocessResult.preprocessed) {
      await updateContractReview(id, tenantId, {
        extractionTrace: {
          adobePreprocessed: true,
          adobeJobIds: adobePreprocessResult.providerJobIds,
          adobeWarnings: adobePreprocessResult.warnings,
          readabilityScore: adobePreprocessResult.readabilityScore,
          ocrConfidenceEstimate: adobePreprocessResult.ocrConfidenceEstimate,
          ocrPdfPath: adobePreprocessResult.ocrPdfPath,
          preprocessDurationMs,
        },
      });
    }
  } catch (preprocessErr) {
    preprocessThrew = true;
    preprocessDurationMs = Date.now() - preprocessStartedAt;
    const preprocessMsg = preprocessErr instanceof Error ? preprocessErr.message : String(preprocessErr);
    console.warn("[contracts/process] Adobe preprocessing failed, continuing with original", preprocessMsg);
  }

  const pipelineStartedAt = Date.now();
  const preprocessMeta =
    adobePreprocessResult != null
      ? {
          adobePreprocessed: adobePreprocessResult.preprocessed,
          preprocessStatus: adobePreprocessResult.preprocessStatus,
          preprocessMode: adobePreprocessResult.preprocessMode,
          preprocessWarnings: adobePreprocessResult.warnings,
          ocrConfidenceEstimate: adobePreprocessResult.ocrConfidenceEstimate,
          readabilityScore: adobePreprocessResult.readabilityScore,
          preprocessDurationMs,
          normalizedPdfPath: adobePreprocessResult.normalizedPdfPath,
          markdownContentLength: adobePreprocessResult.markdownContent?.length ?? 0,
          pageCountEstimate: adobePreprocessResult.pageCountEstimate,
        }
      : preprocessThrew
        ? {
            preprocessStatus: "failed" as const,
            preprocessMode: "adobe" as const,
            adobePreprocessed: false,
            preprocessWarnings: ["preprocess_exception"],
            preprocessDurationMs,
          }
        : {
            preprocessStatus: "skipped" as const,
            preprocessMode: "none" as const,
            adobePreprocessed: false,
          };

  console.info(
    "[contracts/process] preprocess_done",
    JSON.stringify({
      reviewId: id,
      preprocessStatus: preprocessMeta.preprocessStatus,
      durationMs: preprocessDurationMs,
    })
  );

  await updateContractReview(id, tenantId, {
    processingStage: "document_recognized",
  }).catch(() => {});

  if (adobePreprocessResult) {
    const gate = await evaluateContractReviewScanGate(preprocessedUrl, mimeType, {
      markdownContent: adobePreprocessResult.markdownContent,
      readabilityScore: adobePreprocessResult.readabilityScore,
      preprocessStatus: adobePreprocessResult.preprocessStatus,
      preprocessMode: adobePreprocessResult.preprocessMode,
    });
    if (gate.defer) {
      await updateContractReview(id, tenantId, {
        processingStatus: "scan_pending_ocr",
        processingStage: null,
        errorMessage: null,
        extractionTrace: {
          preprocessDurationMs,
          preprocessStatus: preprocessMeta.preprocessStatus,
          preprocessMode: preprocessMeta.preprocessMode,
          scanPendingReason: gate.reason,
          adobePreprocessed: adobePreprocessResult.preprocessed,
          adobeJobIds: adobePreprocessResult.providerJobIds,
          readabilityScore: adobePreprocessResult.readabilityScore,
          ocrConfidenceEstimate: adobePreprocessResult.ocrConfidenceEstimate,
        },
      });
      await logAudit({
        tenantId,
        userId,
        action: "extraction_deferred_scan",
        entityType: "contract_review",
        entityId: id,
        requestContext,
        meta: { reason: gate.reason },
      }).catch(() => {});
      logOpenAICall({
        endpoint: "contracts/process_pipeline",
        model: "—",
        latencyMs: Date.now() - processingStartedAtMs,
        success: true,
      });
      return;
    }
  }

  await updateContractReview(id, tenantId, {
    processingStage: "extracting",
  }).catch(() => {});

  const pipelineResult = await runContractUnderstandingPipeline(preprocessedUrl, mimeType, {
    ruleBasedTextHint: adobePreprocessResult?.markdownContent ?? null,
    preprocessMeta,
    sourceFileName: path.basename(storagePath),
  });
  pipelineDurationMs = Date.now() - pipelineStartedAt;

  if (!pipelineResult.ok) {
    const errDetail =
      pipelineResult.details != null
        ? ` ${typeof pipelineResult.details === "string" ? pipelineResult.details : JSON.stringify(pipelineResult.details).slice(0, 200)}`
        : "";
    const isRateLimit = pipelineResult.errorCode === "OPENAI_RATE_LIMIT";
    const failTrace = {
      ...(pipelineResult.extractionTrace ?? {}),
      preprocessDurationMs,
      pipelineDurationMs,
      ...(adobePreprocessResult?.preprocessed
        ? {
            adobePreprocessed: true,
            adobeJobIds: adobePreprocessResult.providerJobIds,
            adobeWarnings: adobePreprocessResult.warnings,
            readabilityScore: adobePreprocessResult.readabilityScore,
            ocrPdfPath: adobePreprocessResult.ocrPdfPath,
            normalizedPdfPath: adobePreprocessResult.normalizedPdfPath,
            ocrConfidenceEstimate: adobePreprocessResult.ocrConfidenceEstimate,
          }
        : {}),
    };
    await updateContractReview(id, tenantId, {
      processingStatus: "failed",
      processingStage: null,
      errorMessage: isRateLimit
        ? pipelineResult.errorMessage
        : pipelineResult.errorMessage + errDetail,
      extractionTrace: failTrace,
    });
    await logAudit({
      tenantId,
      userId,
      action: "extraction_failed",
      entityType: "contract_review",
      entityId: id,
      requestContext,
      meta: { step: pipelineResult.extractionTrace?.failedStep },
    }).catch(() => {});
    logOpenAICall({
      endpoint: "contracts/process_pipeline",
      model: "—",
      latencyMs: Date.now() - processingStartedAtMs,
      success: false,
      error: maskForLog(pipelineResult.errorMessage),
    });
    return;
  }

  const data = pipelineResult.extractedPayload;
  const contractNumber = String(data.extractedFields.contractNumber?.value ?? "");
  const draftActions = applyAidvisorDraftCanonicalTypes(buildAllDraftActions(data), {
    blockPortalPayment: pipelineResult.processingStatus === "blocked",
  });

  await updateContractReview(id, tenantId, {
    processingStage: "matching_client",
  }).catch(() => {});

  const cmDbStarted = Date.now();
  const [clientMatchCandidates, matchedCompanies] = await Promise.all([
    findClientCandidates(data, { tenantId }),
    findMatchedCompanies(tenantId, data),
  ]);
  const clientMatchDurationMs = Date.now() - cmDbStarted;

  let llmClientMatchDurationMs: number | undefined;
  let clientMatchLlm: Awaited<ReturnType<typeof runAiReviewClientMatchLlm>> | null = null;
  if (isAiReviewLlmPostprocessEnabled()) {
    const llmStarted = Date.now();
    clientMatchLlm = await runAiReviewClientMatchLlm({
      extractionPartiesJson: JSON.stringify(data.parties ?? {}),
      dbCandidatesJson: JSON.stringify(
        clientMatchCandidates.slice(0, 8).map((c) => ({
          clientId: c.clientId,
          displayName: c.displayName,
          score: c.score,
          reasons: c.reasons,
        }))
      ),
    });
    llmClientMatchDurationMs = Date.now() - llmStarted;
  }

  const llmClientMatchKind = clientMatchLlm?.ok
    ? parseAiReviewClientMatchKind(clientMatchLlm.text)
    : null;

  const [matchedHouseholds, matchedDeals, matchedContracts] = await Promise.all([
    findMatchedHouseholds(tenantId, clientMatchCandidates),
    findMatchedDeals(tenantId, clientMatchCandidates, contractNumber),
    findMatchedExistingContracts(tenantId, data, clientMatchCandidates),
  ]);

  data.candidateMatches = {
    matchedClients: clientMatchCandidates.map((c) => ({
      entityId: c.clientId,
      score: c.score,
      reason: c.reasons.join("; "),
      ambiguous: false,
      extra: {
        confidence: c.confidence,
        matchedFields: c.matchedFields,
        displayName: c.displayName,
      },
    })),
    matchedHouseholds,
    matchedDeals,
    matchedCompanies,
    matchedContracts,
    score: clientMatchCandidates[0]?.score ?? 0,
    reason: clientMatchCandidates[0]?.reasons.join("; ") ?? "no_match",
    ambiguityFlags: isMatchingAmbiguous(clientMatchCandidates) ? ["multiple_close_candidates"] : [],
  };
  data.suggestedActions = draftActions.map((a) => ({
    type: a.type,
    label: a.label,
    payload: a.payload,
  }));

  const reasonsForReview = [...pipelineResult.reasonsForReview];
  if (isMatchingAmbiguous(clientMatchCandidates)) {
    reasonsForReview.push("ambiguous_client_match");
  }
  if (llmClientMatchKind === "ambiguous") {
    reasonsForReview.push("llm_client_match_ambiguous");
  }
  if (
    data.documentClassification.documentIntent === "modifies_existing_product" &&
    matchedContracts.length === 0
  ) {
    reasonsForReview.push("missing_existing_contract_match");
  }

  await updateContractReview(id, tenantId, {
    processingStage: "finalizing",
  }).catch(() => {});

  const mergedTrace = {
    ...pipelineResult.extractionTrace,
    preprocessDurationMs,
    pipelineDurationMs,
    clientMatchDurationMs,
    llmClientMatchDurationMs,
    ...(llmClientMatchKind ? { llmClientMatchKind } : {}),
    totalPipelineDurationMs: Date.now() - processingStartedAtMs,
    ...(clientMatchLlm?.ok ? { llmClientMatchText: clientMatchLlm.text.slice(0, 4000) } : {}),
    ...(adobePreprocessResult?.preprocessed
      ? {
          adobePreprocessed: true,
          adobeJobIds: adobePreprocessResult.providerJobIds,
          adobeWarnings: adobePreprocessResult.warnings,
          readabilityScore: adobePreprocessResult.readabilityScore,
          ocrPdfPath: adobePreprocessResult.ocrPdfPath,
          normalizedPdfPath: adobePreprocessResult.normalizedPdfPath,
          ocrConfidenceEstimate: adobePreprocessResult.ocrConfidenceEstimate,
        }
      : {}),
  };

  await updateContractReview(id, tenantId, {
    processingStatus: pipelineResult.processingStatus,
    processingStage: null,
    extractedPayload: data,
    draftActions,
    clientMatchCandidates,
    confidence: pipelineResult.confidence,
    reasonsForReview: reasonsForReview.length ? reasonsForReview : null,
    inputMode: pipelineResult.inputMode,
    extractionMode: pipelineResult.extractionMode,
    detectedDocumentType: pipelineResult.detectedDocumentType,
    detectedDocumentSubtype: data.documentClassification.subtype ?? null,
    lifecycleStatus: data.documentClassification.lifecycleStatus ?? null,
    documentIntent: data.documentClassification.documentIntent ?? null,
    extractionTrace: mergedTrace,
    validationWarnings: pipelineResult.validationWarnings.length ? pipelineResult.validationWarnings : null,
    fieldConfidenceMap: pipelineResult.fieldConfidenceMap ?? undefined,
    classificationReasons: pipelineResult.classificationReasons.length ? pipelineResult.classificationReasons : null,
    dataCompleteness: data.dataCompleteness ?? null,
    sensitivityProfile: data.sensitivityProfile ?? null,
    sectionSensitivity: data.sectionSensitivity ?? null,
    relationshipInference: data.relationshipInference ?? null,
  });

  await logAudit({
    tenantId,
    userId,
    action: "extraction_completed",
    entityType: "contract_review",
    entityId: id,
    requestContext,
    meta: { processingStatus: pipelineResult.processingStatus },
  }).catch(() => {});

  logOpenAICall({
    endpoint: "contracts/process_pipeline",
    model: "—",
    latencyMs: Date.now() - processingStartedAtMs,
    success: true,
  });
}
