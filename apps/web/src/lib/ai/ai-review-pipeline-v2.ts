/**
 * AI Review pipeline v2: classifier → routing matrix → Prompt Builder / legacy extraction → validation.
 */

import {
  aiReviewCreateResponse as createResponse,
  aiReviewCreateResponseFromPrompt as createAiReviewResponseFromPrompt,
  aiReviewCreateResponseWithFile as createResponseWithFile,
} from "./review-llm-provider";
import { detectInputMode, type InputModeResult } from "./input-mode-detection";
import { normalizeClassification, type ClassificationResult } from "./document-classification";
import {
  buildExtractionPrompt,
  buildFileBasedExtractionPrompt,
  buildRescueExtractionPrompt,
  selectExcerptForExtraction,
  validateExtractionByType,
  wrapExtractionPromptWithDocumentText,
  type ExtractedContractByType,
  type SchemaPromptBundleContext,
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
import { applyExtractedFieldAliasNormalizations } from "./extraction-field-alias-normalize";
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
import {
  mapAiClassifierToClassificationResult,
  primaryTypeFallbackFromPromptKey,
} from "./ai-review-type-mapper";
import { getAiReviewPromptId, getAiReviewPromptVersion, type AiReviewPromptKey } from "./prompt-model-registry";
import { fingerprintOpenAiPromptId } from "./ai-review-prompt-rollout";
import { isAiReviewLlmPostprocessEnabled, runAiReviewDecisionLlm } from "./ai-review-llm-postprocess";
import { buildAiReviewExtractionPromptVariables, capAiReviewPromptString } from "./ai-review-prompt-variables";
import { zodIssuesToAdvisorBriefMessages } from "./zod-issues-advisor-copy";
import {
  mergePartialParsedIntoManualStub,
  parseJsonObjectFromAiReviewRaw,
  tryCoerceReviewEnvelopeAfterValidationFailure,
} from "./coerce-partial-review-envelope";
import { maybeRewriteInsuranceProposalExtractionRaw } from "./legacy-insurance-proposal-envelope";
import { deriveEnvelopeFlags } from "./derive-envelope-flags";
import type {
  ContractPipelineOptions,
  PipelinePreprocessMeta,
  PipelineResult,
  PipelineSuccess,
} from "./contract-understanding-pipeline";
import { getPipelineVersionInfo } from "./pipeline-versioning";
import type { DocumentReviewEnvelope } from "./document-review-types";
import { resolveHybridInvestmentDocumentType } from "./ai-review-document-type-signals";
import { applyProductFamilyTextOverride, applyRouterInputTextOverrides } from "./document-classification-overrides";
import { resolveDocumentSchema } from "./document-schema-router";
import {
  COMBINED_CLASSIFY_AND_EXTRACT_MIN_HINT_CHARS,
  runCombinedClassifyAndExtract,
  type BundleSectionTexts,
} from "./combined-extraction";

/**
 * Returns true when none of the required fields for this document type have a non-empty extracted value.
 */
function hasZeroRequiredFieldValues(
  extractedFields: Record<string, { value?: unknown; status?: string } | undefined>,
  documentType: ContractDocumentType
): boolean {
  const schema = resolveDocumentSchema(documentType);
  const required = schema.extractionRules.required;
  for (const path of required) {
    const key = path.replace(/^extractedFields\./, "");
    const field = extractedFields[key];
    if (field && typeof field.value === "string" && field.value.trim() && field.status !== "missing") {
      return false;
    }
  }
  return true;
}

/**
 * Runs an ultra-focused rescue extraction when the primary PDF pass returned 0 required fields.
 * Returns a partial extractedFields record with only the fields found, or null if the call fails.
 */
async function runRescueExtractionPass(
  fileUrl: string,
  documentType: ContractDocumentType
): Promise<Record<string, { value: string; status: string; confidence: number }> | null> {
  try {
    const rescuePrompt = buildRescueExtractionPrompt(documentType);
    const raw = await createResponseWithFile(fileUrl, rescuePrompt, {
      routing: { category: "ai_review" },
    });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, { value: string; status: string; confidence: number }> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (val !== null && val !== undefined && String(val).trim()) {
        out[key] = { value: String(val).trim(), status: "extracted", confidence: 0.75 };
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
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

/** Compact JSON for classifier `adobe_signals` — no document body. */
function buildAdobeSignalsSummary(meta?: PipelinePreprocessMeta | null): string {
  if (!meta) return "";
  return JSON.stringify({
    adobePreprocessed: Boolean(meta.adobePreprocessed),
    preprocessStatus: meta.preprocessStatus ?? null,
    preprocessMode: meta.preprocessMode ?? null,
    preprocessWarningCount: meta.preprocessWarnings?.length ?? 0,
    readabilityScore: typeof meta.readabilityScore === "number" ? meta.readabilityScore : null,
    ocrConfidenceEstimate: typeof meta.ocrConfidenceEstimate === "number" ? meta.ocrConfidenceEstimate : null,
  });
}

function logPipelineEvent(phase: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[ai-review-v2] ${phase}`, JSON.stringify(payload));
}

/** Saves one OpenAI file call when preprocess already proves a text-heavy PDF. */
function tryInferInputModeFromPreprocess(
  meta: PipelinePreprocessMeta | null | undefined,
  hintLength: number
): InputModeResult | null {
  if (meta?.preprocessMode === "pdf_parse_fallback" && hintLength > 0) {
    return {
      inputMode: "text_pdf",
      confidence: 0.9,
      extractionMode: "text",
      ocrRequired: false,
      pageCount: meta.pageCountEstimate ?? undefined,
      qualityWarnings: [],
      extractionWarnings: ["input_mode_inferred_from_pdf_parse_fallback"],
    };
  }
  if (process.env.AI_REVIEW_SKIP_INPUT_MODE_WHEN_PREPROCESS_OK !== "true") return null;
  if (hintLength < 800) return null;
  if (typeof meta?.readabilityScore !== "number" || meta.readabilityScore < 68) return null;
  return {
    inputMode: "text_pdf",
    confidence: 0.85,
    extractionMode: "text",
    ocrRequired: false,
    pageCount: meta.pageCountEstimate ?? undefined,
    qualityWarnings: [],
    extractionWarnings: ["input_mode_inferred_from_preprocess"],
  };
}

async function tryExtractPaymentWithPrompt(
  fileUrl: string,
  mimeType: string | null | undefined,
  documentText: string,
  ctx: { classificationReasons: string[]; adobeSignals: string; filename: string }
): Promise<
  | { ok: true; data: PaymentInstructionExtraction; raw: string }
  | { ok: false; error: string; errorCode?: string }
> {
  const promptId = getAiReviewPromptId("paymentInstructionsExtraction");
  if (!promptId) {
    return extractPaymentInstructionsFromDocument(fileUrl, mimeType);
  }
  const variables = buildAiReviewExtractionPromptVariables({
    documentText,
    classificationReasons: ctx.classificationReasons,
    adobeSignals: ctx.adobeSignals,
    filename: ctx.filename,
  });
  const res = await createAiReviewResponseFromPrompt(
    {
      promptKey: "paymentInstructionsExtraction",
      promptId,
      version: getAiReviewPromptVersion("paymentInstructionsExtraction"),
      variables,
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

function classificationForResolvedDocumentType(
  documentType: ContractDocumentType,
  classification: ClassificationResult
): ClassificationResult {
  if (documentType === classification.primaryType) return classification;
  if (
    documentType === "life_insurance_investment_contract" &&
    classification.primaryType === "life_insurance_modelation"
  ) {
    return {
      ...classification,
      primaryType: documentType,
      lifecycleStatus: "final_contract",
      documentIntent: "creates_new_product",
      reasons: [...classification.reasons, "hybrid_contract_signals_detected"],
    };
  }
  return {
    ...classification,
    primaryType: documentType,
  };
}

function applyResolvedClassificationToFallbackEnvelope(
  envelope: DocumentReviewEnvelope,
  documentType: ContractDocumentType,
  classification: ClassificationResult,
  extractionRoute: ExtractionRoute
): void {
  const normPipeline = mapPrimaryToPipelineClassification(documentType);
  envelope.documentClassification.primaryType = documentType;
  envelope.documentClassification.lifecycleStatus = classification.lifecycleStatus;
  envelope.documentClassification.documentIntent = classification.documentIntent;
  envelope.documentClassification.subtype = classification.subtype;
  envelope.documentClassification.confidence = classification.confidence;
  envelope.documentClassification.reasons = [...classification.reasons];
  envelope.documentMeta.normalizedPipelineClassification = normPipeline;
  envelope.documentMeta.rawPrimaryClassification = classification.primaryType;
  envelope.documentMeta.pipelineRoute =
    extractionRoute === "supporting_document" ? "supporting_document" : "contract_intake";
  envelope.documentMeta.extractionRoute = extractionRoute;
}

function classificationFromEnvelope(envelope: DocumentReviewEnvelope): ClassificationResult {
  return normalizeClassification({
    primaryType: envelope.documentClassification.primaryType,
    subtype: envelope.documentClassification.subtype,
    lifecycleStatus: envelope.documentClassification.lifecycleStatus,
    documentIntent: envelope.documentClassification.documentIntent,
    confidence: envelope.documentClassification.confidence,
    reasons: envelope.documentClassification.reasons,
  });
}

/**
 * When the stored supportingDocumentExtraction prompt returns generic "bank_statement" as its
 * document type label, try to infer a more specific supporting subtype from the response.
 *
 * The stored prompt returns a DocumentReviewEnvelope JSON, so signals come from:
 *   1. documentClassification.primaryType (if the stored prompt set it)
 *   2. extractedFields.documentType.value (explicit documentType instruction in prompt)
 *   3. Top-level documentType key (flat/legacy shape from some stored prompts)
 *   4. normalizedSubtype or similar
 *   5. Presence of payslip/tax-return specific field keys in extractedFields
 */
function inferSupportingSubtypeFromPromptResponse(
  parsed: Record<string, unknown>
): ContractDocumentType | null {
  // Path 1: documentClassification.primaryType
  const dc = parsed.documentClassification as Record<string, unknown> | undefined;
  const dcPrimary = typeof dc?.primaryType === "string" ? dc.primaryType.toLowerCase().replace(/[-_\s]/g, "") : "";
  if (dcPrimary === "payslip" || dcPrimary === "payslip_document") return "payslip_document";
  if (dcPrimary === "corporate_tax_return" || dcPrimary === "corporatetaxreturn") return "corporate_tax_return";

  // Path 2: extractedFields.documentType.value (stored prompt explicit field)
  const ef = parsed.extractedFields as Record<string, unknown> | undefined;
  const efDt = ef?.documentType;
  const efDtValue = typeof efDt === "object" && efDt !== null
    ? String((efDt as Record<string, unknown>).value ?? "")
    : typeof efDt === "string" ? efDt : "";
  const dtFromEf = efDtValue.toLowerCase().replace(/[-_\s]/g, "");
  if (dtFromEf === "payslip" || dtFromEf === "payslip_document" || dtFromEf === "salarydocument" || dtFromEf === "payslippayment") return "payslip_document";
  if (dtFromEf === "corporate_tax_return" || dtFromEf === "taxreturn" || dtFromEf === "taxdeclaration" || dtFromEf === "corporatetax" || dtFromEf === "danove_priznani") return "corporate_tax_return";

  // Path 3: top-level documentType / normalizedSubtype (flat/legacy shape from stored prompt)
  // Stored prompt may return documentType as a plain string at top-level (not nested in envelope)
  const topDtRaw = String(parsed.documentType ?? parsed.documentTypeLabel ?? parsed.normalizedSubtype ?? parsed.subtypeLabel ?? "").toLowerCase();
  const topDt = topDtRaw.replace(/[-_\s]/g, "");
  if (topDt === "payslip" || topDt === "payslip_document" || topDt === "salarydocument" || topDt === "salarislip" || topDtRaw.includes("payslip") || topDtRaw.includes("výplatní lístek") || topDtRaw.includes("vyplatni listek")) return "payslip_document";
  if (topDt === "corporate_tax_return" || topDt === "taxreturn" || topDt === "taxdeclaration" || topDt === "danove_priznani" || topDt === "danoveprIznani" || topDtRaw.includes("daňov") || topDtRaw.includes("tax_return") || topDtRaw.includes("taxreturn") || topDtRaw.includes("corporate tax") || topDtRaw.includes("tax return")) return "corporate_tax_return";

  // Path 4: field-presence heuristics — look at extractedFields keys and their values.
  // Important: use SPECIFIC signals that are not shared between payslip and tax return.
  // Avoid generic signals like grossIncome/netIncome which appear in both types.
  const efKeys = ef ? new Set(Object.keys(ef).map((k) => k.toLowerCase().replace(/[-_]/g, ""))) : new Set<string>();
  const topKeys = new Set(Object.keys(parsed).map((k) => k.toLowerCase().replace(/[-_]/g, "")));
  const allKeys = new Set([...efKeys, ...topKeys]);

  // Bank-statement exclusion: if these keys are present, it's more likely a bank statement
  const bankStatementSignals = ["statementbalance", "openingbalance", "closingbalance", "statementperiod"];
  if (bankStatementSignals.some((s) => allKeys.has(s))) return null;

  // Payslip: must have employer OR employee — these don't appear in tax returns
  const strongPayslipSignals = ["employer", "employee", "employeename", "employername", "payoutaccount", "grosspay", "netpay", "hrubazmda", "cistamzda", "hrubamzda"];
  // Tax return: must have tax-specific signals that don't appear in payslips
  const strongTaxReturnSignals = ["taxperiodfrom", "taxperiodto", "taxtype", "taxpayername", "taxamountdue", "taxbase", "mainbusinessactivity", "danoveobdobi", "zakladDane", "ico", "dic"];

  if (strongTaxReturnSignals.some((s) => allKeys.has(s))) return "corporate_tax_return";
  if (strongPayslipSignals.some((s) => allKeys.has(s))) return "payslip_document";

  return null;
}

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
  deriveEnvelopeFlags(data);

  const ef = data.extractedFields;
  const legacyPaymentAmount = (() => {
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
      const f = ef[k];
      if (f && f.status === "extracted" && f.value != null && String(f.value).trim() !== "") {
        return f.value as number | string;
      }
    }
    return null;
  })();
  const legacyPaymentFreq =
    (ef.paymentFrequency?.status === "extracted" && ef.paymentFrequency.value != null
      ? ef.paymentFrequency.value
      : null) ??
    (ef.premiumFrequency?.status === "extracted" && ef.premiumFrequency.value != null
      ? ef.premiumFrequency.value
      : null);

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
    contractNumber: ef.contractNumber?.value as string | null,
    institutionName: (ef.institutionName?.value ?? ef.insurer?.value) as string | null,
    client: {
      email: (ef.clientEmail?.value ?? ef.email?.value) as string | null,
      phone: (ef.clientPhone?.value ?? ef.phone?.value) as string | null,
      personalId: ef.maskedPersonalId?.value as string | null,
      companyId: ef.companyId?.value as string | null,
    },
    paymentDetails: {
      amount: legacyPaymentAmount,
      currency: ef.currency?.value as string | null,
      frequency: legacyPaymentFreq as string | null,
      iban: ef.iban?.value as string | null,
      accountNumber: ef.bankAccount?.value as string | null,
      variableSymbol: ef.variableSymbol?.value as string | null,
    },
    effectiveDate: ef.policyStartDate?.value as string | null,
    expirationDate: ef.policyEndDate?.value as string | null,
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

  const hint = (options?.ruleBasedTextHint ?? "").trim();

  // Prefer structured source (from Adobe structuredData.json) over markdown hint.
  // Structured source provides exact per-page text without markdown conversion artifacts.
  const structuredText = (options?.structuredSource?.fullText ?? "").trim();
  const useStructuredSource = structuredText.length > 0 && structuredText.length >= hint.length * 0.8;
  const documentTextForExtraction = useStructuredSource ? structuredText : hint;

  if (useStructuredSource) {
    trace.coreExtractionSource = "adobe_structured_pages";
    trace.warnings = [
      ...(trace.warnings ?? []),
      `structured_source_active:${options!.structuredSource!.pageCount}p`,
    ];
  } else if (hint.length === 0) {
    trace.coreExtractionSource = "fallback";
    trace.warnings = [...(trace.warnings ?? []), "empty_hint_file_based_extraction"];
  } else {
    trace.coreExtractionSource = "markdown";
  }

  const inferredInputMode = tryInferInputModeFromPreprocess(options?.preprocessMeta ?? null, documentTextForExtraction.length);

  let inputModeResult: Awaited<ReturnType<typeof detectInputMode>>;
  try {
    if (inferredInputMode) {
      inputModeResult = inferredInputMode;
      trace.warnings = [...(trace.warnings ?? []), "skipped_detect_input_mode_preprocess_ok"];
    } else {
      inputModeResult = await detectInputMode(fileUrl, mimeType);
    }
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
  trace.pageCount =
    inputModeResult.pageCount ?? options?.preprocessMeta?.pageCountEstimate ?? trace.pageCount;
  trace.warnings = [...(trace.warnings ?? []), ...inputModeResult.extractionWarnings];

  const textCov =
    typeof trace.textCoverageEstimate === "number"
      ? trace.textCoverageEstimate
      : typeof options?.preprocessMeta?.ocrConfidenceEstimate === "number"
        ? options.preprocessMeta.ocrConfidenceEstimate
        : undefined;

  const allowCombinedSingleCall =
    documentTextForExtraction.length >= COMBINED_CLASSIFY_AND_EXTRACT_MIN_HINT_CHARS &&
    inputModeResult.inputMode === "text_pdf" &&
    inputModeResult.extractionMode === "text";

  if (allowCombinedSingleCall) {
    trace.extractionSecondPass = "text";
    trace.aiReviewExtractionPromptKey = "combined_single_call";
    const combinedStart = Date.now();
    try {
      const combined = await runCombinedClassifyAndExtract({
        documentText: documentTextForExtraction,
        sourceFileName: options?.sourceFileName ?? null,
        bundleHint: options?.bundleHint ?? null,
        sectionTexts: options?.bundleSectionTexts ?? null,
      });
      trace.extractionDurationMs = Date.now() - combinedStart;

      const combinedClassification = classificationFromEnvelope(combined.envelope);
      const combinedDocumentType = combinedClassification.primaryType;
      trace.documentType = combinedDocumentType;
      trace.classificationConfidence = combinedClassification.confidence;
      trace.rawClassification = `${combinedDocumentType}/${combinedClassification.subtype ?? "unknown"}`;
      trace.selectedSchema = combinedDocumentType;
      trace.supportedForDirectExtraction = true;
      trace.aiReviewRouterOutcome = "combined_single_call";
      trace.aiReviewRouterReasonCodes = ["combined_single_call"];

      const combinedNormPipeline = mapPrimaryToPipelineClassification(combinedDocumentType);
      const combinedExtractionRoute = resolveExtractionRoute(
        combinedNormPipeline,
        combinedClassification.confidence
      );
      trace.normalizedPipelineClassification = combinedNormPipeline;
      trace.extractionRoute = combinedExtractionRoute;

      const resolvedDocumentType = resolveHybridInvestmentDocumentType(
        combinedDocumentType,
        combined.envelope,
        combinedClassification
      );

      // Apply DIP/DPS/PP product family text override in combined extraction path.
      // If text strongly signals DIP/DPS/PP but classification is life_insurance, correct primaryType.
      const combinedFamilyOverride = applyProductFamilyTextOverride(
        // Use life_insurance as the current family when the primary type is life-insurance-based
        resolvedDocumentType.startsWith("life_insurance")
          ? "life_insurance"
          : resolvedDocumentType.startsWith("pension")
            ? "dps"
            : "unknown",
        documentTextForExtraction,
      );
      let finalDocumentType = resolvedDocumentType;
      if (combinedFamilyOverride.overrideApplied && resolvedDocumentType.startsWith("life_insurance")) {
        // Map corrected family → primaryType for the combined path
        const familyToPrimary: Record<string, ContractDocumentType> = {
          dip: "pension_contract",
          dps: "pension_contract",
          pp: "pension_contract",
        };
        const corrected = familyToPrimary[combinedFamilyOverride.productFamily];
        if (corrected) {
          finalDocumentType = corrected;
          allReasons.push(`combined_dip_dps_type_override:${combinedFamilyOverride.overrideReason}`);
          trace.warnings = [
            ...(trace.warnings ?? []),
            `combined_dip_dps_override:${resolvedDocumentType}->${corrected}`,
          ];
        }
      }

      const resolvedClassification = classificationForResolvedDocumentType(
        finalDocumentType,
        combinedClassification
      );
      const resolvedNormPipeline = mapPrimaryToPipelineClassification(finalDocumentType);
      const resolvedExtractionRoute = resolveExtractionRoute(
        resolvedNormPipeline,
        resolvedClassification.confidence
      );
      if (finalDocumentType !== combinedDocumentType) {
        if (resolvedDocumentType !== combinedDocumentType) allReasons.push("hybrid_contract_signals_detected");
        trace.documentType = finalDocumentType;
        trace.normalizedPipelineClassification = resolvedNormPipeline;
        trace.extractionRoute = resolvedExtractionRoute;
      }

      trace.reviewDecisionDurationMs = 0;
      const finalized = finalizeContractPayload({
        data: combined.envelope,
        classification: resolvedClassification,
        inputModeResult,
        extractionRoute: resolvedExtractionRoute,
        normPipeline: resolvedNormPipeline,
        documentType: finalDocumentType,
        options,
        textCov,
        trace,
        allReasons,
      });

      return {
        ...finalized,
        extractionTrace: trace,
      };
    } catch (e) {
      trace.failedStep = undefined;
      trace.extractionDurationMs = Date.now() - combinedStart;
      trace.warnings = [
        ...(trace.warnings ?? []),
        `combined_single_call_failed:${e instanceof Error ? e.message : String(e)}`,
      ];
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
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ai-review-v2] combined_single_call_failed, falling back to classifier+prompt flow", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const classifierPageCount =
    inputModeResult.pageCount ?? options?.preprocessMeta?.pageCountEstimate ?? trace.pageCount ?? null;
  const clsRes = await runAiReviewClassifier({
    fileUrl,
    mimeType,
    documentTextExcerpt: documentTextForExtraction,
    filename: options?.sourceFileName ?? null,
    pageCount: classifierPageCount,
    inputMode: inputModeResult.inputMode,
    adobeSignals: buildAdobeSignalsSummary(options?.preprocessMeta ?? null),
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
  trace.supportedForDirectExtraction = ai.supportedForDirectExtraction !== false;
  let classification = mapAiClassifierToClassificationResult(ai);
  trace.documentType = classification.primaryType;
  trace.classificationConfidence = classification.confidence;
  trace.rawClassification = `${ai.documentType}/${ai.productFamily}/${ai.productSubtype}`;

  // Apply text-based product family override (DIP/DPS/PP) before router.
  // Fixes cases where the LLM classifier returns productFamily="life_insurance" for DIP/DPS/PP documents.
  const familyOverride = applyProductFamilyTextOverride(ai.productFamily, documentTextForExtraction);
  const effectiveProductFamily = familyOverride.productFamily;
  if (familyOverride.overrideApplied) {
    allReasons.push(`product_family_text_override:${familyOverride.overrideReason}`);
    trace.warnings = [
      ...(trace.warnings ?? []),
      `product_family_overridden:${ai.productFamily}->${effectiveProductFamily}:${familyOverride.overrideReason}`,
    ];
    // Keep aiClassifierJson in sync so mappers use the corrected family for field label overrides
    if (trace.aiClassifierJson) {
      (trace.aiClassifierJson as Record<string, unknown>).productFamily = effectiveProductFamily;
    }
  }

  // Rule-based router-input override: fixes AML/compliance, leasing, and life-insurance
  // modelation→contract misclassifications before routing. When applied, re-derives
  // classification so the correct primaryType propagates through extraction.
  const routerInputOverride = applyRouterInputTextOverrides(
    effectiveProductFamily,
    ai.documentType,
    ai.productSubtype,
    documentTextForExtraction,
  );
  let effectiveDocumentType = ai.documentType;
  let effectiveProductSubtype = ai.productSubtype;
  if (routerInputOverride.overrideApplied) {
    effectiveDocumentType = routerInputOverride.documentType;
    effectiveProductSubtype = routerInputOverride.productSubtype;
    // Re-derive classification with the overridden documentType/family/subtype
    // so primaryType, lifecycleStatus and documentIntent are consistent.
    const overriddenAi = {
      ...ai,
      documentType: routerInputOverride.documentType,
      productFamily: routerInputOverride.productFamily,
      productSubtype: routerInputOverride.productSubtype,
    };
    classification = mapAiClassifierToClassificationResult(overriddenAi);
    allReasons.push(`router_input_text_override:${routerInputOverride.overrideReasons.join(",")}`);
    trace.warnings = [
      ...(trace.warnings ?? []),
      `router_input_overridden:${routerInputOverride.overrideReasons.join(",")}`,
    ];
    if (trace.aiClassifierJson) {
      (trace.aiClassifierJson as Record<string, unknown>).documentType = effectiveDocumentType;
    }
  }

  const router = resolveAiReviewExtractionRoute({
    documentType: effectiveDocumentType,
    productFamily: routerInputOverride.overrideApplied ? routerInputOverride.productFamily : effectiveProductFamily,
    productSubtype: effectiveProductSubtype,
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

  const effectivePrimary =
    router.outcome === "extract" && classification.primaryType === "generic_financial_document"
      ? primaryTypeFallbackFromPromptKey(router.promptKey, ai) ?? classification.primaryType
      : classification.primaryType;
  trace.documentType = effectivePrimary;

  const normPipeline = mapPrimaryToPipelineClassification(effectivePrimary);
  trace.normalizedPipelineClassification = normPipeline;
  const extractionRoute: ExtractionRoute = resolveExtractionRoute(normPipeline, classification.confidence);
  trace.extractionRoute = extractionRoute;

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

  if (ai.supportedForDirectExtraction === false && promptKey !== "paymentInstructionsExtraction") {
    const stub = buildManualReviewStubEnvelope({
      classification,
      inputMode: inputModeResult.inputMode as string,
      extractionMode: inputModeResult.extractionMode as string,
      pageCount: inputModeResult.pageCount ?? trace.pageCount ?? null,
      norm: normPipeline,
      route: extractionRoute,
    });
    stub.documentMeta.textCoverageEstimate = textCov;
    stub.reviewWarnings.push({
      code: "not_supported_for_direct_extraction",
      message:
        "Klasifikátor označil dokument jako nevhodný pro plnou automatickou extrakci — zpracujte ručně nebo upravte vstup.",
      severity: "warning",
    });
    trace.selectedSchema = "direct_extraction_unsupported";
    return {
      ok: true,
      processingStatus: "review_required",
      extractedPayload: stub,
      confidence: classification.confidence * 0.55,
      reasonsForReview: [...new Set([...allReasons, "direct_extraction_unsupported"])],
      inputMode: inputModeResult.inputMode,
      extractionMode: inputModeResult.extractionMode,
      detectedDocumentType: classification.primaryType,
      extractionTrace: trace,
      validationWarnings: stub.reviewWarnings as ValidationWarning[],
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  const modeEarly = inputModeResult.extractionMode as string;
  const isScanFallbackEarly = modeEarly === "vision_fallback" || modeEarly === "ocr_enhanced";
  if (
    promptKey !== "paymentInstructionsExtraction" &&
    shouldSkipContractLlmExtractionForScanOcr({
      isScanFallback: isScanFallbackEarly,
      hintLength: documentTextForExtraction.length,
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

  // Payment branch (klasifikátor může vrátit investment_payment_instruction pro FUNDOO / Amundi atd.)
  if (promptKey === "paymentInstructionsExtraction") {
    const paymentPrimaryType: "payment_instruction" | "investment_payment_instruction" =
      effectivePrimary === "investment_payment_instruction" ? "investment_payment_instruction" : "payment_instruction";
    trace.selectedSchema = "payment_instruction_dedicated_v2";
    const extStart = Date.now();
    const payRes = await tryExtractPaymentWithPrompt(fileUrl, mimeType, documentTextForExtraction, {
      classificationReasons: classification.reasons,
      adobeSignals: buildAdobeSignalsSummary(options?.preprocessMeta ?? null),
      filename: options?.sourceFileName?.trim() || "unknown",
    });
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
      const payData = buildPaymentInstructionEnvelope({
        extraction: fallbackExtraction,
        primaryType: paymentPrimaryType,
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
        detectedDocumentType: paymentPrimaryType,
        extractionTrace: trace,
        validationWarnings: payData.reviewWarnings,
        fieldConfidenceMap: null,
        classificationReasons: classification.reasons,
      };
    }

    const payData = buildPaymentInstructionEnvelope({
      extraction: payRes.data,
      primaryType: paymentPrimaryType,
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
      detectedDocumentType: paymentPrimaryType,
      extractionTrace: trace,
      validationWarnings: payData.reviewWarnings,
      fieldConfidenceMap: null,
      classificationReasons: classification.reasons,
    };
  }

  let documentType = effectivePrimary;
  trace.selectedSchema = documentType;
  const mode = inputModeResult.extractionMode as string;
  const isScanFallback = mode === "vision_fallback" || mode === "ocr_enhanced";

  // Build bundle context for schema-level extraction rules when section texts are available
  const schemaBundleContext: SchemaPromptBundleContext | null = options?.bundleHint?.isBundle
    ? {
        hasSensitiveAttachment: options.bundleHint.hasSensitiveAttachment,
        hasInvestmentSection: options.bundleHint.hasInvestmentSection,
        candidateTypes: options.bundleHint.candidateTypes ?? [],
        hasSectionTexts: !!(options.bundleSectionTexts &&
          (options.bundleSectionTexts.contractualText || options.bundleSectionTexts.investmentText)),
      }
    : null;

  const extractionPrompt = buildExtractionPrompt(documentType, isScanFallback, schemaBundleContext);
  const minTextChars = 800;
  const readabilityOk =
    typeof options?.preprocessMeta?.readabilityScore === "number" &&
    options.preprocessMeta.readabilityScore >= 68;
  const isTextPdf = inputModeResult.inputMode === "text_pdf";
  const allowTextSecondPass =
    documentTextForExtraction.length >= minTextChars && !isScanFallback && (isTextPdf || readabilityOk);

  const extractionPromptId = getAiReviewPromptId(promptKey);
  const extractionVersion = getAiReviewPromptVersion(promptKey);

  const extStart = Date.now();
  let rawExtraction: string;
  try {
    let extractionBuilder: "prompt_builder" | "schema_text_wrap" | "file_pdf" | undefined;
    let extractionPmptFingerprint: string | null | undefined;

    if (extractionPromptId && documentTextForExtraction.length >= 400) {
      trace.extractionSecondPass = "prompt_text";
      extractionBuilder = "prompt_builder";
      extractionPmptFingerprint = fingerprintOpenAiPromptId(extractionPromptId);
      const extractionVariables = buildAiReviewExtractionPromptVariables({
        documentText: documentTextForExtraction,
        classificationReasons: classification.reasons,
        adobeSignals: buildAdobeSignalsSummary(options?.preprocessMeta ?? null),
        filename: options?.sourceFileName?.trim() || "unknown",
        bundleSectionTexts: options?.bundleSectionTexts ?? null,
      });
      const pr = await createAiReviewResponseFromPrompt(
        {
          promptKey,
          promptId: extractionPromptId,
          version: extractionVersion,
          variables: extractionVariables,
        },
        { store: false, routing: { category: "ai_review" } }
      );
      if (!pr.ok) {
        throw new Error(pr.error);
      }
      rawExtraction = pr.text;
    } else if (allowTextSecondPass) {
      trace.extractionSecondPass = "text";
      extractionBuilder = "schema_text_wrap";
      extractionPmptFingerprint = null;
      const wrapped = wrapExtractionPromptWithDocumentText(
        extractionPrompt,
        documentTextForExtraction,
        undefined,
        options?.bundleSectionTexts ?? null,
      );
      rawExtraction = await createResponse(wrapped, { routing: { category: "ai_review" } });
    } else {
      trace.extractionSecondPass = "pdf";
      extractionBuilder = "file_pdf";
      extractionPmptFingerprint = null;
      const fileBasedPrompt = buildFileBasedExtractionPrompt(documentType);
      rawExtraction = await createResponseWithFile(fileUrl, fileBasedPrompt, {
        routing: { category: "ai_review" },
      });
    }

    if (extractionBuilder) {
      trace.aiReviewExtractionBuilder = extractionBuilder;
      trace.aiReviewExtractionPmptFingerprint =
        extractionPmptFingerprint === undefined ? null : extractionPmptFingerprint;
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

  rawExtraction = maybeRewriteInsuranceProposalExtractionRaw(rawExtraction, {
    promptKey,
    documentType,
    classification,
    normalizedPipeline: normPipeline,
  });

  const parsedExtractionObj = parseJsonObjectFromAiReviewRaw(rawExtraction);

  // For supporting-doc prompt: refine generic bank_statement to specific subtype BEFORE validation,
  // so the correct schema (payslip_document / corporate_tax_return) is used for validation and coercion.
  // Uses 3-tier fallback: (1) prompt response signals, (2) original classifier documentType, (3) stays bank_statement.
  if (documentType === "bank_statement" && promptKey === "supportingDocumentExtraction") {
    const refinedType = parsedExtractionObj
      ? inferSupportingSubtypeFromPromptResponse(parsedExtractionObj)
      : null;
    if (refinedType) {
      documentType = refinedType;
      trace.selectedSchema = documentType;
    } else {
      // Fallback: trust the classifier's effective document type / product subtype when the stored prompt
      // returns a generic "bank_statement" shape (older stored prompt without specific subtype instructions).
      const rawDt = String(effectiveDocumentType ?? "").toLowerCase().replace(/[-_\s]/g, "");
      const rawSub = String(effectiveProductSubtype ?? "").toLowerCase().replace(/[-_\s]/g, "");
      const combined = rawDt + " " + rawSub;
      if (combined.includes("taxreturn") || combined.includes("corporatetax") || combined.includes("danoveprIznani") || combined.includes("taxdeclaration") || combined.includes("selfemployedtax")) {
        documentType = "corporate_tax_return";
        trace.selectedSchema = documentType;
      } else if (combined.includes("payslip") || combined.includes("salary") || combined.includes("mzda") || combined.includes("payroll") || combined.includes("incomeproof")) {
        documentType = "payslip_document";
        trace.selectedSchema = documentType;
      }
    }
  }

  const valStart = Date.now();
  let validationOutcome = validateExtractionByType(rawExtraction, documentType);
  trace.validationDurationMs = Date.now() - valStart;

  const parsedExtractionTopKeys =
    parsedExtractionObj && typeof parsedExtractionObj === "object"
      ? Object.keys(parsedExtractionObj).slice(0, 24)
      : [];

  if (!validationOutcome.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ai-review] extraction_validation_soft_fail", {
        documentType,
        aiReviewExtractionPromptKey: trace.aiReviewExtractionPromptKey,
        extractionRoute: trace.extractionRoute,
        normalizedPipelineClassification: trace.normalizedPipelineClassification,
        issueCount: validationOutcome.issues.length,
        topPaths: validationOutcome.issues.slice(0, 8).map((i) => i.path.join(".") || "(root)"),
        responseKeys: parsedExtractionTopKeys,
        rawHeadLength: Math.min(240, rawExtraction.length),
      });
    }
    const coercedData = parsedExtractionObj
      ? tryCoerceReviewEnvelopeAfterValidationFailure(parsedExtractionObj, documentType, classification)
      : null;
    if (coercedData) {
      trace.warnings = [...(trace.warnings ?? []), "extraction_validation_coerced"];
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ai-review] extraction_validation_coerced", {
          documentType,
          promptKey,
          extractionRoute: trace.extractionRoute,
          normalizedPipelineClassification: trace.normalizedPipelineClassification,
          extractedFieldCount: Object.keys(coercedData.extractedFields ?? {}).length,
          originalIssueCount: validationOutcome.issues.length,
        });
      }
      for (const message of zodIssuesToAdvisorBriefMessages(validationOutcome.issues, 8)) {
        coercedData.reviewWarnings.push({
          code: "extraction_schema_validation",
          message,
          severity: "info",
        });
      }
      coercedData.reviewWarnings.push({
        code: "partial_extraction_coerced",
        message:
          "Část struktury odpovědi z modelu byla po uložení upravena kvůli validaci (např. doplnění stavu pole). Ověřte hodnoty oproti PDF.",
        severity: "warning",
      });
      allReasons.push("partial_extraction_coerced");
      validationOutcome = { ok: true, data: coercedData };
      // Rescue pass: if coercion left 0 required fields with values and we came via file-based path, retry with focused prompt.
      if (trace.extractionSecondPass === "pdf" && hasZeroRequiredFieldValues(coercedData.extractedFields ?? {}, documentType)) {
        const rescued = await runRescueExtractionPass(fileUrl, documentType);
        if (rescued) {
          for (const [k, v] of Object.entries(rescued)) {
            coercedData.extractedFields[k] = v as DocumentReviewEnvelope["extractedFields"][string];
          }
          trace.warnings = [...(trace.warnings ?? []), "rescue_extraction_merged"];
        }
      }
      // Fallback for stored-prompt path: when OpenAI stored prompt returned very few valid fields
      // after coercion (< 3 populated required fields), retry with schema_text_wrap (local template /
      // Claude) to recover extraction data. This handles non-deterministic OpenAI stored prompt
      // failures for DIP/investment documents.
      const storedPromptPopulatedFieldCount = Object.values(coercedData.extractedFields ?? {}).filter((f) => {
        const v = f?.value;
        return v != null && String(v).trim() && String(v) !== "null" && String(v) !== "unknown";
      }).length;
      if (
        trace.extractionSecondPass === "prompt_text" &&
        storedPromptPopulatedFieldCount < 3 &&
        allowTextSecondPass
      ) {
        try {
          trace.warnings = [...(trace.warnings ?? []), "stored_prompt_zero_fields_text_fallback"];
          const wrapped = wrapExtractionPromptWithDocumentText(
            extractionPrompt,
            documentTextForExtraction,
            undefined,
            options?.bundleSectionTexts ?? null,
          );
          const fallbackRaw = await createResponse(wrapped, { routing: { category: "ai_review" } });
          const fallbackValidation = validateExtractionByType(fallbackRaw, documentType);
          if (fallbackValidation.ok) {
            const fallbackFields = fallbackValidation.data.extractedFields ?? {};
            const nonEmptyKeys = Object.keys(fallbackFields).filter((k) => {
              const v = fallbackFields[k]?.value;
              return v != null && String(v).trim() && String(v) !== "null" && String(v) !== "unknown";
            });
            if (nonEmptyKeys.length > 0) {
              Object.assign(coercedData.extractedFields, fallbackFields);
              trace.warnings = [...(trace.warnings ?? []), "stored_prompt_fallback_text_merged"];
            }
          }
        } catch {
          // Fallback failed silently — keep original coerced (0-field) result
        }
      }
    }
  }

  if (!validationOutcome.ok) {
    const stub = buildManualReviewStubEnvelope({
      classification,
      inputMode: inputModeResult.inputMode as string,
      extractionMode: inputModeResult.extractionMode as string,
      pageCount: inputModeResult.pageCount ?? trace.pageCount ?? null,
      norm: normPipeline,
      route: extractionRoute,
    });
    stub.documentMeta.textCoverageEstimate = textCov;
    for (const message of zodIssuesToAdvisorBriefMessages(validationOutcome.issues, 10)) {
      stub.reviewWarnings.push({
        code: "extraction_schema_validation",
        message,
        severity: "warning",
      });
    }
    const { mergedFieldKeys } = mergePartialParsedIntoManualStub(
      stub,
      parsedExtractionObj,
      rawExtraction.length
    );
    applyExtractedFieldAliasNormalizations(stub);
    const resolvedFallbackType = resolveHybridInvestmentDocumentType(documentType, stub, classification);
    const resolvedFallbackClassification = classificationForResolvedDocumentType(
      resolvedFallbackType,
      classification
    );
    const resolvedFallbackRoute = resolveExtractionRoute(
      mapPrimaryToPipelineClassification(resolvedFallbackType),
      resolvedFallbackClassification.confidence
    );
    applyResolvedClassificationToFallbackEnvelope(
      stub,
      resolvedFallbackType,
      resolvedFallbackClassification,
      resolvedFallbackRoute
    );
    if (mergedFieldKeys.length > 0) {
      allReasons.push("partial_extraction_merged_into_stub");
      stub.reviewWarnings.push({
        code: "partial_extraction_merged",
        message: `Do náhledu bylo doplněno ${mergedFieldKeys.length} polí z částečné odpovědi modelu — struktura neprošla plnou validací. Ověřte oproti dokumentu.`,
        severity: "warning",
      });
    }
    if (resolvedFallbackType !== documentType) {
      allReasons.push("hybrid_contract_signals_detected");
    }
    trace.warnings = [...(trace.warnings ?? []), "extraction_validation_soft_fail"];
    // Rescue pass: stub has 0 required fields with values and extraction was file-based — retry with focused prompt.
    if (trace.extractionSecondPass === "pdf" && hasZeroRequiredFieldValues(stub.extractedFields ?? {}, documentType)) {
      const rescued = await runRescueExtractionPass(fileUrl, documentType);
      if (rescued) {
        for (const [k, v] of Object.entries(rescued)) {
          stub.extractedFields[k] = v as DocumentReviewEnvelope["extractedFields"][string];
        }
        trace.warnings = [...(trace.warnings ?? []), "rescue_extraction_merged"];
      }
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ai-review] extraction_validation_stub_fallback", {
        documentType,
        promptKey,
        mergedExtractedFieldCount: mergedFieldKeys.length,
        emptyStateReason: mergedFieldKeys.length > 0 ? "stub_with_partial_fields" : "stub_empty_fields",
      });
    }
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

  const validated = validationOutcome;
  const resolvedDocumentType = resolveHybridInvestmentDocumentType(
    documentType,
    validated.data,
    classification
  );
  const resolvedClassification = classificationForResolvedDocumentType(
    resolvedDocumentType,
    classification
  );
  const resolvedNormPipeline = mapPrimaryToPipelineClassification(resolvedDocumentType);
  const resolvedExtractionRoute = resolveExtractionRoute(
    resolvedNormPipeline,
    resolvedClassification.confidence
  );
  if (resolvedDocumentType !== documentType) {
    allReasons.push("hybrid_contract_signals_detected");
    trace.documentType = resolvedDocumentType;
    trace.normalizedPipelineClassification = resolvedNormPipeline;
    trace.extractionRoute = resolvedExtractionRoute;
  }

  const rdStart = Date.now();
  // Skip expensive LLM postprocess when extraction is already high-confidence and there are no
  // critical warnings. This cuts ~1-2s from the happy path without quality loss.
  const hasCriticalWarnings = (validated.data.reviewWarnings ?? []).some(
    (w: { severity?: string }) => w.severity === "critical"
  );
  const shouldSkipLlmPostprocess =
    (typeof validated.data.documentMeta?.overallConfidence === "number"
      ? validated.data.documentMeta.overallConfidence
      : validated.data.documentClassification.confidence ?? 0.5) >= 0.8 &&
    !hasCriticalWarnings &&
    allReasons.every((r) => r !== "critical_review_warning");
  if (isAiReviewLlmPostprocessEnabled() && !shouldSkipLlmPostprocess) {
    const extractionSlim = {
      documentClassification: validated.data.documentClassification,
      documentMeta: {
        overallConfidence: validated.data.documentMeta?.overallConfidence,
        normalizedPipelineClassification: validated.data.documentMeta?.normalizedPipelineClassification,
      },
      parties: validated.data.parties,
      extractedFieldKeys: Object.keys(validated.data.extractedFields ?? {}),
    };
    const sectionSummary = {
      overallConfidence: validated.data.documentMeta?.overallConfidence,
      extractedFieldCount: Object.keys(validated.data.extractedFields ?? {}).length,
    };
    const llmRd = await runAiReviewDecisionLlm({
      normalizedDocumentType: String(normPipeline),
      extractionPayloadJson: capAiReviewPromptString(JSON.stringify(extractionSlim)),
      validationWarningsJson: "[]",
      sectionConfidenceSummaryJson: JSON.stringify(sectionSummary),
      inputMode: String(inputModeResult.inputMode),
      preprocessWarningsJson: JSON.stringify(trace.warnings ?? []),
    });
    if (llmRd.ok) {
      trace.llmReviewDecisionText = llmRd.text.slice(0, 4000);
    }
  }
  trace.reviewDecisionDurationMs = Date.now() - rdStart;

  const finalized = finalizeContractPayload({
    data: validated.data,
    classification: resolvedClassification,
    inputModeResult,
    extractionRoute: resolvedExtractionRoute,
    normPipeline: resolvedNormPipeline,
    documentType: resolvedDocumentType,
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
