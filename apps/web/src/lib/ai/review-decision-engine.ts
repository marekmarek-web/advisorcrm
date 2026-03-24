/**
 * Review decision engine for the contract pipeline.
 * Decides extracted | review_required | failed from confidence, validation, and input mode.
 */

import type { ContractProcessingStatus } from "db";
import type { ValidationResult } from "./extraction-validation";
import type { InputMode } from "./input-mode-detection";

export type ReviewDecisionParams = {
  /** Classification confidence 0–1. */
  classificationConfidence: number;
  /** Extraction overall confidence 0–1. */
  extractionConfidence: number;
  /** Validation result. */
  validation: ValidationResult;
  /** Input mode (scan alone does not imply failed). */
  inputMode: InputMode;
  /** True if extraction step failed (no valid JSON, API error). */
  extractionFailed: boolean;
  /** Optional: minimum confidence to allow "extracted" without review. */
  confidenceThreshold?: number;
};

const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Decide processing status: extracted | review_required | failed.
 * - failed: only when extraction truly failed (no valid data, API error).
 * - review_required: low confidence, validation warnings, or scan with uncertain extraction.
 * - extracted: confidence above threshold and no blocking validation issues.
 */
export function decideReviewStatus(params: ReviewDecisionParams): ContractProcessingStatus {
  const {
    classificationConfidence,
    extractionConfidence,
    validation,
    inputMode,
    extractionFailed,
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
  } = params;

  if (extractionFailed) {
    return "failed";
  }

  const hasBlockingValidation = !validation.valid;
  const hasWarnings = validation.warnings.length > 0;
  const lowClassification = classificationConfidence < confidenceThreshold;
  const lowExtraction = extractionConfidence < confidenceThreshold;
  const isScanOrImage = inputMode === "scanned_pdf" || inputMode === "image_document" || inputMode === "mixed_pdf";

  if (hasBlockingValidation) {
    return "review_required";
  }

  if (lowClassification || lowExtraction) {
    return "review_required";
  }

  if (hasWarnings) {
    return "review_required";
  }

  if (isScanOrImage && lowExtraction) {
    return "review_required";
  }

  return "extracted";
}
