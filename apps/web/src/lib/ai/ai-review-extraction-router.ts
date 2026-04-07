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

/**
 * OpenAI Prompt Builder historically used short router tokens (contract, proposal, …).
 * Anthropic local docClassifierV2 template lists full primary-style names — map them back so § routing matches.
 */
export function coerceClassifierDocumentTypeForRouter(raw: string): string {
  const d = norm(raw);
  const shortOk = new Set([
    "contract",
    "proposal",
    "modelation",
    "amendment",
    "offer",
    "statement",
    "payment_instructions",
    "termination_document",
    "consent_or_identification_document",
    "confirmation_document",
    "supporting_document",
    "corporate_tax_return",
    "payslip_document",
    "insurance_policy_change_or_service_doc",
    "unknown",
  ]);
  if (shortOk.has(d)) return String(raw || "").trim();

  if (d === "life_insurance_final_contract" || d === "life_insurance_contract") return "contract";
  if (d === "life_insurance_investment_contract") return "contract";
  if (d === "life_insurance_modelation") return "modelation";
  if (d === "life_insurance_proposal") return "proposal";
  if (d === "life_insurance_change_request") return "amendment";
  if (d === "insurance_policy_change_or_service_doc") return "amendment";
  if (d === "nonlife_insurance_contract" || d === "non_life_insurance_contract") return "contract";
  if (d === "property_insurance_contract" || d === "home_insurance_contract" || d === "household_insurance_contract") return "contract";
  if (d === "liability_insurance_contract") return "contract";
  if (d === "consumer_loan_contract" || d === "consumer_loan_with_payment_protection") return "contract";
  if (d === "mortgage_document" || d === "mortgage_contract" || d === "mortgage_proposal") return "contract";
  if (d === "investment_subscription_document" || d === "investment_service_agreement") return "contract";
  if (d === "investment_modelation") return "modelation";
  if (d === "pension_contract") return "contract";
  if (d === "consent_or_declaration") return "consent_or_identification_document";
  if (d === "final_contract") return "contract";
  if (d === "corporate_tax_return" || d === "self_employed_tax_or_income_document") return "corporate_tax_return";
  if (d === "payslip_document" || d === "income_proof_document") return "payslip_document";
  // Leasing / financial lease document types
  if (d.includes("leasing") || d === "financial_lease" || d === "operating_lease" || d === "leasing_contract") return "contract";

  return String(raw || "").trim();
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
  const dt = norm(coerceClassifierDocumentTypeForRouter(input.documentType));
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
    if (dt === "proposal" || dt === "modelation" || dt === "offer") {
      return { outcome: "extract", promptKey: "insuranceProposalModelation", reasonCodes: ["life_proposal_modelation"] };
    }
    if (dt === "amendment") {
      return { outcome: "extract", promptKey: "insuranceAmendment", reasonCodes: ["life_amendment"] };
    }
  }

  // §2 Non-life (also handle family aliases: property_insurance, liability, motor, etc.)
  const isNonLife =
    fam === "non_life_insurance" ||
    fam === "property_insurance" ||
    fam === "liability_insurance" ||
    fam === "household_insurance" ||
    fam === "home_insurance" ||
    fam === "travel_insurance" ||
    fam === "motor_insurance" ||
    fam === "car_insurance";
  if (isNonLife) {
    const isCarFam = fam === "car_insurance" || fam === "motor_insurance";
    if (dt === "contract") {
      if (sub === "car_insurance" || isCarFam) {
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
      // Accept any other sub for non-life contract rather than falling through
      return { outcome: "extract", promptKey: "nonLifeInsuranceExtraction", reasonCodes: ["nonlife_contract_any_sub"] };
    }
    if (dt === "proposal" || dt === "offer" || dt === "modelation") {
      return { outcome: "extract", promptKey: "insuranceProposalModelation", reasonCodes: ["nonlife_proposal_modelation"] };
    }
    if (dt === "amendment") {
      if (sub === "car_insurance" || isCarFam) {
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
    // Fallback: any non-life document with known family but unknown documentType → extract
    if (dt === "unknown" || dt === "") {
      return { outcome: "extract", promptKey: "nonLifeInsuranceExtraction", reasonCodes: ["nonlife_unknown_dt_fallback"] };
    }
  }

  // §3 Investment (vč. FUNDOO / Amundi — čistá investice, ne DPS/PP)
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

  // §4 PP (penzijní připojištění) a DPS (doplňkové penzijní spoření) — nelze zaměňovat
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

  // §5 DIP (dlouhodobý investiční produkt; pozor na záměnu s fondovým příkazem / FUNDOO)
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
    if (dt === "contract" || dt === "proposal" || dt === "offer") {
      return { outcome: "extract", promptKey: "loanContractExtraction", reasonCodes: ["mortgage_via_loan"] };
    }
    if (dt === "amendment") {
      if (!amendmentConfidenceOk(input.confidence, amendTh)) {
        return { outcome: "review_required", reasonCodes: ["mortgage_amendment_low_confidence"] };
      }
      return { outcome: "extract", promptKey: "loanContractExtraction", reasonCodes: ["mortgage_amendment"] };
    }
    // Unknown doc type but family is mortgage — try extraction rather than manual_review
    if (dt === "unknown" || dt === "") {
      return { outcome: "extract", promptKey: "loanContractExtraction", reasonCodes: ["mortgage_unknown_dt_fallback"] };
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

  // §X Leasing / financial lease / fleet financing — dedicated prompt with leasing field set
  {
    const LEASING_FAMILIES = new Set(["leasing", "financing", "financial_leasing", "fleet_financing", "factoring"]);
    if (LEASING_FAMILIES.has(fam)) {
      if (dt === "contract" || dt === "amendment" || dt === "unknown" || dt === "") {
        // Always use leasingExtraction route for leasing families:
        // - When OPENAI_PROMPT_AI_REVIEW_LEASING_EXTRACTION_ID is set: uses stored OpenAI prompt
        // - When not configured: falls to allowTextSecondPass → local LEASING_EXTRACTION_TEMPLATE
        //   (leasing-specific field set: customer, lender, VIN, installment, etc.)
        return { outcome: "extract", promptKey: "leasingExtraction", reasonCodes: ["leasing_contract_dedicated"] };
      }
    }
  }

  // §12 Consent / AML / mandate
  if (dt === "consent_or_identification_document") {
    const okSub = new Set([
      "aml_kyc_form",
      "direct_debit_mandate",
      // DPS/PP/DIP participant consent and enrollment documents — must not be unsupported
      "dps_participant_consent",
      "pp_participant_consent",
      "dip_participant_consent",
      "pension_enrollment",
      "pension_consent",
      "participant_consent",
      "participant_declaration",
      "investment_consent",
      "client_consent",
      "gdpr_consent",
    ]);
    if (!okSub.has(sub) && sub !== ANY) {
      // When family is pension/investment (DPS/PP/DIP), still allow extraction with retirement prompt
      // instead of blocking as unsupported — document has useful data even if not AML/mandate.
      const isPensionFamily = fam === "dps" || fam === "pp" || fam === "dip" || fam === "investment";
      if (isPensionFamily) {
        return { outcome: "extract", promptKey: "retirementProductExtraction", reasonCodes: ["consent_pension_family_fallback"] };
      }
      // Non-pension consent with unknown subtype — try legacy rather than hard block
      return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["consent_unknown_subtype_legacy_fallback"] };
    }
    if (getAiReviewPromptId("consentIdentificationExtraction")) {
      return { outcome: "extract", promptKey: "consentIdentificationExtraction", reasonCodes: ["consent_kyc"] };
    }
    // Fallback when dedicated consent prompt is not configured — use legacy extraction
    // so primaryType can be properly set (manual_review stub returns unsupported_or_unknown)
    return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["consent_kyc_legacy_fallback"] };
  }

  // §X2 Compliance family — distinguish amendment, supporting and generic
  if (fam === "compliance") {
    // Insurance amendments / change requests detected via compliance family
    if (
      dt === "amendment" ||
      dt === "insurance_policy_change_or_service_doc" ||
      dt === "life_insurance_change_request"
    ) {
      if (!amendmentConfidenceOk(input.confidence, amendTh)) {
        return { outcome: "review_required", reasonCodes: ["compliance_amendment_low_confidence"] };
      }
      return { outcome: "extract", promptKey: "insuranceAmendment", reasonCodes: ["compliance_insurance_amendment"] };
    }
    // Tax returns, payslips, income proofs, and other supporting docs
    const SUPPORTING_DT = new Set([
      "supporting_document",
      "corporate_tax_return",
      "self_employed_tax_or_income_document",
      "payslip_document",
      "income_proof_document",
      "income_confirmation",
      "bank_statement",
      "financial_analysis_document",
      "statement",
    ]);
    if (SUPPORTING_DT.has(dt) || sub === "tax_return" || sub === "payslip") {
      return { outcome: "extract", promptKey: "supportingDocumentExtraction", reasonCodes: ["compliance_supporting_doc"] };
    }
    return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["compliance_document"] };
  }

  // §13 Confirmation
  if (dt === "confirmation_document") {
    const okSub = new Set([
      "confirmation_of_contract",
      "confirmation_of_payment",
      // DPS/PP/DIP confirmation documents — must not be blocked as unsupported
      "dps_contract_confirmation",
      "pp_contract_confirmation",
      "dip_contract_confirmation",
      "pension_contract_confirmation",
      "pension_confirmation",
      "contract_confirmation",
      "policy_confirmation",
      "bundle_confirmation",
    ]);
    if (!okSub.has(sub) && sub !== ANY) {
      // When family is pension/investment (DPS/PP/DIP), route to retirement extraction
      // instead of blocking — confirmation docs carry usable client/product/payment data.
      const isPensionFamily = fam === "dps" || fam === "pp" || fam === "dip";
      if (isPensionFamily) {
        return { outcome: "extract", promptKey: "retirementProductExtraction", reasonCodes: ["confirmation_pension_family_fallback"] };
      }
      // For other families with unknown confirmation subtype — use legacy rather than hard block
      return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["confirmation_unknown_subtype_legacy_fallback"] };
    }
    if (getAiReviewPromptId("confirmationDocumentExtraction")) {
      return { outcome: "extract", promptKey: "confirmationDocumentExtraction", reasonCodes: ["confirmation"] };
    }
    // Fallback: use retirement extraction if family is pension, otherwise legacy
    if (fam === "dps" || fam === "pp" || fam === "dip") {
      return { outcome: "extract", promptKey: "retirementProductExtraction", reasonCodes: ["confirmation_pension_no_dedicated_prompt"] };
    }
    return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["confirmation_no_dedicated_prompt_legacy_fallback"] };
  }

  // EXTRACTION PHILOSOPHY: no_matching_route should not block extraction.
  // Try best-effort via legacyFinancialProductExtraction — it handles generic financial docs.
  // The router never returns empty; advisor always gets classification + orientační výstup.
  // Only genuinely non-financial or unreadable docs end up here; even then we attempt extraction.
  if (fam !== "unknown" && fam !== "") {
    // Known family but no matching route → use legacy as best-effort
    return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["no_matching_route_best_effort_legacy"] };
  }
  if (dt !== "unknown" && dt !== "") {
    // Known document type but unknown family → try legacy
    return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["no_matching_route_known_dt_legacy"] };
  }
  // Truly triple-unknown that slipped past the early guard — still attempt extraction
  return { outcome: "extract", promptKey: "legacyFinancialProductExtraction", reasonCodes: ["no_matching_route_generic_fallback"] };
}
