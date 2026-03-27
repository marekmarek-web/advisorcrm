/**
 * Quality gates for apply-to-CRM and apply-to-portal workflows.
 * Prevents low-confidence, incomplete, or misclassified data from propagating.
 */

import type { ContractReviewRow, ExtractionTrace } from "./review-queue-repository";

export type ApplyReadiness = "ready_for_apply" | "review_required" | "blocked_for_apply";

export type ApplyGateResult = {
  readiness: ApplyReadiness;
  blockedReasons: string[];
  warnings: string[];
};

export type PaymentApplyPayload = {
  amount?: string | number | null;
  currency?: string | null;
  paymentFrequency?: string | null;
  iban?: string | null;
  accountNumber?: string | null;
  bankCode?: string | null;
  variableSymbol?: string | null;
  constantSymbol?: string | null;
  institutionName?: string | null;
  productName?: string | null;
  needsHumanReview?: boolean;
  confidence?: number;
};

const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.55;
const EXTRACTION_CONFIDENCE_THRESHOLD = 0.5;
const TEXT_COVERAGE_THRESHOLD = 0.3;

const CRITICAL_FIELD_CONFIDENCE_THRESHOLD = 0.4;
const CRITICAL_FIELDS = [
  "contractnumber",
  "institutionname",
  "client.fullname",
  "client.personalid",
  "paymentdetails.amount",
  "paymentdetails.iban",
];

const PROPOSAL_TYPES = new Set([
  "insurance_proposal",
  "insurance_modelation",
  "life_insurance_proposal",
  "life_insurance_modelation",
  "investment_modelation",
  "precontract_information",
  "liability_insurance_offer",
  "insurance_comparison",
]);

const UNSUPPORTED_FOR_DIRECT_APPLY = new Set([
  "unknown",
  "supporting_document",
  "bank_statement",
  "income_document",
]);

function hasVal(v: unknown): boolean {
  return v != null && String(v).trim() !== "";
}

function hasPaymentTarget(p: PaymentApplyPayload): boolean {
  return hasVal(p.iban) || (hasVal(p.accountNumber) && hasVal(p.bankCode));
}

export function evaluateApplyReadiness(row: ContractReviewRow): ApplyGateResult {
  const blocked: string[] = [];
  const warnings: string[] = [];
  const trace: ExtractionTrace | null = row.extractionTrace;
  const docType = row.detectedDocumentType ?? trace?.documentType ?? "";
  const normalizedType = trace?.normalizedPipelineClassification ?? docType;
  const classConfidence = trace?.classificationConfidence ?? row.confidence ?? 0;
  const extractionConfidence = (row.confidence ?? classConfidence) as number;
  const fieldMap = row.fieldConfidenceMap;

  if (classConfidence < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
    blocked.push("LOW_CLASSIFICATION_CONFIDENCE");
  }

  if (extractionConfidence < EXTRACTION_CONFIDENCE_THRESHOLD) {
    warnings.push("LOW_EXTRACTION_CONFIDENCE");
  }

  if (PROPOSAL_TYPES.has(normalizedType) || PROPOSAL_TYPES.has(docType)) {
    blocked.push("PROPOSAL_NOT_FINAL");
  }

  const payload = row.extractedPayload as Record<string, unknown> | null | undefined;
  const docClass = payload?.documentClassification as Record<string, unknown> | undefined;
  const lifecycle = typeof docClass?.lifecycleStatus === "string" ? docClass.lifecycleStatus : "";
  if (
    lifecycle === "proposal" ||
    lifecycle === "modelation" ||
    lifecycle === "offer" ||
    lifecycle === "illustration"
  ) {
    blocked.push("NON_FINAL_LIFECYCLE");
  }

  if (UNSUPPORTED_FOR_DIRECT_APPLY.has(normalizedType) || UNSUPPORTED_FOR_DIRECT_APPLY.has(docType)) {
    blocked.push("UNSUPPORTED_DOCUMENT_TYPE");
  }

  const textCoverage = trace?.textCoverageEstimate;
  if (typeof textCoverage === "number" && textCoverage < TEXT_COVERAGE_THRESHOLD) {
    warnings.push("LOW_TEXT_COVERAGE");
  }

  if (trace?.preprocessStatus === "failed") {
    warnings.push("PREPROCESS_FAILED");
  }

  if (trace?.failedStep) {
    blocked.push("PIPELINE_FAILED_STEP");
  }

  if (fieldMap) {
    for (const criticalKey of CRITICAL_FIELDS) {
      for (const [mapKey, conf] of Object.entries(fieldMap)) {
        if (
          mapKey.toLowerCase().includes(criticalKey) &&
          conf < CRITICAL_FIELD_CONFIDENCE_THRESHOLD
        ) {
          warnings.push(`LOW_FIELD_CONFIDENCE:${mapKey}`);
        }
      }
    }
  }

  const candidates = row.clientMatchCandidates;
  if (
    !row.matchedClientId &&
    !row.createNewClientConfirmed &&
    Array.isArray(candidates) &&
    candidates.length > 1
  ) {
    blocked.push("AMBIGUOUS_CLIENT_MATCH");
  }

  if (trace?.llmClientMatchKind === "ambiguous") {
    blocked.push("LLM_CLIENT_MATCH_AMBIGUOUS");
  }

  const extractionRoute = trace?.extractionRoute;
  if (extractionRoute === "payment_instructions") {
    const payload = extractPaymentFromRow(row);
    if (payload) {
      const payGate = evaluatePaymentApplyReadiness(payload);
      blocked.push(...payGate.blockedReasons);
      warnings.push(...payGate.warnings);
    }
  }

  const readiness: ApplyReadiness =
    blocked.length > 0
      ? "blocked_for_apply"
      : warnings.length > 0
        ? "review_required"
        : "ready_for_apply";

  return { readiness, blockedReasons: blocked, warnings };
}

export function evaluatePaymentApplyReadiness(p: PaymentApplyPayload): ApplyGateResult {
  const blocked: string[] = [];
  const warnings: string[] = [];

  if (!hasVal(p.amount)) {
    blocked.push("PAYMENT_MISSING_AMOUNT");
  }

  if (!hasVal(p.paymentFrequency)) {
    warnings.push("PAYMENT_MISSING_FREQUENCY");
  }

  if (!hasPaymentTarget(p)) {
    blocked.push("PAYMENT_MISSING_TARGET");
  }

  if (!hasVal(p.variableSymbol) && !hasVal(p.constantSymbol)) {
    warnings.push("PAYMENT_MISSING_IDENTIFIER");
  }

  if (!hasVal(p.institutionName) && !hasVal(p.productName)) {
    warnings.push("PAYMENT_MISSING_INSTITUTION");
  }

  if (p.needsHumanReview) {
    warnings.push("PAYMENT_NEEDS_HUMAN_REVIEW");
  }

  if (typeof p.confidence === "number" && p.confidence < 0.5) {
    warnings.push("PAYMENT_LOW_CONFIDENCE");
  }

  const readiness: ApplyReadiness =
    blocked.length > 0
      ? "blocked_for_apply"
      : warnings.length > 0
        ? "review_required"
        : "ready_for_apply";

  return { readiness, blockedReasons: blocked, warnings };
}

function extractPaymentFromRow(row: ContractReviewRow): PaymentApplyPayload | null {
  const payload = row.extractedPayload as Record<string, unknown> | null;
  if (!payload) return null;
  const debug = payload.debug as Record<string, unknown> | undefined;
  const pay = debug?.paymentInstructionExtraction as Record<string, unknown> | undefined;
  if (!pay) return null;
  return {
    amount: pay.amount as string | number | undefined,
    currency: pay.currency as string | undefined,
    paymentFrequency: pay.paymentFrequency as string | undefined,
    iban: pay.iban as string | undefined,
    accountNumber: pay.accountNumber as string | undefined,
    bankCode: pay.bankCode as string | undefined,
    variableSymbol: pay.variableSymbol as string | undefined,
    constantSymbol: pay.constantSymbol as string | undefined,
    institutionName: pay.institutionName as string | undefined,
    productName: pay.productName as string | undefined,
    needsHumanReview: pay.needsHumanReview as boolean | undefined,
    confidence: pay.confidence as number | undefined,
  };
}

export type ManualGateOverride = {
  overriddenReasons: string[];
  overrideReason: string;
  overriddenBy: string;
  overriddenAt: Date;
};
