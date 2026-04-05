/**
 * Heavy contract review pipeline — runs after HTTP response (next/server after)
 * so the client can poll instead of holding a long POST.
 */

import path from "node:path";
import type { AuditRequestContext } from "@/lib/audit";
import { logAudit } from "@/lib/audit";
import { updateContractReview } from "@/lib/ai/review-queue-repository";
import { runContractUnderstandingPipeline, type BundleHint } from "@/lib/ai/contract-understanding-pipeline";
import { buildAllDraftActions, applyAidvisorDraftCanonicalTypes } from "@/lib/ai/draft-actions";
import {
  findClientCandidates,
  findMatchedCompanies,
  findMatchedDeals,
  findMatchedExistingContracts,
  findMatchedHouseholds,
  isMatchingAmbiguous,
} from "@/lib/ai/client-matching";
import { logOpenAICall } from "@/lib/openai";
import { preprocessForAiExtraction } from "@/lib/documents/processing/preprocess-for-ai";
import { buildPageTextMapFromMarkdown } from "@/lib/ai/section-text-slicer";
import { fetchPageTextMapByStoragePath, fetchAdobeStructuredDataByStoragePath, resolvePageTextMap } from "@/lib/documents/page-text-map-lookup";
import { evaluateContractReviewScanGate } from "@/lib/contracts/contract-review-scan-gate";
import {
  isAiReviewLlmPostprocessEnabled,
  parseAiReviewClientMatchKind,
  runAiReviewClientMatchLlm,
  runAdvisorDocumentSummaryForAdvisorLlm,
} from "@/lib/ai/ai-review-llm-postprocess";
import { getAiReviewPromptId } from "@/lib/ai/prompt-model-registry";
import { segmentDocumentPacket } from "@/lib/ai/document-packet-segmentation";
import { applyCanonicalNormalizationToEnvelope } from "@/lib/ai/life-insurance-canonical-normalizer";
import {
  orchestrateSubdocumentExtraction,
  describeSubdocumentExtractionRoute,
} from "@/lib/ai/subdocument-extraction-orchestrator";

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
    console.warn("[contracts/process] HINT WILL BE EMPTY — extraction will rely on file-based LLM only", { reviewId: id, mimeType });
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

  const markdownAvailable = !!(adobePreprocessResult?.markdownContent?.trim());
  if (!markdownAvailable && mimeType === "application/pdf") {
    (preprocessMeta as Record<string, unknown>).preprocessStatus =
      (preprocessMeta as Record<string, unknown>).preprocessStatus ?? "no_text_extracted";
    const warns = ((preprocessMeta as Record<string, unknown>).preprocessWarnings ?? []) as string[];
    warns.push("no_markdown_content_for_pdf");
    (preprocessMeta as Record<string, unknown>).preprocessWarnings = warns;
    console.warn("[contracts/process] No markdown content extracted from PDF — pipeline will use file-based LLM", { reviewId: id });
  }

  console.info(
    "[contracts/process] preprocess_done",
    JSON.stringify({
      reviewId: id,
      preprocessStatus: preprocessMeta.preprocessStatus,
      markdownAvailable,
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

  // ── Pre-extraction: Packet segmentation (Phase 2) ─────────────────────────
  // Run segmentation BEFORE the main pipeline so the extraction trace can
  // include bundle hints. The packetMeta is also used post-extraction in the
  // canonical normaliser and orchestrator.
  const earlyPacketSegmentation = segmentDocumentPacket(
    adobePreprocessResult?.markdownContent ?? "",
    adobePreprocessResult?.pageCountEstimate ?? null,
    path.basename(storagePath),
  );
  const earlyPacketMeta = earlyPacketSegmentation.packetMeta;

  // Build bundle hint from pre-extraction segmentation for extraction-time routing.
  const bundleHint: BundleHint | null = earlyPacketMeta.isBundle
    ? {
        isBundle: true,
        primarySubdocumentType: earlyPacketMeta.primarySubdocumentType,
        candidateTypes: earlyPacketMeta.subdocumentCandidates.map((c) => c.type),
        sectionHeadings: earlyPacketMeta.subdocumentCandidates
          .filter((c) => c.sectionHeadingHint)
          .map((c) => c.sectionHeadingHint!)
          .slice(0, 4),
        hasSensitiveAttachment: earlyPacketMeta.hasSensitiveAttachment,
        hasInvestmentSection: earlyPacketMeta.subdocumentCandidates.some(
          (c) => c.type === "investment_section",
        ),
      }
    : null;

  const pipelineResult = await runContractUnderstandingPipeline(preprocessedUrl, mimeType, {
    ruleBasedTextHint: adobePreprocessResult?.markdownContent ?? null,
    preprocessMeta,
    sourceFileName: path.basename(storagePath),
    bundleHint,
  });
  const pipelineDurationMs = Date.now() - pipelineStartedAt;

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

  // ── Phase 2: Packet meta (computed pre-extraction, wired here) ────────────
  const packetMeta = earlyPacketMeta;

  // ── Phase 3: Canonical normalisation ──────────────────────────────────────
  // Map flat extractedFields into structured participants[], insuredRisks[], etc.
  applyCanonicalNormalizationToEnvelope(data, packetMeta);

  // ── Per-subdocument extraction orchestration ───────────────────────────────
  // For bundle documents, run section-specific passes (health questionnaire LLM,
  // AML heuristic, modelation lifecycle correction, payment section detection).
  // Best-effort: errors are captured as warnings, never thrown.
  let subdocOrchestrationRoute = describeSubdocumentExtractionRoute(packetMeta);
  if (packetMeta.isBundle && markdownAvailable) {
    try {
      // Resolve physical page-level text map for exact_pages / adobe_structured isolation.
      // Priority: Adobe structured > DB-stored > markdown rebuild.
      const [storedMapResult, markdownMapWithSource, adobeStructured] = await Promise.all([
        fetchPageTextMapByStoragePath(storagePath, tenantId),
        Promise.resolve(
          buildPageTextMapFromMarkdown(
            adobePreprocessResult?.markdownContent ?? null,
            adobePreprocessResult?.pageCountEstimate ?? null,
            true, // returnSource flag
          ) as { map: Record<number, string>; source: string }
        ),
        fetchAdobeStructuredDataByStoragePath(storagePath),
      ]);

      const { pageTextMap: resolvedPageTextMap, traceSource, structuredResult } = resolvePageTextMap(
        storedMapResult,
        markdownMapWithSource.map,
        markdownMapWithSource.source,
        adobeStructured,
      );

      const orchResult = await orchestrateSubdocumentExtraction(
        adobePreprocessResult?.markdownContent ?? "",
        packetMeta,
        data,
        adobePreprocessResult?.pageCountEstimate ?? null,
        resolvedPageTextMap,
        structuredResult,
      );
      if (orchResult.orchestrationRan) {
        subdocOrchestrationRoute = `${subdocOrchestrationRoute}|mutations:${orchResult.mutationCount}`;
        // Log page text map source for observability
        subdocOrchestrationRoute = `${subdocOrchestrationRoute}|ptm:${traceSource}`;
        // Append section source mode trace (e.g. "health=exact_pages,investment=heading")
        if (orchResult.sourceModeTrace && Object.keys(orchResult.sourceModeTrace).length > 0) {
          const traceStr = Object.entries(orchResult.sourceModeTrace)
            .map(([k, v]) => `${k.replace("_", "")}=${v.split(" ")[0]}`)
            .join(",");
          subdocOrchestrationRoute = `${subdocOrchestrationRoute}|source:${traceStr}`;
        }
        if (orchResult.warnings.length > 0) {
          console.warn(
            "[contracts/process] subdoc_orchestration_warnings",
            JSON.stringify({ reviewId: id, warnings: orchResult.warnings }),
          );
        }
      }
    } catch (orchErr) {
      const orchMsg = orchErr instanceof Error ? orchErr.message : String(orchErr);
      console.warn("[contracts/process] subdoc_orchestration_failed (best-effort)", {
        reviewId: id,
        error: orchMsg.slice(0, 200),
      });
    }
  }

  // Propagate bundle detection into contentFlags / trace
  if (packetMeta.isBundle) {
    data.contentFlags = data.contentFlags ?? {
      isFinalContract: false,
      isProposalOnly: false,
      containsPaymentInstructions: false,
      containsClientData: false,
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    };
    data.contentFlags.containsMultipleDocumentSections = true;
    if (packetMeta.hasSensitiveAttachment) {
      data.reviewWarnings = data.reviewWarnings ?? [];
      const alreadyWarned = data.reviewWarnings.some((w) => w.code === "multi_section_bundle_detected");
      if (!alreadyWarned) {
        data.reviewWarnings.push({
          code: "multi_section_bundle_detected",
          message: `Upload obsahuje více logických dokumentů (bundle). Typy: ${packetMeta.subdocumentCandidates.map((c) => c.label).join(", ")}. Zkontrolujte před apply.`,
          severity: "warning",
        });
      }
    }
  }

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

  let advisorSummaryTrace: Record<string, unknown> = {};
  const traceRaw = pipelineResult.extractionTrace as Record<string, unknown> | undefined;
  if (getAiReviewPromptId("documentSummaryForAdvisor")) {
    const docSummaryPayload = {
      documentClassification: data.documentClassification,
      documentMeta: data.documentMeta,
      extractedFieldKeys: Object.keys(data.extractedFields ?? {}),
      parties: data.parties ?? {},
      sensitivityProfile: data.sensitivityProfile ?? null,
    };
    const reviewPayload = {
      processingStatus: pipelineResult.processingStatus,
      reasonsForReview,
      validationWarnings: pipelineResult.validationWarnings,
      confidence: pipelineResult.confidence,
      llmReviewDecisionText:
        typeof traceRaw?.llmReviewDecisionText === "string"
          ? String(traceRaw.llmReviewDecisionText).slice(0, 8000)
          : undefined,
    };
    const clientMatchPayload = {
      candidates: clientMatchCandidates.slice(0, 8).map((c) => ({
        clientId: c.clientId,
        displayName: c.displayName,
        score: c.score,
        reasons: c.reasons,
      })),
      llmClientMatchKind: llmClientMatchKind ?? undefined,
      llmClientMatchTextHead: clientMatchLlm?.ok ? clientMatchLlm.text.slice(0, 4000) : undefined,
    };
    const advStarted = Date.now();
    const advRes = await runAdvisorDocumentSummaryForAdvisorLlm({
      documentSummaryPayloadJson: JSON.stringify(docSummaryPayload),
      reviewDecisionPayloadJson: JSON.stringify(reviewPayload),
      clientMatchPayloadJson: JSON.stringify(clientMatchPayload),
    });
    if (advRes.ok) {
      advisorSummaryTrace = {
        advisorDocumentSummary: {
          text: advRes.text.slice(0, 48_000),
          generatedAt: new Date().toISOString(),
          durationMs: advRes.durationMs,
        },
        advisorDocumentSummaryTotalMs: Date.now() - advStarted,
      };
    } else {
      advisorSummaryTrace = {
        advisorDocumentSummaryError: advRes.error?.slice(0, 500) ?? "prompt_call_failed",
        advisorDocumentSummaryDurationMs: advRes.durationMs,
      };
    }
  }

  const mergedTrace = {
    ...pipelineResult.extractionTrace,
    ...advisorSummaryTrace,
    preprocessDurationMs,
    pipelineDurationMs,
    clientMatchDurationMs,
    llmClientMatchDurationMs,
    ...(llmClientMatchKind ? { llmClientMatchKind } : {}),
    totalPipelineDurationMs: Date.now() - processingStartedAtMs,
    ...(clientMatchLlm?.ok ? { llmClientMatchText: clientMatchLlm.text.slice(0, 4000) } : {}),
    packetMeta: {
      isBundle: packetMeta.isBundle,
      bundleConfidence: packetMeta.bundleConfidence,
      detectionMethods: packetMeta.detectionMethods,
      primarySubdocumentType: packetMeta.primarySubdocumentType,
      hasSensitiveAttachment: packetMeta.hasSensitiveAttachment,
      candidateCount: packetMeta.subdocumentCandidates.length,
      packetWarnings: packetMeta.packetWarnings,
      subdocExtractionRoute: subdocOrchestrationRoute,
    },
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
