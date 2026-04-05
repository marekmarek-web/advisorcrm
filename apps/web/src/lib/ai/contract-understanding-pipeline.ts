/**
 * Multi-stage contract understanding pipeline.
 * Steps: detect input mode -> classify -> choose schema -> structured extraction -> validation -> review decision.
 */

import { createResponse, createResponseWithFile } from "@/lib/openai";
import { runCombinedContractIntake } from "./contract-intake-combined";
import { detectInputMode } from "./input-mode-detection";
import { classifyContractDocument } from "./document-classification";
import {
  buildExtractionPrompt,
  validateExtractionByType,
  wrapExtractionPromptWithDocumentText,
  type ExtractedContractByType,
} from "./extraction-schemas-by-type";
import { validateExtractedContract, validateDocumentEnvelope, type ValidationResult } from "./extraction-validation";
import { decideReviewStatus, decideReviewStatusWithReason } from "./review-decision-engine";
import type { ContractProcessingStatus } from "db";
import type { ExtractionTrace } from "./review-queue-repository";
import type { ValidationWarning } from "./extraction-validation";
import type { DocumentReviewEnvelope } from "./document-review-types";
import { selectSchemaForType } from "./document-schema-router";
import { applyRuleBasedClassificationOverride } from "./document-classification-overrides";
import { mapPrimaryToNormalized } from "./normalized-document-taxonomy";
import { runVerificationPass } from "./document-verification";
import { applyExtractedFieldAliasNormalizations } from "./extraction-field-alias-normalize";
import { deriveEnvelopeFlags } from "./derive-envelope-flags";
import { resolveSensitivityProfile } from "./document-sensitivity";
import { inferDocumentRelationships } from "./document-relationships";
import { isOpenAIRateLimitError } from "./openai-rate-limit";
import {
  mapPrimaryToPipelineClassification,
  resolveExtractionRoute,
  isProposalOrModelationLifecycle,
  type ExtractionRoute,
  type PipelineNormalizedClassification,
} from "./pipeline-extraction-routing";
import type { ClassificationResult } from "./document-classification";
import {
  extractPaymentInstructionsFromDocument,
  buildPaymentInstructionEnvelope,
  validatePaymentInstructionExtraction,
  type PaymentInstructionExtraction,
} from "./payment-instruction-extraction";
import { buildManualReviewStubEnvelope, buildScanOcrUnusableStubEnvelope } from "./ai-review-manual-stub";
import { shouldSkipContractLlmExtractionForScanOcr } from "./scan-ocr-extraction-gate";
import { runAiReviewV2Pipeline } from "./ai-review-pipeline-v2";

export type PipelinePreprocessMeta = {
  adobePreprocessed?: boolean;
  preprocessStatus?: string;
  preprocessMode?: string;
  preprocessWarnings?: string[];
  ocrConfidenceEstimate?: number;
  readabilityScore?: number;
  preprocessDurationMs?: number;
  normalizedPdfPath?: string | null;
  markdownContentLength?: number;
  pageCountEstimate?: number | null;
};

function logPipelineEvent(phase: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(
    `[contract-pipeline] ${phase}`,
    JSON.stringify({
      ...payload,
    })
  );
}

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

export type PipelineSuccess = {
  ok: true;
  processingStatus: ContractProcessingStatus;
  extractedPayload: ExtractedContractByType;
  confidence: number;
  reasonsForReview: string[];
  inputMode: string;
  extractionMode: string;
  detectedDocumentType: string;
  extractionTrace: ExtractionTrace;
  validationWarnings: ValidationWarning[];
  fieldConfidenceMap: Record<string, number> | null;
  classificationReasons: string[];
  reviewDecisionReason?: string | null;
};

export type PipelineError = {
  ok: false;
  processingStatus: "failed";
  errorMessage: string;
  /** Machine-readable code for clients (e.g. OPENAI_RATE_LIMIT). */
  errorCode?: string;
  extractionTrace?: ExtractionTrace;
  details?: unknown;
};

export type PipelineResult = PipelineSuccess | PipelineError;

/**
 * Bundle context hint passed from packet segmentation into the extraction pipeline.
 * Allows the combined extraction prompt to be aware of multi-section documents
 * at extraction time, not just post-extraction.
 */
export type BundleHint = {
  isBundle: boolean;
  /** Primary publishable subdocument type detected. */
  primarySubdocumentType: string | null;
  /** All detected subdocument types (strings for forward compatibility). */
  candidateTypes: string[];
  /** Section headings detected in the document (first significant lines per section). */
  sectionHeadings: string[];
  /** True when at least one sensitive attachment (health/AML) was detected. */
  hasSensitiveAttachment: boolean;
  /** True when an investment/DIP/DPS section was detected. */
  hasInvestmentSection: boolean;
};

/**
 * Pre-built structured source from Adobe Extract structuredData.json.
 * When present, the core extraction pipeline prefers this over the markdown hint.
 */
export type StructuredSourceHint = {
  /**
   * Full concatenated text from all pages of the structured data.
   * Used as `documentText` in the combined extraction prompt when available.
   */
  fullText: string;
  /** Total number of pages in the structured data. */
  pageCount: number;
  /** Trace identifier for observability. */
  traceSource: "adobe_structured_pages";
};

export type ContractPipelineOptions = {
  /** Markdown/OCR text snippet for rule-based classification overrides (e.g. Adobe preprocess). */
  ruleBasedTextHint?: string | null;
  preprocessMeta?: PipelinePreprocessMeta | null;
  /** Original upload file name for Prompt Builder classifier (basename). */
  sourceFileName?: string | null;
  /**
   * Pre-computed bundle detection hint from packet segmentation.
   * When provided, the combined extraction prompt is augmented with bundle context,
   * improving extraction accuracy for multi-section documents.
   */
  bundleHint?: BundleHint | null;
  /**
   * Optional structured source from Adobe Extract structuredData.json.
   * When provided and non-empty, takes priority over ruleBasedTextHint as documentText
   * for the core extraction pipeline, enabling structured-source core extraction.
   */
  structuredSource?: StructuredSourceHint | null;
  /**
   * Pre-sliced section-specific texts for bundle-context prompt enrichment.
   * When provided, the extraction prompt uses labeled sections (contractual, health,
   * investment, payment, attachment) instead of one anonymous text blob.
   * Reduces cross-section contamination at the LLM reasoning level.
   */
  bundleSectionTexts?: import("@/lib/ai/combined-extraction").BundleSectionTexts | null;
};

export async function runContractUnderstandingPipeline(
  fileUrl: string,
  mimeType?: string | null,
  options?: ContractPipelineOptions
): Promise<PipelineResult> {
  // V2 je výchozí (classifier → routing → extrakce). Vypnout jen explicitně pro diagnostiku staré pipeline.
  const useAiReviewV2 = process.env.AI_REVIEW_USE_V2_PIPELINE !== "false";
  if (useAiReviewV2) {
    return runAiReviewV2Pipeline(fileUrl, mimeType, options);
  }

  const { getPipelineVersionInfo } = await import("./pipeline-versioning");
  const versionInfo = getPipelineVersionInfo();
  const trace: ExtractionTrace = {
    pipelineVersion: versionInfo.pipelineVersion,
    promptVersion: versionInfo.promptVersion,
    schemaVersion: versionInfo.schemaVersion,
    classifierVersion: versionInfo.classifierVersion,
  };
  const allReasons: string[] = [];
  mergePreprocessIntoTrace(trace, options?.preprocessMeta ?? null);
  logPipelineEvent("start", {
    hasPreprocessMeta: Boolean(options?.preprocessMeta),
    preprocessStatus: options?.preprocessMeta?.preprocessStatus,
  });

  // Steps 1–2: Jedno volání s PDF (detekce režimu + typ dokumentu), při selhání fallback na 2× sekvenční volání.
  let inputModeResult: Awaited<ReturnType<typeof detectInputMode>>;
  let classification: Awaited<ReturnType<typeof classifyContractDocument>>;

  const combined = await runCombinedContractIntake(fileUrl, mimeType);
  if (combined) {
    inputModeResult = combined.input;
    classification = combined.classification;
  } else {
    try {
      inputModeResult = await detectInputMode(fileUrl, mimeType);
    } catch (e) {
      trace.failedStep = "detect_input_mode";
      trace.warnings = [e instanceof Error ? e.message : String(e)];
      if (isOpenAIRateLimitError(e)) {
        return {
          ok: false,
          processingStatus: "failed",
          errorCode: "OPENAI_RATE_LIMIT",
          errorMessage:
            "OpenAI dočasně odmítá požadavky (limit tokenů za minutu). Počkejte cca minutu a zkuste znovu, případně omezte paralelní nahrávání.",
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
    try {
      classification = await classifyContractDocument(fileUrl);
    } catch (e) {
      trace.failedStep = "classify_document";
      trace.warnings = [...(trace.warnings ?? []), e instanceof Error ? e.message : String(e)];
      if (isOpenAIRateLimitError(e)) {
        return {
          ok: false,
          processingStatus: "failed",
          errorCode: "OPENAI_RATE_LIMIT",
          errorMessage:
            "OpenAI dočasně odmítá požadavky (limit tokenů za minutu). Počkejte cca minutu a zkuste znovu, případně omezte paralelní nahrávání.",
          extractionTrace: trace,
          details: e instanceof Error ? e.message : String(e),
        };
      }
      return {
        ok: false,
        processingStatus: "failed",
        errorMessage: "Klasifikace dokumentu selhala.",
        extractionTrace: trace,
        details: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const override = applyRuleBasedClassificationOverride(classification, options?.ruleBasedTextHint);
  classification = override.classification;
  if (override.overrideApplied && override.classificationOverrideReason) {
    trace.classificationOverrideReason = override.classificationOverrideReason;
  }

  trace.inputMode = inputModeResult.inputMode;
  trace.extractionMode = inputModeResult.extractionMode;
  trace.ocrRequired = inputModeResult.ocrRequired ?? false;
  trace.pageCount = inputModeResult.pageCount;
  trace.qualityWarnings = inputModeResult.qualityWarnings ?? [];
  trace.warnings = [
    ...(trace.warnings ?? []),
    ...inputModeResult.extractionWarnings,
    ...(inputModeResult.qualityWarnings ?? []),
  ];

  if (inputModeResult.inputMode === "unsupported" && inputModeResult.extractionWarnings.length > 0) {
    const msg = inputModeResult.extractionWarnings[0];
    trace.failedStep = "detect_input_mode";
    return {
      ok: false,
      processingStatus: "failed",
      errorMessage: msg,
      extractionTrace: trace,
    };
  }

  const mode = inputModeResult.extractionMode as string;
  const isScanFallback = mode === "vision_fallback" || mode === "ocr_enhanced";

  trace.documentType = classification.primaryType;
  trace.classificationConfidence = classification.confidence;
  trace.normalizedDocumentType = mapPrimaryToNormalized(classification.primaryType);
  if (classification.reasons.length) {
    allReasons.push(...classification.reasons);
  }

  const normPipeline = mapPrimaryToPipelineClassification(classification.primaryType);
  const extractionRoute = resolveExtractionRoute(normPipeline, classification.confidence);
  trace.normalizedPipelineClassification = normPipeline;
  trace.extractionRoute = extractionRoute;
  trace.rawClassification = classification.primaryType;
  const textCov =
    typeof trace.textCoverageEstimate === "number"
      ? trace.textCoverageEstimate
      : typeof options?.preprocessMeta?.ocrConfidenceEstimate === "number"
        ? options.preprocessMeta.ocrConfidenceEstimate
        : undefined;
  if (textCov != null) trace.textCoverageEstimate = textCov;

  logPipelineEvent("classified", {
    raw: classification.primaryType,
    normalizedPipeline: normPipeline,
    route: extractionRoute,
    confidence: classification.confidence,
  });

  if (options?.preprocessMeta?.preprocessStatus === "failed") {
    allReasons.push("adobe_preprocess_failed_fallback");
  }
  if (typeof textCov === "number" && textCov < 0.35) {
    allReasons.push("low_text_coverage_estimate");
  }

  if (extractionRoute === "manual_review_only") {
    const stub = buildManualReviewStubEnvelope({
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
    trace.selectedSchema = "manual_review_only";
    logPipelineEvent("branch_manual_review", { normalizedPipeline: normPipeline });
    return {
      ok: true,
      processingStatus: "review_required",
      extractedPayload: stub,
      confidence: stub.documentClassification.confidence,
      reasonsForReview: [...new Set([...allReasons, "manual_review_only"])],
      inputMode: inputModeResult.inputMode,
      extractionMode: inputModeResult.extractionMode,
      detectedDocumentType: "unsupported_or_unknown",
      extractionTrace: trace,
      validationWarnings: stub.reviewWarnings,
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  if (extractionRoute === "payment_instructions") {
    trace.selectedSchema = "payment_instruction_dedicated";
    logPipelineEvent("branch_payment_extraction", {});
    const payRes = await extractPaymentInstructionsFromDocument(fileUrl, mimeType);
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
      const payPrimary =
        classification.primaryType === "investment_payment_instruction"
          ? "investment_payment_instruction"
          : "payment_instruction";
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
      logPipelineEvent("payment_extraction_failed_soft", { error: payRes.error.slice(0, 120) });
      return {
        ok: true,
        processingStatus: "review_required",
        extractedPayload: payData,
        confidence: 0.2,
        reasonsForReview: [...new Set([...allReasons, "payment_extraction_failed", "payment_needs_review"])],
        inputMode: inputModeResult.inputMode,
        extractionMode: inputModeResult.extractionMode,
        detectedDocumentType: payPrimary,
        extractionTrace: trace,
        validationWarnings: payData.reviewWarnings,
        fieldConfidenceMap: null,
        classificationReasons: classification.reasons,
      };
    }

    const payPrimary =
      classification.primaryType === "investment_payment_instruction"
        ? "investment_payment_instruction"
        : "payment_instruction";
    const payData = buildPaymentInstructionEnvelope({
      extraction: payRes.data,
      primaryType: payPrimary,
      pageCount: inputModeResult.pageCount ?? trace.pageCount ?? undefined,
    });
    payData.documentMeta.preprocessMode = options?.preprocessMeta?.preprocessMode;
    payData.documentMeta.preprocessStatus = options?.preprocessMeta?.preprocessStatus;
    payData.documentMeta.textCoverageEstimate = textCov;
    payData.documentClassification.lifecycleStatus = classification.lifecycleStatus;
    payData.documentClassification.documentIntent = classification.documentIntent;
    payData.documentClassification.reasons = [
      ...classification.reasons,
      ...payData.documentClassification.reasons,
    ];
    const pv = validatePaymentInstructionExtraction(payRes.data);
    payData.reviewWarnings = [...payData.reviewWarnings, ...pv.warnings];
    let payStatus: ContractProcessingStatus = "review_required";
    if (pv.needsHumanReview) {
      allReasons.push("payment_validation_needs_review");
    }
    if (!pv.needsHumanReview && !pv.warnings.some((w) => w.severity === "critical")) {
      payStatus = decideReviewStatus({
        classificationConfidence: classification.confidence,
        extractionConfidence: payRes.data.confidence ?? 0.65,
        validation: { valid: true, warnings: [], reasonsForReview: [] },
        inputMode: inputModeResult.inputMode,
        extractionFailed: false,
      });
    }
    logPipelineEvent("payment_extraction_ok", {
      needsHumanReview: pv.needsHumanReview,
      confidence: payRes.data.confidence,
    });
    return {
      ok: true,
      processingStatus: payStatus,
      extractedPayload: payData,
      confidence: payRes.data.confidence ?? 0.65,
      reasonsForReview: [...new Set([...allReasons, ...(pv.needsHumanReview ? ["payment_needs_review"] : [])])],
      inputMode: inputModeResult.inputMode,
      extractionMode: inputModeResult.extractionMode,
      detectedDocumentType: payPrimary,
      extractionTrace: trace,
      validationWarnings: payData.reviewWarnings,
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  const documentTextHint = (options?.ruleBasedTextHint ?? "").trim();

  // Rules-first: scan-like PDF without usable OCR text — skip LLM contract extraction (file + preview only).
  if (
    (extractionRoute === "contract_intake" || extractionRoute === "supporting_document") &&
    shouldSkipContractLlmExtractionForScanOcr({
      isScanFallback,
      hintLength: documentTextHint.length,
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
    logPipelineEvent("branch_scan_ocr_skip", { hintLen: documentTextHint.length });
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
      validationWarnings: stub.reviewWarnings,
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  // Step 3 & 4: Schema selection by document type (Plan 3 §4.6) — contract / supporting paths
  const documentType = classification.primaryType;
  const schemaDefinition = selectSchemaForType(documentType);
  trace.selectedSchema = documentType;

  // Step 5: Structured extraction — either text-only (no PDF fallback) or single PDF pass.
  const legacyBundleContext = options?.bundleHint?.isBundle
    ? {
        hasSensitiveAttachment: options.bundleHint.hasSensitiveAttachment,
        hasInvestmentSection: options.bundleHint.hasInvestmentSection,
        candidateTypes: options.bundleHint.candidateTypes ?? [],
        hasSectionTexts: !!(options.bundleSectionTexts &&
          (options.bundleSectionTexts.contractualText || options.bundleSectionTexts.investmentText)),
      }
    : null;
  const extractionPrompt = buildExtractionPrompt(documentType, isScanFallback, legacyBundleContext);
  const hint = documentTextHint;
  const minTextChars = 800;
  const readabilityOk =
    typeof options?.preprocessMeta?.readabilityScore === "number" &&
    options.preprocessMeta.readabilityScore >= 68;
  const isTextPdf = inputModeResult.inputMode === "text_pdf";
  const allowTextSecondPass =
    hint.length >= minTextChars && !isScanFallback && (isTextPdf || readabilityOk);

  const extractionStarted = Date.now();
  let rawExtraction: string;
  try {
    if (allowTextSecondPass) {
      trace.extractionSecondPass = "text";
      const wrapped = wrapExtractionPromptWithDocumentText(
        extractionPrompt,
        hint,
        undefined,
        options?.bundleSectionTexts ?? null,
      );
      rawExtraction = await createResponse(wrapped, { routing: { category: "ai_review" } });
    } else {
      trace.extractionSecondPass = "pdf";
      rawExtraction = await createResponseWithFile(fileUrl, extractionPrompt, {
        routing: { category: "ai_review" },
      });
    }
    trace.extractionDurationMs = Date.now() - extractionStarted;
  } catch (e) {
    trace.extractionDurationMs = Date.now() - extractionStarted;
    trace.failedStep = "structured_extraction";
    trace.warnings = [...(trace.warnings ?? []), e instanceof Error ? e.message : String(e)];
    if (isOpenAIRateLimitError(e)) {
      return {
        ok: false,
        processingStatus: "failed",
        errorCode: "OPENAI_RATE_LIMIT",
        errorMessage:
          "OpenAI dočasně odmítá požadavky (limit tokenů za minutu). Počkejte cca minutu a zkuste znovu, případně omezte paralelní nahrávání.",
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

  logPipelineEvent("contract_extraction_raw_ok", { documentType });

  const valBlockStart = Date.now();
  const validated = validateExtractionByType(rawExtraction, documentType);
  if (!validated.ok) {
    trace.validationDurationMs = Date.now() - valBlockStart;
    trace.failedStep = "structured_extraction";
    trace.warnings = [
      ...(trace.warnings ?? []),
      "Neplatná struktura odpovědi: " + validated.issues.map((i) => i.message).join("; "),
    ];
    return {
      ok: false,
      processingStatus: "failed",
      errorMessage: "Odpověď modelu nevyhovuje schématu smlouvy.",
      extractionTrace: trace,
      details: validated.issues,
    };
  }

  const data = validated.data;
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

  applyExtractedFieldAliasNormalizations(data);

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
  if (lifecycle === "proposal" || lifecycle === "offer" || lifecycle === "illustration" || lifecycle === "modelation" || lifecycle === "non_binding_projection") {
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
  deriveEnvelopeFlags(data);
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

  // Step 6: Validation
  // Envelope-level validation (proposal/contract confusion, payment completeness, change doc refs)
  const envelopeValidation = validateDocumentEnvelope(data);
  if (envelopeValidation.warnings.length) {
    allReasons.push(...envelopeValidation.reasonsForReview);
  }

  const efU = data.extractedFields;
  const legacyPaymentAmountU = (() => {
    const keys = [
      "totalMonthlyPremium",
      "premiumAmount",
      "monthlyPremium",
      "regularAmount",
      "installmentAmount",
      "loanAmount",
      "oneOffAmount",
    ] as const;
    for (const k of keys) {
      const f = efU[k];
      if (f && f.status === "extracted" && f.value != null && String(f.value).trim() !== "") {
        return f.value as number | string;
      }
    }
    return null;
  })();
  const legacyPaymentFreqU =
    (efU.paymentFrequency?.status === "extracted" && efU.paymentFrequency.value != null
      ? efU.paymentFrequency.value
      : null) ??
    (efU.premiumFrequency?.status === "extracted" && efU.premiumFrequency.value != null
      ? efU.premiumFrequency.value
      : null);

  const legacyValidationPayload = {
    contractNumber: efU.contractNumber?.value as string | null,
    institutionName: (efU.institutionName?.value ?? efU.insurer?.value) as string | null,
    client: {
      email: (efU.clientEmail?.value ?? efU.email?.value) as string | null,
      phone: (efU.clientPhone?.value ?? efU.phone?.value) as string | null,
      personalId: efU.maskedPersonalId?.value as string | null,
      companyId: efU.companyId?.value as string | null,
    },
    paymentDetails: {
      amount: legacyPaymentAmountU,
      currency: efU.currency?.value as string | null,
      frequency: legacyPaymentFreqU as string | null,
      iban: efU.iban?.value as string | null,
      accountNumber: efU.bankAccount?.value as string | null,
      variableSymbol: efU.variableSymbol?.value as string | null,
    },
    effectiveDate: efU.policyStartDate?.value as string | null,
    expirationDate: efU.policyEndDate?.value as string | null,
  };
  const validation: ValidationResult = validateExtractedContract(legacyValidationPayload);
  inferDocumentRelationships(data);
  const verification = runVerificationPass(data, schemaDefinition, {
    readability: {
      inputMode: inputModeStr,
      textCoverageEstimate: textCov,
      preprocessStatus: options?.preprocessMeta?.preprocessStatus,
    },
  });
  data.sensitivityProfile = resolveSensitivityProfile(data);
  data.reviewWarnings = verification.warnings;
  data.dataCompleteness = verification.completeness;
  if (validation.reasonsForReview.length) {
    allReasons.push(...validation.reasonsForReview);
  }
  if (verification.reasonsForReview.length) {
    allReasons.push(...verification.reasonsForReview);
  }

  trace.validationDurationMs = Date.now() - valBlockStart;

  // Step 7: Review decision (envelopeValidation computed in Step 6)
  const rdStart = Date.now();
  const reviewDecision = decideReviewStatusWithReason({
    classificationConfidence: classification.confidence,
    extractionConfidence,
    validation,
    envelopeValidation,
    inputMode: inputModeResult.inputMode,
    extractionFailed: false,
  });
  trace.reviewDecisionDurationMs = Date.now() - rdStart;
  const processingStatus = reviewDecision.status;

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

  // Backward-compatible signals from legacy shape if model still emits them in notes.
  if ((data as unknown as { needsHumanReview?: boolean }).needsHumanReview) {
    allReasons.push("model_flagged");
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
    extractionTrace: trace,
    validationWarnings: [...validation.warnings, ...verification.warnings, ...envelopeValidation.warnings],
    fieldConfidenceMap,
    classificationReasons: classification.reasons,
    reviewDecisionReason: reviewDecision.reason,
  };
}
