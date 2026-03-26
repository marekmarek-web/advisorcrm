/**
 * AI Review extraction routing — source of truth for documentType × productFamily × productSubtype.
 * Pure functions; unit-tested without OpenAI.
 */

import type { AiReviewPromptKey } from "./prompt-model-registry";
import { getAiReviewPromptId } from "./prompt-model-registry";

export type AiReviewRouterInput = {
  documentType: string;
  productFamily: string;
  productSubtype: string;
  businessIntent: string;
  recommendedRoute: string;
  confidence: number;
  /** When true, classifier marked document type as unknown while family is set. */
  documentTypeUncertain?: boolean;
};

export type AiReviewRouterResult =
  | {
      outcome: "manual_review";
      reasonCodes: string[];
    }
  | {
      outcome: "review_required";
      reasonCodes: string[];
    }
  | {
      outcome: "extract";
      promptKey: AiReviewPromptKey;
      reasonCodes: string[];
    };

const ANY = "__any__";

function norm(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function amendmentConfidenceOk(confidence: number, threshold: number): boolean {
  return confidence >= threshold;
}

export function getClassifierConfidenceThresholds(): { min: number; amendment: number } {
  const min = Number(process.env.AI_REVIEW_CLASSIFIER_CONFIDENCE_MIN ?? "0.35");
  const amendment = Number(process.env.AI_REVIEW_AMENDMENT_CONFIDENCE_MIN ?? "0.55");
  return {
    min: Number.isFinite(min) ? Math.min(1, Math.max(0, min)) : 0.35,
    amendment: Number.isFinite(amendment) ? Math.min(1, Math.max(0, amendment)) : 0.55,
  };
}

/**
 * Resolve extraction route. Caller must evaluate `payment_instructions` documentType first (invariant);
 * this function still guards it at the top.
 */
export function resolveAiReviewExtractionRoute(input: AiReviewRouterInput): AiReviewRouterResult {
  const dt = norm(input.documentType);
  const fam = norm(input.productFamily);
  const sub = norm(input.productSubtype);
  const intent = norm(input.businessIntent);
  const route = norm(input.recommendedRoute);
  const { min: minConf, amendment: amendTh } = getClassifierConfidenceThresholds();

  const reasonCodes: string[] = [];

  if (route === "manual_review" || route === "manual") {
    return { outcome: "manual_review", reasonCodes: ["recommended_route_manual"] };
  }
  if (intent === "manual_review_only") {
    return { outcome: "manual_review", reasonCodes: ["business_intent_manual_review_only"] };
  }
  if (input.confidence < minConf) {
    return { outcome: "manual_review", reasonCodes: ["low_classifier_confidence"] };
  }
  if (dt === "unknown" && fam === "unknown" && sub === "unknown") {
    return { outcome: "manual_review", reasonCodes: ["triple_unknown"] };
  }
  if (input.documentTypeUncertain && fam !== "unknown") {
    return { outcome: "review_required", reasonCodes: ["document_type_uncertain_with_known_family"] };
  }

  // §8 Invariant
  if (dt === "payment_instructions") {
    return { outcome: "extract", promptKey: "paymentInstructionsExtraction", reasonCodes: ["payment_invariant"] };
  }

  // §1 Life insurance
  if (fam === "life_insurance") {
    if (dt === "contract") {
      const okSub = new Set([
        "risk_life_insurance",
        "investment_life_insurance",
        "capital_life_insurance",
        "unknown",
      ]);
      if (okSub.has(sub) || sub === ANY) {
        return { outcome: "extract", promptKey: "insuranceContractExtraction", reasonCodes: ["life_contract"] };
      }
    }
    if (dt === "proposal" || dt === "modelation") {
      return { outcome: "extract", promptKey: "insuranceProposalModelation", reasonCodes: ["life_proposal_modelation"] };
    }
    if (dt === "amendment") {
      return { outcome: "extract", promptKey: "insuranceAmendment", reasonCodes: ["life_amendment"] };
    }
  }

  // §2 Non-life
  if (fam === "non_life_insurance") {
    if (dt === "contract") {
      if (sub === "car_insurance") {
        return { outcome: "extract", promptKey: "carInsuranceExtraction", reasonCodes: ["car_contract"] };
      }
      const nonLifeSubs = new Set([
        "property_insurance",
        "household_insurance",
        "home_insurance",
        "liability_insurance",
        "travel_insurance",
        "unknown",
      ]);
      if (nonLifeSubs.has(sub) || sub === ANY) {
        return { outcome: "extract", promptKey: "nonLifeInsuranceExtraction", reasonCodes: ["nonlife_contract"] };
      }
    }
    if (dt === "proposal" || dt === "modelation") {
      return { outcome: "extract", promptKey: "insuranceProposalModelation", reasonCodes: ["nonlife_proposal_modelation"] };
    }
    if (dt === "amendment") {
      if (sub === "car_insurance") {
        if (!amendmentConfidenceOk(input.confidence, amendTh)) {
          return { outcome: "review_required", reasonCodes: ["nonlife_car_amendment_low_confidence"] };
        }
        return { outcome: "extract", promptKey: "carInsuranceExtraction", reasonCodes: ["nonlife_car_amendment"] };
      }
      if (!amendmentConfidenceOk(input.confidence, amendTh)) {
        return { outcome: "review_required", reasonCodes: ["nonlife_amendment_low_confidence"] };
      }
      return { outcome: "extract", promptKey: "insuranceAmendment", reasonCodes: ["nonlife_amendment"] };
    }
  }

  // §3 Investment
  if (fam === "investment") {
    if (dt === "contract") {
      return { outcome: "extract", promptKey: "investmentContractExtraction", reasonCodes: ["investment_contract"] };
    }
    if (dt === "proposal" || dt === "modelation") {
      if (getAiReviewPromptId("investmentProposal")) {
        return { outcome: "extract", promptKey: "investmentProposal", reasonCodes: ["investment_proposal_dedicated"] };
      }
      return { outcome: "extract", promptKey: "insuranceProposalModelation", reasonCodes: ["investment_proposal_fallback"] };
    }
  }

  // §4 PP / DPS
  if (fam === "pp" || fam === "dps") {
    if (dt === "contract") {
      return { outcome: "extract", promptKey: "retirementProductExtraction", reasonCodes: ["pension_contract"] };
    }
    if (dt === "amendment") {
      if (!amendmentConfidenceOk(input.confidence, amendTh)) {
        return { outcome: "review_required", reasonCodes: ["pension_amendment_low_confidence"] };
      }
      return { outcome: "extract", promptKey: "retirementProductExtraction", reasonCodes: ["pension_amendment"] };
    }
    if (dt === "statement") {
      return { outcome: "extract", promptKey: "supportingDocumentExtraction", reasonCodes: ["pension_statement"] };
    }
  }

  // §5 DIP
  if (fam === "dip") {
    if (dt === "contract") {
      return { outcome: "extract", promptKey: "dipExtraction", reasonCodes: ["dip_contract"] };
    }
    if (dt === "amendment") {
      if (!amendmentConfidenceOk(input.confidence, amendTh)) {
        return { outcome: "review_required", reasonCodes: ["dip_amendment_low_confidence"] };
      }
      return { outcome: "extract", promptKey: "dipExtraction", reasonCodes: ["dip_amendment"] };
    }
    if (dt === "statement") {
      return { outcome: "extract", promptKey: "supportingDocumentExtraction", reasonCodes: ["dip_statement"] };
    }
  }

  // §6 Building savings
  if (fam === "building_savings") {
    if (dt === "contract") {
      return { outcome: "extract", promptKey: "buildingSavingsExtraction", reasonCodes: ["ss_contract"] };
    }
    if (dt === "amendment") {
      if (!amendmentConfidenceOk(input.confidence, amendTh)) {
        return { outcome: "review_required", reasonCodes: ["ss_amendment_low_confidence"] };
      }
      return { outcome: "extract", promptKey: "buildingSavingsExtraction", reasonCodes: ["ss_amendment"] };
    }
    if (dt === "payment_instructions") {
      return { outcome: "extract", promptKey: "paymentInstructionsExtraction", reasonCodes: ["ss_payment"] };
    }
    if (dt === "statement") {
      return { outcome: "extract", promptKey: "supportingDocumentExtraction", reasonCodes: ["ss_statement"] };
    }
  }

  // §7 Loan / mortgage
  if (fam === "loan") {
    if (dt === "contract") {
      if (sub === "consumer_loan" || sub === "unknown" || sub === ANY) {
        return { outcome: "extract", promptKey: "loanContractExtraction", reasonCodes: ["loan_contract"] };
      }
    }
    if (dt === "amendment") {
      if (!amendmentConfidenceOk(input.confidence, amendTh)) {
        return { outcome: "review_required", reasonCodes: ["loan_amendment_low_confidence"] };
      }
      return { outcome: "extract", promptKey: "loanContractExtraction", reasonCodes: ["loan_amendment"] };
    }
  }
  if (fam === "mortgage") {
    if (dt === "contract") {
      if (getAiReviewPromptId("mortgageExtraction")) {
        return { outcome: "extract", promptKey: "mortgageExtraction", reasonCodes: ["mortgage_dedicated"] };
      }
      return { outcome: "extract", promptKey: "loanContractExtraction", reasonCodes: ["mortgage_via_loan"] };
    }
    if (dt === "amendment") {
      if (!amendmentConfidenceOk(input.confidence, amendTh)) {
        return { outcome: "review_required", reasonCodes: ["mortgage_amendment_low_confidence"] };
      }
      return { outcome: "extract", promptKey: "loanContractExtraction", reasonCodes: ["mortgage_amendment"] };
    }
  }

  // §9 Statements / supporting
  if (dt === "supporting_document") {
    return { outcome: "extract", promptKey: "supportingDocumentExtraction", reasonCodes: ["supporting_doc"] };
  }
  if (dt === "statement") {
    if (fam === "banking" && sub === "bank_statement_standard") {
      return { outcome: "extract", promptKey: "supportingDocumentExtraction", reasonCodes: ["bank_statement"] };
    }
    if (fam === "legacy_financial_product") {
      if (input.confidence < amendTh) {
        return { outcome: "manual_review", reasonCodes: ["legacy_statement_low_confidence"] };
      }
      return { outcome: "extract", promptKey: "supportingDocumentExtraction", reasonCodes: ["legacy_statement"] };
    }
    return { outcome: "extract", promptKey: "supportingDocumentExtraction", reasonCodes: ["generic_statement"] };
  }

  // §10 Legacy
  if (fam === "legacy_financial_product") {
    if (dt === "contract") {
      return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["legacy_contract"] };
    }
    if (dt === "unknown") {
      return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["legacy_unknown_dt"] };
    }
  }

  // §11 Termination
  if (dt === "termination_document") {
    if (getAiReviewPromptId("terminationDocumentExtraction")) {
      return { outcome: "extract", promptKey: "terminationDocumentExtraction", reasonCodes: ["termination"] };
    }
    return { outcome: "manual_review", reasonCodes: ["prompt_missing_termination"] };
  }

  // §12 Consent / AML / mandate
  if (dt === "consent_or_identification_document") {
    const okSub = new Set(["aml_kyc_form", "direct_debit_mandate"]);
    if (!okSub.has(sub) && sub !== ANY) {
      return { outcome: "manual_review", reasonCodes: ["consent_unsupported_subtype"] };
    }
    if (getAiReviewPromptId("consentIdentificationExtraction")) {
      return { outcome: "extract", promptKey: "consentIdentificationExtraction", reasonCodes: ["consent_kyc"] };
    }
    return { outcome: "manual_review", reasonCodes: ["prompt_missing_consent"] };
  }

  // §13 Confirmation
  if (dt === "confirmation_document") {
    const okSub = new Set(["confirmation_of_contract", "confirmation_of_payment"]);
    if (!okSub.has(sub) && sub !== ANY) {
      return { outcome: "manual_review", reasonCodes: ["confirmation_unsupported_subtype"] };
    }
    if (getAiReviewPromptId("confirmationDocumentExtraction")) {
      return { outcome: "extract", promptKey: "confirmationDocumentExtraction", reasonCodes: ["confirmation"] };
    }
    return { outcome: "manual_review", reasonCodes: ["prompt_missing_confirmation"] };
  }

  return { outcome: "manual_review", reasonCodes: ["no_matching_route"] };
}
