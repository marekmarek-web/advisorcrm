/**
 * Eval foundation for contract extraction pipeline.
 * Types for expected structure, comparison, human corrections, eval dataset, and metrics.
 */

import type { ExtractedContractByType } from "./extraction-schemas-by-type";
import type { InputMode } from "./input-mode-detection";
import type { PrimaryDocumentType } from "./document-review-types";

/** Expected extraction structure (e.g. for eval: what we expect from a document). */
export type ExpectedExtractionStructure = ExtractedContractByType;

/** Single correction record: original vs corrected payload. */
export type ContractCorrectionRecord = {
  reviewId: string;
  originalExtractedPayload: ExtractedContractByType | Record<string, unknown>;
  correctedPayload: ExtractedContractByType | Record<string, unknown>;
  correctedFields: string[];
  correctionReason?: string | null;
  correctedBy?: string | null;
  correctedAt?: string | null;
  sourceDocumentType?: string | null;
  inputMode?: string | null;
  extractionMode?: string | null;
};

/** Result of comparing extracted to corrected data (for eval and tuning). */
export type ExtractionComparisonResult = {
  changedFields: string[];
  delta: Record<string, { from: unknown; to: unknown }>;
  addedInCorrection: string[];
  removedInCorrection: string[];
};

// ---------------------------------------------------------------------------
// Eval dataset types (Section 13.2)
// ---------------------------------------------------------------------------

/** A single eval dataset entry: document + expected ground truth. */
export type EvalDatasetEntry = {
  id: string;
  documentName: string;
  documentCategory: PrimaryDocumentType;
  inputMode: InputMode;
  storagePath: string;
  expectedClassification: {
    primaryType: PrimaryDocumentType;
    lifecycleStatus: string;
    isFinalContract: boolean;
    isProposalOnly: boolean;
    containsPaymentInstructions: boolean;
  };
  expectedFields: Record<string, { value: unknown; required: boolean }>;
  expectedClientMatch?: {
    clientName: string;
    personalId?: string;
    companyId?: string;
  };
  notes?: string;
  anonymized: boolean;
  createdAt: string;
};

/** Eval dataset collection. */
export type EvalDataset = {
  version: string;
  entries: EvalDatasetEntry[];
  createdAt: string;
  description: string;
};

// ---------------------------------------------------------------------------
// Eval metrics (Section 13.3)
// ---------------------------------------------------------------------------

export type EvalFieldResult = {
  fieldKey: string;
  expected: unknown;
  extracted: unknown;
  correct: boolean;
  confidence: number;
};

export type EvalDocumentResult = {
  entryId: string;
  documentName: string;
  classificationCorrect: boolean;
  classificationConfidence: number;
  lifecycleCorrect: boolean;
  contentFlagsCorrect: boolean;
  fieldResults: EvalFieldResult[];
  fieldAccuracy: number;
  completeness: number;
  paymentExtractionCorrect: boolean;
  clientMatchCorrect: boolean;
  reviewDecision: "extracted" | "review_required" | "failed";
  processingTimeMs: number;
};

export type EvalRunMetrics = {
  runId: string;
  datasetVersion: string;
  runAt: string;
  totalDocuments: number;
  documentClassificationAccuracy: number;
  contractExtractionCompleteness: number;
  fieldLevelAccuracy: number;
  paymentInstructionExtractionAccuracy: number;
  clientMatchingAccuracy: number;
  reviewRate: number;
  falsePositiveApplyRate: number;
  perTypeMetrics: Record<string, {
    count: number;
    classificationAccuracy: number;
    fieldAccuracy: number;
    completeness: number;
  }>;
  documentResults: EvalDocumentResult[];
};

// ---------------------------------------------------------------------------
// Eval runner helpers
// ---------------------------------------------------------------------------

export function computeFieldAccuracy(results: EvalFieldResult[]): number {
  if (results.length === 0) return 1;
  const correct = results.filter((r) => r.correct).length;
  return correct / results.length;
}

export function computeCompleteness(
  expected: Record<string, { value: unknown; required: boolean }>,
  extracted: Record<string, { value?: unknown; status?: string }>
): number {
  const requiredKeys = Object.entries(expected)
    .filter(([, v]) => v.required)
    .map(([k]) => k);
  if (requiredKeys.length === 0) return 1;
  const satisfied = requiredKeys.filter((k) => {
    const f = extracted[k];
    return f && f.status === "extracted" && f.value != null;
  }).length;
  return satisfied / requiredKeys.length;
}

export function aggregateEvalMetrics(results: EvalDocumentResult[]): Omit<EvalRunMetrics, "runId" | "datasetVersion" | "runAt" | "documentResults"> {
  const total = results.length;
  if (total === 0) {
    return {
      totalDocuments: 0,
      documentClassificationAccuracy: 0,
      contractExtractionCompleteness: 0,
      fieldLevelAccuracy: 0,
      paymentInstructionExtractionAccuracy: 0,
      clientMatchingAccuracy: 0,
      reviewRate: 0,
      falsePositiveApplyRate: 0,
      perTypeMetrics: {},
    };
  }

  const classCorrect = results.filter((r) => r.classificationCorrect).length;
  const avgCompleteness = results.reduce((s, r) => s + r.completeness, 0) / total;
  const avgFieldAcc = results.reduce((s, r) => s + r.fieldAccuracy, 0) / total;
  const paymentDocs = results.filter((r) => r.paymentExtractionCorrect !== undefined);
  const paymentAcc = paymentDocs.length > 0
    ? paymentDocs.filter((r) => r.paymentExtractionCorrect).length / paymentDocs.length
    : 1;
  const clientMatchDocs = results.filter((r) => r.clientMatchCorrect !== undefined);
  const clientMatchAcc = clientMatchDocs.length > 0
    ? clientMatchDocs.filter((r) => r.clientMatchCorrect).length / clientMatchDocs.length
    : 1;
  const reviewCount = results.filter((r) => r.reviewDecision === "review_required").length;
  const falseExtracted = results.filter((r) => r.reviewDecision === "extracted" && !r.classificationCorrect).length;

  const byType = new Map<string, EvalDocumentResult[]>();
  for (const r of results) {
    const key = r.entryId;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(r);
  }

  return {
    totalDocuments: total,
    documentClassificationAccuracy: classCorrect / total,
    contractExtractionCompleteness: avgCompleteness,
    fieldLevelAccuracy: avgFieldAcc,
    paymentInstructionExtractionAccuracy: paymentAcc,
    clientMatchingAccuracy: clientMatchAcc,
    reviewRate: reviewCount / total,
    falsePositiveApplyRate: falseExtracted / total,
    perTypeMetrics: {},
  };
}
