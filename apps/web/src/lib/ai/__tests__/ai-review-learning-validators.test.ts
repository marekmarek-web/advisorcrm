import { describe, expect, it } from "vitest";
import type { DocumentReviewEnvelope } from "../document-review-types";
import {
  applyValidatorHints,
  expectedInsuredCountFromText,
  validateParticipantCount,
  validatePremiumAggregation,
  validatePublishEligibility,
} from "../ai-review-learning-validators";

const uniqaText = `
UNIQA Život & radost
Počet pojištěných: 1 dospělá osoba, 1 dítě
1. pojištěný
Titul, jméno a příjmení: Jiří Chlumecký
Celkové běžné měsíční pojistné pro 1. pojištěného 1 560 Kč
2. pojištěný
Titul, jméno a příjmení: Nikola Chlumecká
Celkové běžné měsíční pojistné pro 2. pojištěného 882 Kč
`;

function envelope(overrides: Partial<DocumentReviewEnvelope> = {}): DocumentReviewEnvelope {
  return {
    documentClassification: {
      primaryType: "life_insurance_contract",
      subtype: "life",
      lifecycleStatus: "proposal",
      documentIntent: "creates_new_product",
      confidence: 0.9,
      reasons: [],
    },
    documentMeta: { scannedVsDigital: "digital" },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields: {
      contractNumber: { value: "8801965412", status: "extracted", confidence: 0.9 },
      institutionName: { value: "UNIQA", status: "extracted", confidence: 0.9 },
      productName: { value: "Život & radost", status: "extracted", confidence: 0.9 },
      policyHolderFullName: { value: "Jiří Chlumecký", status: "extracted", confidence: 0.9 },
      paymentFrequency: { value: "monthly", status: "extracted", confidence: 0.9 },
    },
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
    ...overrides,
  };
}

describe("AI Review deterministic learning validators", () => {
  it("detects expected insured count from UNIQA multi-insured text", () => {
    expect(expectedInsuredCountFromText(uniqaText)).toBe(2);
    expect(expectedInsuredCountFromText("Počet pojištěných: 2 dospělé osoby")).toBe(2);
    expect(expectedInsuredCountFromText("1. pojištěný\n2. pojištěný\n3. pojištěný")).toBe(3);
  });

  it("flags critical warning when only one insured person was extracted", () => {
    const env = envelope({
      insuredPersons: [{ order: 1, fullName: "Jiří Chlumecký", monthlyPremium: 1560 }],
    });

    const warnings = validateParticipantCount(env, uniqaText);

    expect(warnings[0]).toMatchObject({
      code: "participant_count_mismatch",
      severity: "critical",
      field: "participants",
    });
    expect((env as DocumentReviewEnvelope & { requiresAdvisorDecision?: boolean }).requiresAdvisorDecision).toBe(true);
  });

  it("sums per-insured premiums from document text", () => {
    const env = envelope({
      insuredPersons: [
        { order: 1, fullName: "Jiří Chlumecký", monthlyPremium: 1560 },
        { order: 2, fullName: "Nikola Chlumecká", monthlyPremium: 882 },
      ],
      premium: { frequency: "monthly", totalMonthlyPremium: 1560, source: "manual_override", calculationBreakdown: [], validationWarnings: [] },
    });

    const result = validatePremiumAggregation(env, uniqaText);

    expect(result.envelope.premium?.totalMonthlyPremium).toBe(2442);
    expect(result.envelope.premium?.calculationBreakdown).toEqual([
      { label: "1. pojištěný", amount: 1560, frequency: "monthly" },
      { label: "2. pojištěný", amount: 882, frequency: "monthly" },
    ]);
  });

  it("auto-fixes first-person total to full contract sum", () => {
    const env = envelope({
      insuredPersons: [{ order: 1, fullName: "Jiří Chlumecký", monthlyPremium: 1560 }],
      premium: { frequency: "monthly", totalMonthlyPremium: 1560, source: "manual_override", calculationBreakdown: [], validationWarnings: [] },
    });

    const result = validatePremiumAggregation(env, uniqaText);

    expect(result.envelope.premium?.totalMonthlyPremium).toBe(2442);
    expect(result.autoFixesApplied).toContain("premium.totalMonthlyPremium=sum_of_insured_persons");
    expect(result.warnings[0]?.code).toBe("premium_total_autofixed_from_insured_sum");
  });

  it("publishes only when review is approved and upload intent is not modelation", () => {
    const env = envelope();

    expect(validatePublishEligibility({ envelope: env, uploadIntent: { isModelation: false }, reviewApproved: true }).shouldPublishToCrm).toBe(true);
    expect(validatePublishEligibility({ envelope: env, uploadIntent: { isModelation: true }, reviewApproved: true }).shouldPublishToCrm).toBe(false);
    expect(validatePublishEligibility({ envelope: env, uploadIntent: { isModelation: false }, reviewApproved: false }).shouldPublishToCrm).toBe(false);
  });

  it("does not let AI proposal lifecycle block publish by itself", () => {
    const env = envelope({
      documentClassification: {
        primaryType: "life_insurance_contract",
        lifecycleStatus: "proposal",
        documentIntent: "creates_new_product",
        confidence: 0.9,
        reasons: ["AI found proposal wording"],
      },
    });

    const result = validatePublishEligibility({
      envelope: env,
      uploadIntent: { isModelation: false },
      reviewApproved: true,
    });

    expect(result.shouldPublishToCrm).toBe(true);
    expect(result.warnings[0]).toMatchObject({
      code: "proposal_signal_review",
      message: "Dokument obsahuje znaky návrhu/modelace. Ověřte před schválením.",
    });
  });

  it("applies validator hints without mutating publish eligibility", () => {
    const warnings = applyValidatorHints(envelope({ insuredPersons: [] }), [
      { rule: "require_numbered_participants" },
    ]);

    expect(warnings[0]?.code).toBe("learning_pattern_participant_check");
  });
});
