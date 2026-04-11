/**
 * High-level document classification for extraction routing (insurance vs payment vs supporting vs manual).
 * Distinct from PrimaryDocumentType (granular) and NormalizedDocumentType (reporting taxonomy).
 */

import type { PrimaryDocumentType } from "./document-review-types";

export const PIPELINE_NORMALIZED_CLASSIFICATIONS = [
  "insurance_contract",
  "insurance_proposal",
  "insurance_amendment",
  "insurance_modelation",
  "payment_instructions",
  "loan_contract",
  "bank_statement",
  "income_document",
  "investment_contract",
  "unknown",
] as const;

export type PipelineNormalizedClassification = (typeof PIPELINE_NORMALIZED_CLASSIFICATIONS)[number];

export type ExtractionRoute =
  | "payment_instructions"
  | "contract_intake"
  | "supporting_document"
  | "manual_review_only";

export function mapPrimaryToPipelineClassification(
  primary: PrimaryDocumentType
): PipelineNormalizedClassification {
  switch (primary) {
    case "life_insurance_final_contract":
    case "life_insurance_contract":
    case "nonlife_insurance_contract":
      return "insurance_contract";
    case "life_insurance_proposal":
    case "liability_insurance_offer":
    case "precontract_information":
      return "insurance_proposal";
    case "life_insurance_change_request":
    case "insurance_policy_change_or_service_doc":
      return "insurance_amendment";
    case "life_insurance_modelation":
    case "investment_modelation":
      return "insurance_modelation";
    case "payment_instruction":
    case "investment_payment_instruction":
    case "payment_schedule":
      return "payment_instructions";
    case "consumer_loan_contract":
    case "consumer_loan_with_payment_protection":
    case "mortgage_document":
      return "loan_contract";
    case "bank_statement":
      return "bank_statement";
    case "payslip_document":
    case "income_proof_document":
    case "income_confirmation":
    case "corporate_tax_return":
    case "self_employed_tax_or_income_document":
      return "income_document";
    case "life_insurance_investment_contract":
    case "investment_service_agreement":
    case "investment_subscription_document":
    case "pension_contract":
      return "investment_contract";
    // Supporting / identity / medical / consent — should not fall to unknown
    case "generic_financial_document":
    case "financial_analysis_document":
    case "service_agreement":
    case "insurance_comparison":
    case "identity_document":
    case "medical_questionnaire":
    case "consent_or_declaration":
      return "income_document"; // treated as supporting for routing; resolveExtractionRoute sends to supporting_document
    default:
      return "unknown";
  }
}

export function resolveExtractionRoute(
  normalized: PipelineNormalizedClassification,
  classificationConfidence: number
): ExtractionRoute {
  if (normalized === "payment_instructions") return "payment_instructions";
  // Only route to manual_review_only for true unknowns with very low confidence.
  // Any recognizable classification (including income_document used as supporting fallback)
  // gets a real extraction route — fail-open principle.
  if (normalized === "unknown" && classificationConfidence < 0.35) {
    return "manual_review_only";
  }
  // unknown with higher confidence: still try supporting_document extraction (fail-open)
  if (normalized === "unknown") return "supporting_document";
  if (normalized === "bank_statement" || normalized === "income_document") {
    return "supporting_document";
  }
  return "contract_intake";
}

export function isProposalOrModelationLifecycle(lifecycle: string | undefined): boolean {
  if (!lifecycle) return false;
  return (
    lifecycle === "proposal" ||
    lifecycle === "offer" ||
    lifecycle === "illustration" ||
    lifecycle === "modelation" ||
    lifecycle === "non_binding_projection"
  );
}
