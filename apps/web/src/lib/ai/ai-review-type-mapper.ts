import type { ClassificationResult } from "./document-classification";
import type { AiClassifierOutput } from "./ai-review-classifier";
import type { DocumentIntent, DocumentLifecycleStatus, PrimaryDocumentType } from "./document-review-types";
import type { AiReviewPromptKey } from "./prompt-model-registry";

function n(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function lifecycleFromDocType(dt: string): DocumentLifecycleStatus {
  const d = n(dt);
  if (d === "contract") return "final_contract";
  if (d.includes("final_contract")) return "final_contract";
  if (d === "proposal" || d === "offer" || d === "life_insurance_proposal") return "proposal";
  if (d === "modelation" || d === "life_insurance_modelation") return "modelation";
  if (d === "amendment" || d === "life_insurance_change_request") return "policy_change_request";
  if (d === "statement") return "statement";
  if (d === "payment_instructions") return "confirmation";
  return "unknown";
}

function intentFromClassifier(c: AiClassifierOutput): DocumentIntent {
  if (n(c.recommendedRoute) === "manual_review" || n(c.businessIntent) === "manual_review_only") {
    return "manual_review_required";
  }
  const dt = n(c.documentType);
  if (dt === "proposal" || dt === "modelation" || dt.includes("modelation")) return "illustrative_only";
  if (dt === "amendment" || dt.includes("change_request")) return "modifies_existing_product";
  if (dt === "contract" || dt.includes("final_contract") || dt === "life_insurance_contract") return "creates_new_product";
  return "reference_only";
}

export function mapAiClassifierToPrimaryType(c: AiClassifierOutput): PrimaryDocumentType {
  const dt = n(c.documentType);
  const fam = n(c.productFamily);
  const sub = n(c.productSubtype);

  if (dt === "payment_instructions") {
    if (fam === "investment" || sub.includes("fundoo") || sub.includes("amundi")) {
      return "investment_payment_instruction";
    }
    return "payment_instruction";
  }
  // Life insurance — proposals / modelations / contracts (must run before generic fallback).
  if (fam === "life_insurance") {
    if (dt === "life_insurance_final_contract" || (dt.includes("life_insurance") && dt.includes("final") && dt.includes("contract"))) {
      return "life_insurance_final_contract";
    }
    if (dt === "life_insurance_investment_contract") return "life_insurance_investment_contract";
    if (dt === "life_insurance_contract") return "life_insurance_contract";
    if (dt === "life_insurance_proposal" || dt === "proposal" || dt === "offer") return "life_insurance_proposal";
    if (dt === "life_insurance_modelation" || dt === "modelation") return "life_insurance_modelation";
    if (dt === "contract") {
      if (sub.includes("investment")) return "life_insurance_investment_contract";
      return "life_insurance_contract";
    }
    if (dt === "life_insurance_change_request" || dt === "amendment") return "life_insurance_change_request";
  }
  if (fam === "non_life_insurance") {
    if (dt === "proposal" || dt === "offer") {
      if (sub.includes("liability")) return "liability_insurance_offer";
      if (sub.includes("car")) return "nonlife_insurance_contract";
      return "precontract_information";
    }
    if (dt === "modelation") return "precontract_information";
    if (dt === "contract") return "nonlife_insurance_contract";
    if (dt === "amendment") return "insurance_policy_change_or_service_doc";
  }
  if (fam === "investment") {
    if (dt === "investment_subscription_document") return "investment_subscription_document";
    if (dt === "contract") return "investment_service_agreement";
    if (dt === "proposal" || dt === "offer" || dt === "modelation") return "investment_modelation";
  }
  if (fam === "pp" || fam === "dps") {
    if (dt === "contract" || dt === "amendment" || dt === "pension_contract") return "pension_contract";
  }
  if (fam === "dip") {
    if (dt === "investment_subscription_document") return "investment_subscription_document";
    if (dt === "contract" || dt === "amendment") return "investment_subscription_document";
  }
  if (fam === "building_savings" && (dt === "contract" || dt === "amendment")) return "generic_financial_document";
  if (fam === "loan" && (dt === "contract" || dt === "consumer_loan_contract")) return "consumer_loan_contract";
  if (fam === "mortgage" && (dt === "contract" || dt === "mortgage_document")) return "mortgage_document";
  if (dt === "statement" || dt === "supporting_document") return "bank_statement";
  if (fam === "legacy_financial_product") return "generic_financial_document";
  if (dt === "termination_document") return "generic_financial_document";
  if (dt === "consent_or_identification_document") return "consent_or_declaration";
  if (dt === "confirmation_document") return "income_confirmation";
  if (sub.includes("car") && dt === "contract") return "nonlife_insurance_contract";
  return "generic_financial_document";
}

/**
 * When classifier primary type is still generic, infer canonical type from the extraction prompt
 * the router chose (keeps validateExtractionByType / finalize aligned with the LLM prompt).
 */
export function primaryTypeFallbackFromPromptKey(
  promptKey: AiReviewPromptKey,
  ai: AiClassifierOutput
): PrimaryDocumentType | null {
  const fam = n(ai.productFamily);
  const dt = n(ai.documentType);
  switch (promptKey) {
    case "insuranceProposalModelation":
      if (fam === "life_insurance") {
        return dt === "modelation" ? "life_insurance_modelation" : "life_insurance_proposal";
      }
      if (fam === "non_life_insurance") {
        return "precontract_information";
      }
      if (fam === "investment") return "investment_modelation";
      return "life_insurance_proposal";
    case "insuranceContractExtraction":
      if (fam === "life_insurance") {
        return n(ai.productSubtype).includes("investment")
          ? "life_insurance_investment_contract"
          : "life_insurance_contract";
      }
      if (fam === "non_life_insurance") return "nonlife_insurance_contract";
      return null;
    case "insuranceAmendment":
      if (fam === "life_insurance") return "life_insurance_change_request";
      if (fam === "non_life_insurance") return "insurance_policy_change_or_service_doc";
      return null;
    case "nonLifeInsuranceExtraction":
      return "nonlife_insurance_contract";
    case "carInsuranceExtraction":
      return "nonlife_insurance_contract";
    case "investmentContractExtraction":
      return "investment_service_agreement";
    case "investmentProposal":
      return "investment_modelation";
    case "loanContractExtraction":
    case "mortgageExtraction":
      return fam === "mortgage" ? "mortgage_document" : "consumer_loan_contract";
    case "retirementProductExtraction":
      return "pension_contract";
    case "dipExtraction":
      return "investment_subscription_document";
    case "buildingSavingsExtraction":
      return "generic_financial_document";
    case "supportingDocumentExtraction":
      return "bank_statement";
    case "legacyFinancialProductExtraction":
      return "generic_financial_document";
    default:
      return null;
  }
}

export function mapAiClassifierToClassificationResult(c: AiClassifierOutput): ClassificationResult {
  const primaryType = mapAiClassifierToPrimaryType(c);
  return {
    primaryType,
    subtype: c.productSubtype || "unknown",
    lifecycleStatus: lifecycleFromDocType(c.documentType),
    documentIntent: intentFromClassifier(c),
    confidence: c.confidence,
    reasons: [...(c.reasons ?? []), ...c.warnings],
  };
}
