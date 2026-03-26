/**
 * AI Review pipeline v2: classifier → routing matrix → Prompt Builder / legacy extraction → validation.
 */

import { createResponse, createResponseFromPrompt, createResponseWithFile } from "@/lib/openai";
import { detectInputMode } from "./input-mode-detection";
import type { ClassificationResult } from "./document-classification";
import {
  buildExtractionPrompt,
  selectExcerptForExtraction,
  validateExtractionByType,
  wrapExtractionPromptWithDocumentText,
  type ExtractedContractByType,
} from "./extraction-schemas-by-type";
import { validateExtractedContract, validateDocumentEnvelope, type ValidationResult } from "./extraction-validation";
import { decideReviewStatus, decideReviewStatusWithReason } from "./review-decision-engine";
import type { ContractProcessingStatus } from "db";
import type { ExtractionTrace } from "./review-queue-repository";
import type { ValidationWarning } from "./extraction-validation";
import type { ContractDocumentType } from "./document-classification";
import { selectSchemaForType } from "./document-schema-router";
import { mapPrimaryToNormalized } from "./normalized-document-taxonomy";
import { runVerificationPass } from "./document-verification";
import { resolveSensitivityProfile } from "./document-sensitivity";
import { inferDocumentRelationships } from "./document-relationships";
import { isOpenAIRateLimitError } from "./openai-rate-limit";
import {
  mapPrimaryToPipelineClassification,
  resolveExtractionRoute,
  isProposalOrModelationLifecycle,
  type ExtractionRoute,
} from "./pipeline-extraction-routing";
import {
  extractPaymentInstructionsFromDocument,
  buildPaymentInstructionEnvelope,
  validatePaymentInstructionExtraction,
  paymentInstructionExtractionSchema,
  type PaymentInstructionExtraction,
} from "./payment-instruction-extraction";
import { buildManualReviewStubEnvelope, buildScanOcrUnusableStubEnvelope } from "./ai-review-manual-stub";
import { shouldSkipContractLlmExtractionForScanOcr } from "./scan-ocr-extraction-gate";
import { runAiReviewClassifier } from "./ai-review-classifier";
import { resolveAiReviewExtractionRoute } from "./ai-review-extraction-router";
import { mapAiClassifierToClassificationResult } from "./ai-review-type-mapper";
import { getAiReviewPromptId, getAiReviewPromptVersion, type AiReviewPromptKey } from "./prompt-model-registry";
import { isAiReviewLlmPostprocessEnabled, runAiReviewDecisionLlm } from "./ai-review-llm-postprocess";
import type {
  ContractPipelineOptions,
  PipelinePreprocessMeta,
  PipelineResult,
  PipelineSuccess,
} from "./contract-understanding-pipeline";
import { getPipelineVersionInfo } from "./pipeline-versioning";

function mergePreprocessIntoTrace(trace: ExtractionTrace, meta?: PipelinePreprocessMeta | null): void {
  if (!meta) return;
  trace.preprocessMode = meta.preprocessMode;
  trace.preprocessStatus = meta.preprocessStatus;
  if (typeof meta.ocrConfidenceEstimate === "number") {
    trace.textCoverageEstimate = meta.ocrConfidenceEstimate;
    trace.ocrConfidenceEstimate = meta.ocrConfidenceEstimate;
  }
  if (typeof meta.readabilityScore === "number") trace.readabilityScore = meta.readabilityScore;
  if (meta.pageCountEstimate != null) trace.pageCount = meta.pageCountEstimate;
  if (meta.adobePreprocessed) trace.adobePreprocessed = true;
  if (meta.preprocessWarnings?.length) {
    trace.warnings = [...(trace.warnings ?? []), ...meta.preprocessWarnings];
  }
}

function logPipelineEvent(phase: string, payload: Record<string, unknown>): void {
  console.info(`[ai-review-v2] ${phase}`, JSON.stringify(payload));
}

async function tryExtractPaymentWithPrompt(
  fileUrl: string,
  mimeType: string | null | undefined,
  documentText: string
): Promise<
  | { ok: true; data: PaymentInstructionExtraction; raw: string }
  | { ok: false; error: string; errorCode?: string }
> {
  const promptId = getAiReviewPromptId("paymentInstructionsExtraction");
  if (!promptId) {
    return extractPaymentInstructionsFromDocument(fileUrl, mimeType);
  }
  const res = await createResponseFromPrompt(
    {
      promptId,
      version: getAiReviewPromptVersion("paymentInstructionsExtraction"),
      variables: {
        document_text: selectExcerptForExtraction(documentText).text,
      },
    },
    { store: false, routing: { category: "ai_review" } }
  );
  if (!res.ok) {
    return extractPaymentInstructionsFromDocument(fileUrl, mimeType);
  }
  try {
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : res.text;
    const parsed = JSON.parse(jsonStr) as unknown;
    const result = paymentInstructionExtractionSchema.safeParse(parsed);
    if (!result.success) {
      return extractPaymentInstructionsFromDocument(fileUrl, mimeType);
    }
    return { ok: true, data: result.data, raw: jsonStr.slice(0, 2000) };
  } catch {
    return extractPaymentInstructionsFromDocument(fileUrl, mimeType);
  }
}

type PipelineSuccessBody = Omit<PipelineSuccess, "extractionTrace">;

function finalizeContractPayload(params: {
  data: ExtractedContractByType;
  classification: ClassificationResult;
  inputModeResult: Awaited<ReturnType<typeof detectInputMode>>;
  extractionRoute: ExtractionRoute;
  normPipeline: ReturnType<typeof mapPrimaryToPipelineClassification>;
  documentType: ContractDocumentType;
  options?: ContractPipelineOptions;
  textCov: number | undefined;
  trace: ExtractionTrace;
  allReasons: string[];
}): PipelineSuccessBody {
  const {
    data,
    classification,
    inputModeResult,
    extractionRoute,
    normPipeline,
    documentType,
    options,
    textCov,
    trace,
    allReasons,
  } = params;
  const schemaDefinition = selectSchemaForType(documentType);

  data.documentClassification.primaryType = documentType;
  data.documentClassification.lifecycleStatus = classification.lifecycleStatus;
  data.documentClassification.documentIntent = classification.documentIntent;
  data.documentClassification.subtype = classification.subtype;
  data.documentClassification.confidence = classification.confidence;
  data.documentClassification.reasons = classification.reasons;
  const inputModeStr = inputModeResult.inputMode as string;
  data.documentMeta.scannedVsDigital =
    inputModeStr === "text_pdf"
      ? "digital"
      : inputModeStr === "scanned_pdf" || inputModeStr === "mixed_pdf" || inputModeStr === "image_document"
        ? "scanned"
        : "unknown";

  data.documentMeta.pipelineRoute =
    extractionRoute === "supporting_document" ? "supporting_document" : "contract_intake";
  data.documentMeta.normalizedPipelineClassification = normPipeline;
  data.documentMeta.rawPrimaryClassification = classification.primaryType;
  data.documentMeta.extractionRoute = extractionRoute;
  data.documentMeta.preprocessMode = options?.preprocessMeta?.preprocessMode;
  data.documentMeta.preprocessStatus = options?.preprocessMeta?.preprocessStatus;
  data.documentMeta.textCoverageEstimate = textCov;
  if (extractionRoute === "supporting_document") {
    allReasons.push("supporting_document_review");
  }

  const lifecycle = data.documentClassification.lifecycleStatus;
  if (isProposalOrModelationLifecycle(lifecycle)) {
    allReasons.push("proposal_or_modelation_not_final_contract");
  }
  if (!data.contentFlags) {
    data.contentFlags = {
      isFinalContract: false,
      isProposalOnly: false,
      containsPaymentInstructions: false,
      containsClientData: false,
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    };
  }
  if (lifecycle === "final_contract") data.contentFlags.isFinalContract = true;
  if (
    lifecycle === "proposal" ||
    lifecycle === "offer" ||
    lifecycle === "illustration" ||
    lifecycle === "modelation" ||
    lifecycle === "non_binding_projection"
  ) {
    data.contentFlags.isProposalOnly = true;
  }
  const paymentFields = ["bankAccount", "iban", "variableSymbol", "regularAmount", "oneOffAmount"];
  const hasPaymentData = paymentFields.some((k) => {
    const f = data.extractedFields[k];
    return f && f.status === "extracted" && f.value != null;
  });
  if (hasPaymentData || documentType === "payment_instruction" || documentType === "investment_payment_instruction") {
    data.contentFlags.containsPaymentInstructions = true;
  }
  const clientFields = ["fullName", "clientFullName", "birthDate", "maskedPersonalId", "email", "phone"];
  if (clientFields.some((k) => data.extractedFields[k]?.status === "extracted")) {
    data.contentFlags.containsClientData = true;
  }
  const advisorFields = ["advisorName", "brokerName", "intermediaryName"];
  if (advisorFields.some((k) => data.extractedFields[k]?.status === "extracted")) {
    data.contentFlags.containsAdvisorData = true;
  }
  const extractionConfidence =
    typeof data.documentMeta.overallConfidence === "number"
      ? data.documentMeta.overallConfidence
      : data.documentClassification.confidence ?? 0.5;
  data.documentMeta.overallConfidence = extractionConfidence;
  const fieldConfidenceMap = Object.fromEntries(
    Object.entries(data.extractedFields).map(([key, field]) => [
      key,
      typeof field.confidence === "number" ? field.confidence : 0,
    ])
  );

  const envelopeValidation = validateDocumentEnvelope(data);
  if (envelopeValidation.warnings.length) {
    allReasons.push(...envelopeValidation.reasonsForReview);
  }

  const legacyValidationPayload = {
    contractNumber: data.extractedFields.contractNumber?.value as string | null,
    institutionName: data.extractedFields.institutionName?.value as string | null,
    client: {
      email: data.extractedFields.clientEmail?.value as string | null,
      phone: data.extractedFields.clientPhone?.value as string | null,
      personalId: data.extractedFields.maskedPersonalId?.value as string | null,
      companyId: data.extractedFields.companyId?.value as string | null,
    },
    paymentDetails: {
      amount: data.extractedFields.loanAmount?.value as number | string | null,
      currency: data.extractedFields.currency?.value as string | null,
      frequency: data.extractedFields.paymentFrequency?.value as string | null,
    },
    effectiveDate: data.extractedFields.policyStartDate?.value as string | null,
    expirationDate: data.extractedFields.policyEndDate?.value as string | null,
  };
  const validation: ValidationResult = validateExtractedContract(legacyValidationPayload);
  inferDocumentRelationships(data);
  const verification = runVerificationPass(data, schemaDefinition);
  data.sensitivityProfile = resolveSensitivityProfile(data);
  data.reviewWarnings = verification.warnings;
  data.dataCompleteness = verification.completeness;
  if (validation.reasonsForReview.length) {
    allReasons.push(...validation.reasonsForReview);
  }
  if (verification.reasonsForReview.length) {
    allReasons.push(...verification.reasonsForReview);
  }

  const reviewDecision = decideReviewStatusWithReason({
    classificationConfidence: classification.confidence,
    extractionConfidence,
    validation,
    envelopeValidation,
    inputMode: inputModeResult.inputMode,
    extractionFailed: false,
  });
  let processingStatus: ContractProcessingStatus = reviewDecision.status;

  if (extractionConfidence < 0.7) {
    allReasons.push("low_confidence");
  }
  if (data.reviewWarnings.some((w) => w.severity === "critical")) {
    allReasons.push("critical_review_warning");
  }
  if (data.dataCompleteness && data.dataCompleteness.score < 0.7) {
    allReasons.push("incomplete_required_data");
  }
  if (data.sensitivityProfile === "health_data" || data.sensitivityProfile === "special_category_data") {
    allReasons.push("sensitive_section_detected");
  }
  if (data.documentClassification.lifecycleStatus === "proposal") {
    allReasons.push("proposal_not_final_contract");
  }
  if (data.documentClassification.lifecycleStatus === "offer") {
    allReasons.push("offer_not_binding_contract");
  }
  if (data.documentMeta.scannedVsDigital === "scanned" && extractionConfidence < 0.65) {
    allReasons.push("low_ocr_quality");
  }
  if ((data as unknown as { needsHumanReview?: boolean }).needsHumanReview) {
    allReasons.push("model_flagged");
  }

  if (!validation.valid || envelopeValidation.warnings.some((w) => w.severity === "critical")) {
    processingStatus = "review_required";
  }

  return {
    ok: true,
    processingStatus,
    extractedPayload: data,
    confidence: extractionConfidence,
    reasonsForReview: [...new Set(allReasons)],
    inputMode: inputModeResult.inputMode,
    extractionMode: inputModeResult.extractionMode,
    detectedDocumentType: documentType,
    validationWarnings: [...validation.warnings, ...verification.warnings, ...envelopeValidation.warnings],
    fieldConfidenceMap,
    classificationReasons: classification.reasons,
    reviewDecisionReason: reviewDecision.reason,
  };
}

export async function runAiReviewV2Pipeline(
  fileUrl: string,
  mimeType?: string | null,
  options?: ContractPipelineOptions
): Promise<PipelineResult> {
  const versionInfo = getPipelineVersionInfo();
  const trace: ExtractionTrace = {
    pipelineVersion: versionInfo.pipelineVersion,
    promptVersion: versionInfo.promptVersion,
    schemaVersion: versionInfo.schemaVersion,
    classifierVersion: "v2",
    aiReviewPipeline: "v2",
  };
  const allReasons: string[] = [];
  mergePreprocessIntoTrace(trace, options?.preprocessMeta ?? null);

  let inputModeResult: Awaited<ReturnType<typeof detectInputMode>>;
  try {
    inputModeResult = await detectInputMode(fileUrl, mimeType);
  } catch (e) {
    trace.failedStep = "detect_input_mode";
    if (isOpenAIRateLimitError(e)) {
      return {
        ok: false,
        processingStatus: "failed",
        errorCode: "OPENAI_RATE_LIMIT",
        errorMessage:
          "OpenAI dočasně odmítá požadavky (limit tokenů za minutu). Počkejte cca minutu a zkuste znovu.",
        extractionTrace: trace,
        details: e instanceof Error ? e.message : String(e),
      };
    }
    return {
      ok: false,
      processingStatus: "failed",
      errorMessage: "Detekce režimu vstupu selhala.",
      extractionTrace: trace,
      details: e instanceof Error ? e.message : String(e),
    };
  }

  trace.inputMode = inputModeResult.inputMode;
  trace.extractionMode = inputModeResult.extractionMode;
  trace.pageCount = inputModeResult.pageCount;
  trace.warnings = [...(trace.warnings ?? []), ...inputModeResult.extractionWarnings];

  const hint = (options?.ruleBasedTextHint ?? "").trim();
  const clsRes = await runAiReviewClassifier({
    fileUrl,
    mimeType,
    documentTextExcerpt: hint,
  });
  trace.classifierDurationMs = clsRes.durationMs;
  if (!clsRes.ok) {
    trace.failedStep = "ai_review_classifier_v2";
    trace.warnings = [...(trace.warnings ?? []), clsRes.error];
    if (isOpenAIRateLimitError(new Error(clsRes.error))) {
      return {
        ok: false,
        processingStatus: "failed",
        errorCode: "OPENAI_RATE_LIMIT",
        errorMessage: clsRes.error,
        extractionTrace: trace,
      };
    }
    return {
      ok: false,
      processingStatus: "failed",
      errorMessage: "Klasifikace dokumentu (AI Review v2) selhala.",
      extractionTrace: trace,
      details: clsRes.error,
    };
  }

  const ai = clsRes.data;
  trace.aiClassifierJson = ai as unknown as Record<string, unknown>;
  const classification = mapAiClassifierToClassificationResult(ai);
  trace.documentType = classification.primaryType;
  trace.classificationConfidence = classification.confidence;
  trace.rawClassification = `${ai.documentType}/${ai.productFamily}/${ai.productSubtype}`;

  const router = resolveAiReviewExtractionRoute({
    documentType: ai.documentType,
    productFamily: ai.productFamily,
    productSubtype: ai.productSubtype,
    businessIntent: ai.businessIntent,
    recommendedRoute: ai.recommendedRoute,
    confidence: ai.confidence,
    documentTypeUncertain: ai.documentTypeUncertain === true,
  });
  trace.aiReviewRouterOutcome = router.outcome;
  trace.aiReviewRouterReasonCodes = router.reasonCodes;
  trace.aiReviewExtractionPromptKey =
    router.outcome === "extract" ? router.promptKey : undefined;

  logPipelineEvent("routed", { outcome: router.outcome, codes: router.reasonCodes });

  const normPipeline = mapPrimaryToPipelineClassification(classification.primaryType);
  trace.normalizedPipelineClassification = normPipeline;
  const extractionRoute: ExtractionRoute = resolveExtractionRoute(normPipeline, classification.confidence);
  trace.extractionRoute = extractionRoute;

  const textCov =
    typeof trace.textCoverageEstimate === "number"
      ? trace.textCoverageEstimate
      : typeof options?.preprocessMeta?.ocrConfidenceEstimate === "number"
        ? options.preprocessMeta.ocrConfidenceEstimate
        : undefined;

  if (router.outcome === "manual_review") {
    const stub = buildManualReviewStubEnvelope({
      classification,
      inputMode: inputModeResult.inputMode as string,
      extractionMode: inputModeResult.extractionMode as string,
      pageCount: inputModeResult.pageCount ?? trace.pageCount ?? null,
      norm: normPipeline,
      route: "manual_review_only",
    });
    stub.documentMeta.textCoverageEstimate = textCov;
    stub.reviewWarnings.push({
      code: "ai_review_router_manual",
      message: `Vyžadována ruční kontrola (${router.reasonCodes.join(", ")}).`,
      severity: "warning",
    });
    trace.selectedSchema = "manual_review_router";
    return {
      ok: true,
      processingStatus: "review_required",
      extractedPayload: stub,
      confidence: stub.documentClassification.confidence,
      reasonsForReview: [...new Set([...allReasons, ...router.reasonCodes])],
      inputMode: inputModeResult.inputMode,
      extractionMode: inputModeResult.extractionMode,
      detectedDocumentType: "unsupported_or_unknown",
      extractionTrace: trace,
      validationWarnings: stub.reviewWarnings as ValidationWarning[],
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  if (router.outcome === "review_required") {
    const stub = buildManualReviewStubEnvelope({
      classification,
      inputMode: inputModeResult.inputMode as string,
      extractionMode: inputModeResult.extractionMode as string,
      pageCount: inputModeResult.pageCount ?? trace.pageCount ?? null,
      norm: normPipeline,
      route: "manual_review_only",
    });
    stub.documentMeta.textCoverageEstimate = textCov;
    stub.reviewWarnings.push({
      code: "ai_review_router_review_required",
      message: `Dokument vyžaduje kontrolu před extrakcí (${router.reasonCodes.join(", ")}).`,
      severity: "warning",
    });
    trace.selectedSchema = "router_review_required";
    return {
      ok: true,
      processingStatus: "review_required",
      extractedPayload: stub,
      confidence: classification.confidence * 0.6,
      reasonsForReview: [...new Set([...allReasons, ...router.reasonCodes])],
      inputMode: inputModeResult.inputMode,
      extractionMode: inputModeResult.extractionMode,
      detectedDocumentType: classification.primaryType,
      extractionTrace: trace,
      validationWarnings: stub.reviewWarnings as ValidationWarning[],
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  const promptKey = router.promptKey as AiReviewPromptKey;

  const modeEarly = inputModeResult.extractionMode as string;
  const isScanFallbackEarly = modeEarly === "vision_fallback" || modeEarly === "ocr_enhanced";
  if (
    promptKey !== "paymentInstructionsExtraction" &&
    shouldSkipContractLlmExtractionForScanOcr({
      isScanFallback: isScanFallbackEarly,
      hintLength: hint.length,
      preprocessStatus: options?.preprocessMeta?.preprocessStatus,
      readabilityScore: options?.preprocessMeta?.readabilityScore,
      textCoverageEstimate: textCov,
    })
  ) {
    const stub = buildScanOcrUnusableStubEnvelope({
      classification,
      inputMode: inputModeResult.inputMode as string,
      extractionMode: inputModeResult.extractionMode as string,
      pageCount: inputModeResult.pageCount ?? trace.pageCount ?? null,
      norm: normPipeline,
      route: extractionRoute,
    });
    stub.documentMeta.textCoverageEstimate = textCov;
    stub.documentMeta.preprocessMode = options?.preprocessMeta?.preprocessMode;
    stub.documentMeta.preprocessStatus = options?.preprocessMeta?.preprocessStatus;
    trace.selectedSchema = "scan_ocr_unusable";
    return {
      ok: true,
      processingStatus: "review_required",
      extractedPayload: stub,
      confidence: stub.documentClassification.confidence,
      reasonsForReview: [...new Set([...allReasons, "scan_or_ocr_unusable"])],
      inputMode: inputModeResult.inputMode,
      extractionMode: inputModeResult.extractionMode,
      detectedDocumentType: classification.primaryType,
      extractionTrace: trace,
      validationWarnings: stub.reviewWarnings as ValidationWarning[],
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  // Payment branch
  if (promptKey === "paymentInstructionsExtraction") {
    trace.selectedSchema = "payment_instruction_dedicated_v2";
    const extStart = Date.now();
    const payRes = await tryExtractPaymentWithPrompt(fileUrl, mimeType, hint);
    trace.extractionDurationMs = Date.now() - extStart;

    if (!payRes.ok) {
      if (payRes.errorCode === "OPENAI_RATE_LIMIT") {
        trace.failedStep = "payment_extraction";
        return {
          ok: false,
          processingStatus: "failed",
          errorCode: "OPENAI_RATE_LIMIT",
          errorMessage: payRes.error,
          extractionTrace: trace,
        };
      }
      const fallbackExtraction: PaymentInstructionExtraction = {
        paymentNote: payRes.error,
        confidence: 0.15,
        needsHumanReview: true,
      };
      const payPrimary = "payment_instruction";
      const payData = buildPaymentInstructionEnvelope({
        extraction: fallbackExtraction,
        primaryType: payPrimary,
        pageCount: inputModeResult.pageCount ?? trace.pageCount ?? undefined,
      });
      payData.documentMeta.preprocessMode = options?.preprocessMeta?.preprocessMode;
      payData.documentMeta.preprocessStatus = options?.preprocessMeta?.preprocessStatus;
      payData.documentMeta.textCoverageEstimate = textCov;
      payData.reviewWarnings.push({
        code: "payment_extraction_parse_failed",
        message: payRes.error,
        severity: "critical",
      });
      return {
        ok: true,
        processingStatus: "blocked",
        extractedPayload: payData,
        confidence: 0.2,
        reasonsForReview: [...new Set([...allReasons, "payment_extraction_failed"])],
        inputMode: inputModeResult.inputMode,
        extractionMode: inputModeResult.extractionMode,
        detectedDocumentType: payPrimary,
        extractionTrace: trace,
        validationWarnings: payData.reviewWarnings,
        fieldConfidenceMap: null,
        classificationReasons: classification.reasons,
      };
    }

    const payData = buildPaymentInstructionEnvelope({
      extraction: payRes.data,
      primaryType: "payment_instruction",
      pageCount: inputModeResult.pageCount ?? trace.pageCount ?? undefined,
    });
    payData.documentMeta.preprocessMode = options?.preprocessMeta?.preprocessMode;
    payData.documentMeta.preprocessStatus = options?.preprocessMeta?.preprocessStatus;
    payData.documentMeta.textCoverageEstimate = textCov;
    payData.documentClassification.lifecycleStatus = classification.lifecycleStatus;
    payData.documentClassification.documentIntent = classification.documentIntent;
    payData.documentClassification.reasons = [...classification.reasons, ...payData.documentClassification.reasons];

    const pv = validatePaymentInstructionExtraction(payRes.data);
    payData.reviewWarnings = [...payData.reviewWarnings, ...pv.warnings];
    const hasCritical = pv.warnings.some((w) => w.severity === "critical");
    let payStatus: ContractProcessingStatus = hasCritical ? "blocked" : "review_required";
    if (pv.needsHumanReview) {
      allReasons.push("payment_validation_needs_review");
    }
    if (!pv.needsHumanReview && !hasCritical) {
      payStatus = decideReviewStatus({
        classificationConfidence: classification.confidence,
        extractionConfidence: payRes.data.confidence ?? 0.65,
        validation: { valid: true, warnings: [], reasonsForReview: [] },
        inputMode: inputModeResult.inputMode,
        extractionFailed: false,
      });
    }

    return {
      ok: true,
      processingStatus: payStatus,
      extractedPayload: payData,
      confidence: payRes.data.confidence ?? 0.65,
      reasonsForReview: [...new Set([...allReasons, ...(pv.needsHumanReview ? ["payment_needs_review"] : [])])],
      inputMode: inputModeResult.inputMode,
      extractionMode: inputModeResult.extractionMode,
      detectedDocumentType: "payment_instruction",
      extractionTrace: trace,
      validationWarnings: payData.reviewWarnings,
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  const documentType = classification.primaryType;
  trace.selectedSchema = documentType;
  const mode = inputModeResult.extractionMode as string;
  const isScanFallback = mode === "vision_fallback" || mode === "ocr_enhanced";
  const extractionPrompt = buildExtractionPrompt(documentType, isScanFallback);
  const minTextChars = 800;
  const readabilityOk =
    typeof options?.preprocessMeta?.readabilityScore === "number" &&
    options.preprocessMeta.readabilityScore >= 68;
  const isTextPdf = inputModeResult.inputMode === "text_pdf";
  const allowTextSecondPass =
    hint.length >= minTextChars && !isScanFallback && (isTextPdf || readabilityOk);

  const extractionPromptId = getAiReviewPromptId(promptKey);
  const extractionVersion = getAiReviewPromptVersion(promptKey);

  const extStart = Date.now();
  let rawExtraction: string;
  try {
    if (extractionPromptId && hint.length >= 400) {
      trace.extractionSecondPass = "prompt_text";
      const pr = await createResponseFromPrompt(
        {
          promptId: extractionPromptId,
          version: extractionVersion,
          variables: {
            document_text: selectExcerptForExtraction(hint).text,
            classification_json: JSON.stringify(ai),
          },
        },
        { store: false, routing: { category: "ai_review" } }
      );
      if (!pr.ok) {
        throw new Error(pr.error);
      }
      rawExtraction = pr.text;
    } else if (allowTextSecondPass) {
      trace.extractionSecondPass = "text";
      const wrapped = wrapExtractionPromptWithDocumentText(extractionPrompt, hint);
      rawExtraction = await createResponse(wrapped, { routing: { category: "ai_review" } });
    } else {
      trace.extractionSecondPass = "pdf";
      rawExtraction = await createResponseWithFile(fileUrl, extractionPrompt, {
        routing: { category: "ai_review" },
      });
    }
  } catch (e) {
    trace.failedStep = "structured_extraction";
    trace.warnings = [...(trace.warnings ?? []), e instanceof Error ? e.message : String(e)];
    trace.extractionDurationMs = Date.now() - extStart;
    if (isOpenAIRateLimitError(e)) {
      return {
        ok: false,
        processingStatus: "failed",
        errorCode: "OPENAI_RATE_LIMIT",
        errorMessage:
          "OpenAI dočasně odmítá požadavky (limit tokenů za minutu). Počkejte cca minutu a zkuste znovu.",
        extractionTrace: trace,
        details: e instanceof Error ? e.message : String(e),
      };
    }
    return {
      ok: false,
      processingStatus: "failed",
      errorMessage: "Extrakce ze dokumentu selhala.",
      extractionTrace: trace,
      details: e instanceof Error ? e.message : String(e),
    };
  }
  trace.extractionDurationMs = Date.now() - extStart;

  const valStart = Date.now();
  const validated = validateExtractionByType(rawExtraction, documentType);
  trace.validationDurationMs = Date.now() - valStart;

  if (!validated.ok) {
    const stub = buildManualReviewStubEnvelope({
      classification,
      inputMode: inputModeResult.inputMode as string,
      extractionMode: inputModeResult.extractionMode as string,
      pageCount: inputModeResult.pageCount ?? trace.pageCount ?? null,
      norm: normPipeline,
      route: extractionRoute,
    });
    stub.documentMeta.textCoverageEstimate = textCov;
    for (const issue of validated.issues.slice(0, 12)) {
      stub.reviewWarnings.push({
        code: "extraction_schema_validation",
        message: issue.message,
        severity: "warning",
      });
    }
    trace.warnings = [...(trace.warnings ?? []), "extraction_validation_soft_fail"];
    return {
      ok: true,
      processingStatus: "review_required",
      extractedPayload: stub,
      confidence: classification.confidence * 0.4,
      reasonsForReview: [...new Set([...allReasons, "extraction_schema_validation"])],
      inputMode: inputModeResult.inputMode,
      extractionMode: inputModeResult.extractionMode,
      detectedDocumentType: documentType,
      extractionTrace: trace,
      validationWarnings: stub.reviewWarnings as ValidationWarning[],
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  const rdStart = Date.now();
  if (isAiReviewLlmPostprocessEnabled()) {
    const extractionSummary = {
      primaryType: validated.data.documentClassification?.primaryType,
      overallConfidence: validated.data.documentMeta?.overallConfidence,
      fieldCount: Object.keys(validated.data.extractedFields ?? {}).length,
    };
    const llmRd = await runAiReviewDecisionLlm({
      classificationJson: JSON.stringify(classification),
      extractionSummaryJson: JSON.stringify(extractionSummary),
      validationSummaryJson: JSON.stringify({ valid: true, note: "post_parse" }),
    });
    if (llmRd.ok) {
      trace.llmReviewDecisionText = llmRd.text.slice(0, 4000);
    }
  }
  trace.reviewDecisionDurationMs = Date.now() - rdStart;

  const finalized = finalizeContractPayload({
    data: validated.data,
    classification,
    inputModeResult,
    extractionRoute,
    normPipeline,
    documentType,
    options,
    textCov,
    trace,
    allReasons,
  });

  return {
    ...finalized,
    extractionTrace: trace,
  };
}
