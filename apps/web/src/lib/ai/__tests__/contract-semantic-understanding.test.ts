import { describe, expect, it } from "vitest";
import type { DocumentReviewEnvelope } from "../document-review-types";
import { buildCanonicalPaymentPayload } from "../payment-field-contract";
import {
  alignDocumentClassificationWithExtractedEvidence,
  applySemanticContractUnderstanding,
  clearNonLifeEmptyInvestmentNoise,
  dedupeInstitutionIdentityFields,
  normalizeFinalityContentFlags,
  reconcileAnnualVsMonthlyPremiumFields,
  resolveInvestorIntermediaryDuplicateForInvestment,
  suppressNonlifeRiskPremiumWithoutStrongEvidence,
} from "../contract-semantic-understanding";

function bareEnvelope(
  primary: DocumentReviewEnvelope["documentClassification"]["primaryType"],
  lifecycle: DocumentReviewEnvelope["documentClassification"]["lifecycleStatus"]
): DocumentReviewEnvelope {
  return {
    documentClassification: {
      primaryType: primary,
      subtype: "test",
      lifecycleStatus: lifecycle,
      documentIntent: "creates_new_product",
      confidence: 0.9,
      reasons: [],
    },
    documentMeta: { scannedVsDigital: "digital", overallConfidence: 0.9 },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields: {},
    evidence: [],
    candidateMatches: {
      matchedClients: [],
      matchedHouseholds: [],
      matchedDeals: [],
      matchedCompanies: [],
      matchedContracts: [],
      score: 0,
      reason: "no_match",
      ambiguityFlags: [],
    },
    sectionSensitivity: {},
    relationshipInference: {
      policyholderVsInsured: [],
      childInsured: [],
      intermediaryVsClient: [],
      employerVsEmployee: [],
      companyVsPerson: [],
      bankOrLenderVsBorrower: [],
    },
    reviewWarnings: [],
    suggestedActions: [],
    sensitivityProfile: "standard_personal_data",
    contentFlags: {
      isFinalContract: false,
      isProposalOnly: true,
      containsPaymentInstructions: false,
      containsClientData: false,
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    },
  };
}

describe("contract-semantic-understanding", () => {
  it("normalizeFinalityContentFlags: proposal → final input, not proposal-only", () => {
    const env = bareEnvelope("life_insurance_contract", "proposal");
    normalizeFinalityContentFlags(env);
    expect(env.contentFlags?.isFinalContract).toBe(true);
    expect(env.contentFlags?.isProposalOnly).toBe(false);
  });

  it("normalizeFinalityContentFlags: modelation → non-final", () => {
    const env = bareEnvelope("life_insurance_modelation", "modelation");
    normalizeFinalityContentFlags(env);
    expect(env.contentFlags?.isFinalContract).toBe(false);
    expect(env.contentFlags?.isProposalOnly).toBe(true);
  });

  it("normalizeFinalityContentFlags: offer → final input for extraction", () => {
    const env = bareEnvelope("liability_insurance_offer", "offer");
    normalizeFinalityContentFlags(env);
    expect(env.contentFlags?.isFinalContract).toBe(true);
    expect(env.contentFlags?.isProposalOnly).toBe(false);
  });

  it("normalizeFinalityContentFlags: non_binding_projection → non-final", () => {
    const env = bareEnvelope("life_insurance_modelation", "non_binding_projection");
    normalizeFinalityContentFlags(env);
    expect(env.contentFlags?.isFinalContract).toBe(false);
    expect(env.contentFlags?.isProposalOnly).toBe(true);
  });

  it("dedupeInstitutionIdentityFields clears duplicate provider", () => {
    const ef: Record<string, import("../document-review-types").ExtractedField | undefined> = {
      insurer: { value: "ACME a.s.", status: "extracted", confidence: 0.9 },
      institutionName: { value: "ACME a.s.", status: "extracted", confidence: 0.9 },
      provider: { value: "ACME a.s.", status: "extracted", confidence: 0.85 },
    };
    dedupeInstitutionIdentityFields(ef);
    expect(ef.provider?.status).toBe("not_applicable");
  });

  it("resolveInvestorIntermediaryDuplicateForInvestment clears matching intermediary", () => {
    const ef: Record<string, import("../document-review-types").ExtractedField | undefined> = {
      investorFullName: { value: "Jan Novák", status: "extracted", confidence: 0.9 },
      intermediaryName: { value: "Jan Novák", status: "extracted", confidence: 0.7 },
    };
    resolveInvestorIntermediaryDuplicateForInvestment("investment_subscription_document", ef);
    expect(ef.intermediaryName?.status).toBe("not_applicable");
  });

  it("clearNonLifeEmptyInvestmentNoise suppresses empty JSON investment fields when vehicle present", () => {
    const ef: Record<string, import("../document-review-types").ExtractedField | undefined> = {
      vin: { value: "X", status: "extracted", confidence: 0.9 },
      investmentFunds: { value: "[]", status: "extracted", confidence: 0.5 },
    };
    clearNonLifeEmptyInvestmentNoise("nonlife_insurance_contract", ef);
    expect(ef.investmentFunds?.status).toBe("not_applicable");
  });

  it("reconcileAnnualVsMonthlyPremiumFields removes duplicate monthly when annual freq", () => {
    const ef: Record<string, import("../document-review-types").ExtractedField | undefined> = {
      paymentFrequency: { value: "ročně", status: "extracted", confidence: 0.9 },
      annualPremium: { value: "5000 Kč", status: "extracted", confidence: 0.88 },
      totalMonthlyPremium: { value: "5000 Kč", status: "extracted", confidence: 0.88 },
    };
    reconcileAnnualVsMonthlyPremiumFields(ef);
    expect(ef.totalMonthlyPremium?.status).toBe("not_applicable");
  });

  it("alignDocumentClassificationWithExtractedEvidence: vehicle signals override investment primary", () => {
    const env = bareEnvelope("investment_subscription_document", "final_contract");
    env.extractedFields = {
      vin: { value: "TMB12345678901234", status: "extracted", confidence: 0.9 },
      contractNumber: { value: "C-1", status: "extracted", confidence: 0.9 },
      insurer: { value: "Insurer X", status: "extracted", confidence: 0.9 },
      policyStartDate: { value: "2026-01-01", status: "extracted", confidence: 0.9 },
    };
    alignDocumentClassificationWithExtractedEvidence(env);
    expect(env.documentClassification.primaryType).toBe("nonlife_insurance_contract");
    expect(env.documentClassification.reasons).toContain("semantic_alignment_vehicle_subject");
  });

  it("alignDocumentClassificationWithExtractedEvidence: investor + ISIN override generic", () => {
    const env = bareEnvelope("generic_financial_document", "final_contract");
    env.extractedFields = {
      investorFullName: { value: "A B", status: "extracted", confidence: 0.9 },
      isin: { value: "CZ0008040318", status: "extracted", confidence: 0.9 },
    };
    alignDocumentClassificationWithExtractedEvidence(env);
    expect(env.documentClassification.primaryType).toBe("investment_subscription_document");
  });

  it("alignDocumentClassificationWithExtractedEvidence: participant + provider + contribution → pension", () => {
    const env = bareEnvelope("unsupported_or_unknown", "final_contract");
    env.extractedFields = {
      participantFullName: { value: "Jan Test", status: "extracted", confidence: 0.9 },
      provider: { value: "Penze Co", status: "extracted", confidence: 0.9 },
      contributionParticipant: { value: "500 Kč", status: "extracted", confidence: 0.85 },
    };
    alignDocumentClassificationWithExtractedEvidence(env);
    expect(env.documentClassification.primaryType).toBe("pension_contract");
  });

  it("applySemanticContractUnderstanding runs full pass without throwing", () => {
    const env = bareEnvelope("nonlife_insurance_contract", "proposal");
    env.extractedFields = {
      insurer: { value: "X", status: "extracted", confidence: 0.9 },
      institutionName: { value: "X", status: "extracted", confidence: 0.9 },
      provider: { value: "X", status: "extracted", confidence: 0.9 },
      vin: { value: "TMB1", status: "extracted", confidence: 0.9 },
      investmentFunds: { value: "[]", status: "extracted", confidence: 0.5 },
    };
    applySemanticContractUnderstanding(env);
    expect(env.contentFlags?.isFinalContract).toBe(true);
    expect(env.extractedFields.provider?.status).toBe("not_applicable");
  });

  it("suppressNonlifeRiskPremiumWithoutStrongEvidence clears riskPremium without textual risk semantics", () => {
    const ef: Record<string, import("../document-review-types").ExtractedField | undefined> = {
      riskPremium: { value: "1234", status: "extracted", confidence: 0.5 },
    };
    suppressNonlifeRiskPremiumWithoutStrongEvidence("nonlife_insurance_contract", ef);
    expect(ef.riskPremium?.status).toBe("not_applicable");
  });

  it("suppressNonlifeRiskPremiumWithoutStrongEvidence keeps life insurance riskPremium", () => {
    const ef: Record<string, import("../document-review-types").ExtractedField | undefined> = {
      riskPremium: { value: "1234", status: "extracted", confidence: 0.5 },
    };
    suppressNonlifeRiskPremiumWithoutStrongEvidence("life_insurance_contract", ef);
    expect(ef.riskPremium?.status).toBe("extracted");
  });

  it("suppressNonlifeRiskPremiumWithoutStrongEvidence keeps non-life riskPremium when snippet references risk component", () => {
    const ef: Record<string, import("../document-review-types").ExtractedField | undefined> = {
      riskPremium: {
        value: "500",
        status: "extracted",
        confidence: 0.85,
        evidenceSnippet: "Čistě riziková složka 500 Kč",
      },
    };
    suppressNonlifeRiskPremiumWithoutStrongEvidence("nonlife_insurance_contract", ef);
    expect(ef.riskPremium?.status).toBe("extracted");
  });

  it("buildCanonicalPaymentPayload prefers participant contribution on pension_contract", () => {
    const env = bareEnvelope("pension_contract", "final_contract");
    env.extractedFields = {
      contributionParticipant: { value: "500 Kč", status: "extracted", confidence: 0.9 },
      totalMonthlyPremium: { value: "1000 Kč", status: "extracted", confidence: 0.88 },
    };
    expect(buildCanonicalPaymentPayload(env).amount).toBe("500 Kč");
  });

  it("buildCanonicalPaymentPayload prefers annualPremium when frequency is annual (non-life)", () => {
    const env = bareEnvelope("nonlife_insurance_contract", "final_contract");
    env.extractedFields = {
      paymentFrequency: { value: "ročně", status: "extracted", confidence: 0.9 },
      annualPremium: { value: "12000 Kč", status: "extracted", confidence: 0.9 },
      totalMonthlyPremium: { value: "1000 Kč", status: "extracted", confidence: 0.88 },
    };
    expect(buildCanonicalPaymentPayload(env).amount).toBe("12000 Kč");
  });

  it("applySemanticContractUnderstanding promotes fundAllocation to investmentFunds for subscription docs", () => {
    const env = bareEnvelope("investment_subscription_document", "final_contract");
    env.extractedFields = {
      investorFullName: { value: "Jan Test", status: "extracted", confidence: 0.9 },
      fundAllocation: {
        value: '[{"name":"Global Fund","allocation":60}]',
        status: "extracted",
        confidence: 0.85,
      },
    };
    applySemanticContractUnderstanding(env);
    expect(String(env.extractedFields.investmentFunds?.value)).toContain("Global Fund");
  });

  it("applySemanticContractUnderstanding clears insurer when it duplicates provider on investment docs", () => {
    const env = bareEnvelope("investment_subscription_document", "final_contract");
    env.extractedFields = {
      investorFullName: { value: "Jan Test", status: "extracted", confidence: 0.9 },
      provider: { value: "Správce X", status: "extracted", confidence: 0.9 },
      insurer: { value: "Správce X", status: "extracted", confidence: 0.75 },
    };
    applySemanticContractUnderstanding(env);
    expect(env.extractedFields.insurer?.status).toBe("not_applicable");
  });

  it("applySemanticContractUnderstanding clears intermediary when same as pension participant", () => {
    const env = bareEnvelope("pension_contract", "final_contract");
    env.extractedFields = {
      participantFullName: { value: "Jan Novák", status: "extracted", confidence: 0.9 },
      intermediaryName: { value: "Jan Novák", status: "extracted", confidence: 0.7 },
      provider: { value: "Penze Co", status: "extracted", confidence: 0.9 },
    };
    applySemanticContractUnderstanding(env);
    expect(env.extractedFields.intermediaryName?.status).toBe("not_applicable");
  });

  it("applySemanticContractUnderstanding promotes fundIsin to canonical isin", () => {
    const env = bareEnvelope("investment_subscription_document", "final_contract");
    env.extractedFields = {
      investorFullName: { value: "Jan Test", status: "extracted", confidence: 0.9 },
      fundIsin: { value: "CZ0008040318", status: "extracted", confidence: 0.82 },
    };
    applySemanticContractUnderstanding(env);
    expect(env.extractedFields.isin?.value).toBe("CZ0008040318");
  });

  it("applySemanticContractUnderstanding clears intermediaryCompany when it duplicates provider", () => {
    const env = bareEnvelope("investment_subscription_document", "final_contract");
    env.extractedFields = {
      investorFullName: { value: "Jan Test", status: "extracted", confidence: 0.9 },
      provider: { value: "Správce Alpha", status: "extracted", confidence: 0.88 },
      intermediaryCompany: { value: "Správce Alpha", status: "extracted", confidence: 0.6 },
    };
    applySemanticContractUnderstanding(env);
    expect(env.extractedFields.intermediaryCompany?.status).toBe("not_applicable");
  });
});
