/**
 * Quality gates for apply-to-CRM and apply-to-portal workflows.
 * Prevents low-confidence, incomplete, or misclassified data from propagating.
 */

import type { ContractReviewRow, ExtractionTrace } from "./review-queue-repository";
import {
  isLifecycleFinalInput,
  isLifecycleNonFinalProjection,
  PRIMARY_TYPES_MODELATION_NON_FINAL,
} from "./lifecycle-semantics";

export type ApplyReadiness = "ready_for_apply" | "review_required" | "blocked_for_apply";

export type ApplyGateResult = {
  readiness: ApplyReadiness;
  /** Hard blocks: bad classification, pipeline failure, ambiguous client, payment critical gaps, etc. */
  blockedReasons: string[];
  /** Blocks portal/CRM apply until override — non-final proposals/modelations (not red “Blokováno” in UI). */
  applyBarrierReasons: string[];
  warnings: string[];
};

/** All gate codes that must be cleared (or overridden) before apply. */
export function applyReasonsPendingOverride(gate: ApplyGateResult): string[] {
  return [...gate.blockedReasons, ...gate.applyBarrierReasons];
}

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
  /** Extended fields for client portal payment setup */
  monthlyPremium?: string | number | null;
  annualPremium?: string | number | null;
  totalPremium?: string | number | null;
  firstPaymentAmount?: string | number | null;
  firstPaymentDate?: string | null;
  dueDate?: string | null;
  paymentMethod?: string | null;
  accountForRepayment?: string | null;
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

const WARN_ONLY_DOCUMENT_TYPES = new Set([
  "unknown",
  "supporting_document",
  "bank_statement",
  "income_document",
]);

/**
 * Document primary types that are payment instructions.
 * When they appear on a NON-payment_instructions extraction route,
 * it means the document was misclassified as a contract → hard block.
 * On the normal `payment_instructions` route they go through the payment gate, not this set.
 */
const PAYMENT_INSTRUCTION_TYPES = new Set([
  "payment_instruction",
  "payment_instructions",
]);

function hasVal(v: unknown): boolean {
  return v != null && String(v).trim() !== "";
}

function hasPaymentTarget(p: PaymentApplyPayload): boolean {
  return hasVal(p.iban) || (hasVal(p.accountNumber) && hasVal(p.bankCode));
}

export function evaluateApplyReadiness(row: ContractReviewRow): ApplyGateResult {
  const blocked: string[] = [];
  const applyBarrier: string[] = [];
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

  const payload = row.extractedPayload as Record<string, unknown> | null | undefined;
  const docClass = payload?.documentClassification as Record<string, unknown> | undefined;
  const lifecycleFromEnvelope =
    typeof docClass?.lifecycleStatus === "string" ? docClass.lifecycleStatus : "";
  const lifecycleFromRow = typeof row.lifecycleStatus === "string" ? row.lifecycleStatus : "";
  const corrected =
    typeof row.correctedLifecycleStatus === "string" && row.correctedLifecycleStatus.trim() !== ""
      ? row.correctedLifecycleStatus
      : "";
  const lifecycle = corrected || lifecycleFromEnvelope || lifecycleFromRow;
  const lifecycleTreatsAsFinalInput = isLifecycleFinalInput(lifecycle);

  // Modelation primary types — skip when lifecycle (or advisor override) is a final-input lifecycle.
  if (
    !lifecycleTreatsAsFinalInput &&
    (PRIMARY_TYPES_MODELATION_NON_FINAL.has(normalizedType) ||
      PRIMARY_TYPES_MODELATION_NON_FINAL.has(docType))
  ) {
    applyBarrier.push("PROPOSAL_NOT_FINAL");
  }

  if (!lifecycleTreatsAsFinalInput && isLifecycleNonFinalProjection(lifecycle)) {
    applyBarrier.push("NON_FINAL_LIFECYCLE");
  }

  if (WARN_ONLY_DOCUMENT_TYPES.has(normalizedType) || WARN_ONLY_DOCUMENT_TYPES.has(docType)) {
    warnings.push("UNSUPPORTED_DOCUMENT_TYPE");
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

  // Verdict-based client match gating.
  // If matchVerdict is present (top-level column OR in extractionTrace), use it deterministically.
  // For legacy rows (null verdict), fall back to raw candidate count.
  const rowAny = row as Record<string, unknown>;
  const matchVerdict = (rowAny.matchVerdict as string | null | undefined)
    ?? (trace?.matchVerdict as string | null | undefined);
  if (!row.matchedClientId && !row.createNewClientConfirmed) {
    const hasLegacyFallback = matchVerdict == null;
    const candidates = row.clientMatchCandidates;
    if (matchVerdict === "ambiguous_match") {
      blocked.push("AMBIGUOUS_CLIENT_MATCH");
    } else if (matchVerdict === "near_match") {
      // Advisory only — not blocking.
      warnings.push("NEAR_MATCH_ADVISORY");
    } else if (hasLegacyFallback && Array.isArray(candidates) && candidates.length > 1) {
      // Legacy fallback: raw candidate count triggers ambiguous block.
      blocked.push("AMBIGUOUS_CLIENT_MATCH");
    }
    // existing_match is auto-resolved — no block needed.
    // no_match proceeds to create-client — no block needed.
  }

  if (trace?.llmClientMatchKind === "ambiguous" && matchVerdict !== "existing_match") {
    // LLM ambiguous without a confirmed existing_match verdict is a hard block.
    // Ambiguity cannot be resolved without advisor action — block apply.
    if (!blocked.includes("AMBIGUOUS_CLIENT_MATCH")) {
      blocked.push("LLM_CLIENT_MATCH_AMBIGUOUS");
    }
  }

  const extractionRoute = trace?.extractionRoute;

  // Extra guard: payment instruction classified on a non-payment route → hard block.
  // Catches (a) normalizedPipelineClassification = "payment_instruction" and
  // (b) envelope documentClassification.primaryType = "payment_instruction"
  // when the pipeline route is not "payment_instructions".
  const primaryTypeFromEnvelope =
    typeof docClass?.primaryType === "string" ? docClass.primaryType : "";
  const isPaymentType =
    PAYMENT_INSTRUCTION_TYPES.has(normalizedType) ||
    PAYMENT_INSTRUCTION_TYPES.has(docType) ||
    PAYMENT_INSTRUCTION_TYPES.has(primaryTypeFromEnvelope);
  if (isPaymentType && extractionRoute !== "payment_instructions") {
    warnings.push("PAYMENT_INSTRUCTION_MISCLASSIFIED_AS_CONTRACT");
  }

  // Sensitivity / publishability → section-level warnings, never document-level blocks.
  const publishHints = payload?.publishHints as Record<string, unknown> | null | undefined;
  if (publishHints) {
    if (publishHints.contractPublishable === false) {
      warnings.push("PUBLISH_HINTS_NOT_PUBLISHABLE");
    }
    if (publishHints.sensitiveAttachmentOnly === true) {
      warnings.push("PUBLISH_HINTS_SENSITIVE_ATTACHMENT_ONLY");
    }
    if (publishHints.needsSplit === true) {
      warnings.push("PUBLISH_HINTS_NEEDS_SPLIT");
    }
    if (publishHints.needsManualValidation === true) {
      warnings.push("PUBLISH_HINTS_NEEDS_MANUAL_VALIDATION");
    }
  }

  // Bundle with sensitive attachment → warning, not barrier.
  const packetMeta = payload?.packetMeta as Record<string, unknown> | null | undefined;
  if (packetMeta?.isBundle === true && packetMeta?.hasSensitiveAttachment === true) {
    warnings.push("PACKET_BUNDLE_WITH_SENSITIVE_ATTACHMENT");
  }

  const payPayload = extractPaymentFromRow(row);
  if (payPayload) {
    if (extractionRoute === "payment_instructions") {
      const payGate = evaluatePaymentApplyReadiness(payPayload);
      blocked.push(...payGate.blockedReasons);
      applyBarrier.push(...payGate.applyBarrierReasons);
      warnings.push(...payGate.warnings);
    } else {
      // Non-payment route: payment fields present but not from dedicated payment_instructions
      // extraction path → apply payment gate as applyBarrier (not just warnings) to prevent
      // uninstructed payment writes. Generic rule: payment write requires explicit payment source.
      const payGate = evaluatePaymentApplyReadiness(payPayload);
      warnings.push(...payGate.warnings);

      // Check if envelope signals explicit payment section (containsPaymentInstructions).
      // If NOT present and the document is an informative type, block payment write path.
      const envelopePayload = payload as Record<string, unknown> | null | undefined;
      const contentFlags = envelopePayload?.contentFlags as Record<string, unknown> | undefined;
      const hasExplicitPaymentSection = contentFlags?.containsPaymentInstructions === true;

      const informativeTypes = new Set([
        "investment_modelation", "investment_service_agreement", "investment_subscription_document",
        "pension_contract", "precontract_information", "insurance_comparison",
        "financial_analysis_document", "life_insurance_modelation",
        "aml_fatca_form", "medical_questionnaire", "consent_or_declaration",
      ]);
      const isInformativeType = informativeTypes.has(normalizedType) || informativeTypes.has(docType);

      // Payment source quality — advisory only at gate level: apply still runs so CRM client/contract
      // resolution is not blocked; payment rows are enforced inside apply-contract-review (enforcePaymentPayload).
      if (!hasExplicitPaymentSection && isInformativeType) {
        warnings.push("PAYMENT_SOURCE_NOT_ELIGIBLE_INFORMATIVE_DOC");
      } else if (!hasExplicitPaymentSection && (hasVal(payPayload.iban) || hasVal(payPayload.accountNumber))) {
        warnings.push("PAYMENT_SOURCE_REQUIRES_ADVISOR_CONFIRMATION");
      }
    }
  }

  const readiness: ApplyReadiness =
    blocked.length > 0
      ? "blocked_for_apply"
      : warnings.length > 0 || applyBarrier.length > 0
        ? "review_required"
        : "ready_for_apply";

  return { readiness, blockedReasons: blocked, applyBarrierReasons: applyBarrier, warnings };
}

export function evaluatePaymentApplyReadiness(p: PaymentApplyPayload): ApplyGateResult {
  const warnings: string[] = [];

  if (!hasVal(p.amount)) {
    warnings.push("PAYMENT_MISSING_AMOUNT");
  }

  if (!hasVal(p.paymentFrequency)) {
    warnings.push("PAYMENT_MISSING_FREQUENCY");
  }

  if (!hasPaymentTarget(p)) {
    warnings.push("PAYMENT_MISSING_TARGET");
  }

  if (!hasVal(p.variableSymbol) && !hasVal(p.constantSymbol)) {
    warnings.push("PAYMENT_MISSING_IDENTIFIER");
  }

  if (!hasVal(p.institutionName) && !hasVal(p.productName)) {
    warnings.push("PAYMENT_MISSING_INSTITUTION");
  }

  const applyBarrierPayment: string[] = [];

  if (p.needsHumanReview) {
    // needsHumanReview=true means the extraction layer flagged this payment as uncertain.
    // Escalate from warning to apply barrier — payment must not be written without confirmation.
    applyBarrierPayment.push("PAYMENT_NEEDS_HUMAN_REVIEW");
  }

  if (typeof p.confidence === "number" && p.confidence < 0.5) {
    warnings.push("PAYMENT_LOW_CONFIDENCE");
  }

  const readiness: ApplyReadiness =
    applyBarrierPayment.length > 0
      ? "review_required"
      : warnings.length > 0
        ? "review_required"
        : "ready_for_apply";

  return { readiness, blockedReasons: [], applyBarrierReasons: applyBarrierPayment, warnings };
}

function extractPaymentFromRow(row: ContractReviewRow): PaymentApplyPayload | null {
  const payload = row.extractedPayload as Record<string, unknown> | null;
  if (!payload) return null;

  const ef = payload.extractedFields as Record<string, { value?: unknown }> | undefined;
  if (ef) {
    const fv = (k: string) => {
      const cell = ef[k];
      return cell?.value != null ? String(cell.value).trim() : undefined;
    };
    const amount = fv("totalMonthlyPremium") || fv("premiumAmount") || fv("regularAmount") || fv("amount");
    const target = fv("iban") || fv("bankAccount") || fv("accountNumber");
    if (amount || target) {
      return {
        amount: amount as string | undefined,
        currency: fv("currency") || undefined,
        paymentFrequency: fv("paymentFrequency") || undefined,
        iban: fv("iban") || undefined,
        accountNumber: fv("bankAccount") || fv("accountNumber") || undefined,
        bankCode: fv("bankCode") || undefined,
        variableSymbol: fv("variableSymbol") || undefined,
        constantSymbol: fv("constantSymbol") || undefined,
        institutionName: fv("insurer") || fv("institutionName") || undefined,
        productName: fv("productName") || undefined,
        monthlyPremium: fv("totalMonthlyPremium") || undefined,
        annualPremium: fv("annualPremium") || undefined,
        totalPremium: fv("totalMonthlyPremium") || fv("premiumAmount") || undefined,
        firstPaymentAmount: fv("firstPaymentAmount") || undefined,
        firstPaymentDate: fv("firstPaymentDate") || undefined,
        dueDate: fv("dueDate") || fv("firstPaymentDate") || undefined,
        paymentMethod: fv("paymentType") || fv("paymentMethod") || undefined,
        accountForRepayment: fv("accountForRepayment") || undefined,
        confidence: typeof (ef.totalMonthlyPremium ?? ef.premiumAmount)?.value === "number"
          ? undefined
          : (row.confidence ?? undefined),
      };
    }
  }

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
