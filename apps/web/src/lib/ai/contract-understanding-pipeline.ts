/**
 * Multi-stage contract understanding pipeline.
 * Steps: detect input mode -> classify -> choose schema -> structured extraction -> validation -> review decision.
 */

import { createResponseWithFile } from "@/lib/openai";
import { runCombinedContractIntake } from "./contract-intake-combined";
import { detectInputMode } from "./input-mode-detection";
import { classifyContractDocument } from "./document-classification";
import {
  buildExtractionPrompt,
  validateExtractionByType,
  type ExtractedContractByType,
} from "./extraction-schemas-by-type";
import { validateExtractedContract, type ValidationResult } from "./extraction-validation";
import { decideReviewStatus } from "./review-decision-engine";
import type { ContractProcessingStatus } from "db";
import type { ExtractionTrace } from "./review-queue-repository";
import type { ValidationWarning } from "./extraction-validation";
import { resolveDocumentSchema } from "./document-schema-router";
import { runVerificationPass } from "./document-verification";
import { resolveSensitivityProfile } from "./document-sensitivity";
import { inferDocumentRelationships } from "./document-relationships";

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
};

export type PipelineError = {
  ok: false;
  processingStatus: "failed";
  errorMessage: string;
  extractionTrace?: ExtractionTrace;
  details?: unknown;
};

export type PipelineResult = PipelineSuccess | PipelineError;

export async function runContractUnderstandingPipeline(
  fileUrl: string,
  mimeType?: string | null
): Promise<PipelineResult> {
  const trace: ExtractionTrace = {};
  const allReasons: string[] = [];

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
      return {
        ok: false,
        processingStatus: "failed",
        errorMessage: "Klasifikace dokumentu selhala.",
        extractionTrace: trace,
        details: e instanceof Error ? e.message : String(e),
      };
    }
  }

  trace.inputMode = inputModeResult.inputMode;
  trace.extractionMode = inputModeResult.extractionMode;
  trace.warnings = [...(trace.warnings ?? []), ...inputModeResult.extractionWarnings];

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

  const isScanFallback = inputModeResult.extractionMode === "vision_fallback";

  trace.documentType = classification.primaryType;
  trace.classificationConfidence = classification.confidence;
  if (classification.reasons.length) {
    allReasons.push(...classification.reasons);
  }

  // Step 3 & 4: Schema is chosen by document type (no separate step)
  const documentType = classification.primaryType;
  const schemaDefinition = resolveDocumentSchema(documentType);

  // Step 5: Structured extraction
  const extractionPrompt = buildExtractionPrompt(documentType, isScanFallback);
  let rawExtraction: string;
  try {
    rawExtraction = await createResponseWithFile(fileUrl, extractionPrompt);
  } catch (e) {
    trace.failedStep = "structured_extraction";
    trace.warnings = [...(trace.warnings ?? []), e instanceof Error ? e.message : String(e)];
    return {
      ok: false,
      processingStatus: "failed",
      errorMessage: "Extrakce ze dokumentu selhala.",
      extractionTrace: trace,
      details: e instanceof Error ? e.message : String(e),
    };
  }

  const validated = validateExtractionByType(rawExtraction, documentType);
  if (!validated.ok) {
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
  data.documentMeta.scannedVsDigital =
    inputModeResult.inputMode === "text_pdf"
      ? "digital"
      : inputModeResult.inputMode === "scanned_pdf"
        ? "scanned"
        : "unknown";
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

  // Step 7: Review decision
  const processingStatus = decideReviewStatus({
    classificationConfidence: classification.confidence,
    extractionConfidence,
    validation,
    inputMode: inputModeResult.inputMode,
    extractionFailed: false,
  });

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
    validationWarnings: [...validation.warnings, ...verification.warnings],
    fieldConfidenceMap,
    classificationReasons: classification.reasons,
  };
}
