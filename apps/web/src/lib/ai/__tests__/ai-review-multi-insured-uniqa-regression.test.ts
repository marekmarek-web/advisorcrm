import { describe, expect, it } from "vitest";
import {
  runAiReviewDeterministicValidators,
  shouldPublishToCrm,
} from "../ai-review-contract-validator";
import type { DocumentReviewEnvelope } from "../document-review-types";

function minimalEnvelope(): DocumentReviewEnvelope {
  return {
    documentClassification: {
      primaryType: "life_insurance_proposal",
      subtype: "uniqa_fixture",
      lifecycleStatus: "proposal",
      documentIntent: "reference_only",
      confidence: 0.9,
      reasons: ["AI našla výraz návrh"],
    },
    documentMeta: { scannedVsDigital: "digital", overallConfidence: 0.9 },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields: {
      institutionName: { value: "UNIQA", status: "extracted", confidence: 0.95 },
      productName: { value: "Návrh pojistné smlouvy č. 8801965412", status: "extracted", confidence: 0.95 },
      insuredCount: { value: "1 dospělá osoba, 1 dítě", status: "extracted", confidence: 0.95 },
      premiumAmount: { value: "1 560 Kč", status: "extracted", confidence: 0.7 },
    },
    insuredPersons: [
      {
        order: 1,
        role: "primary_insured",
        fullName: "Jiří Chlumecký",
        monthlyPremium: 1560,
      },
      {
        order: 2,
        role: "child_insured",
        fullName: "Nikola Chlumecká",
        birthDate: "31.01.2010",
        birthNumber: "1051315705",
        monthlyPremium: 882,
      },
    ],
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
  };
}

describe("AI Review UNIQA multi-insured regression", () => {
  const uniqaText = `
Počet pojištěných: 1 dospělá osoba, 1 dítě
1. pojištěný
Titul, jméno a příjmení: Jiří Chlumecký
Rodné číslo: 7710252946
Přehled pojištění Kód tarifu Konec pojištění Pojistná částka (PČ) Měsíční pojistné
Smrt (hlavní pojištění) 1CSRK 01. 05. 2046 50 000 Kč 66 Kč
Přehled připojištění Kód tarifu Konec pojištění Pojistná částka (PČ) Měsíční pojistné
Invalidita 3. stupně (klesající PČ) 1CIL3 01. 05. 2042 2 000 000 Kč 582 Kč
Invalidita 2. stupně (klesající PČ) 1CIL2 01. 05. 2042 2 000 000 Kč 318 Kč
Trvalé následky úrazu od 0,5 % s progresí 1 000 % 1CT0 01. 05. 2042 500 000 Kč 54 Kč
Trvalé následky úrazu od 10 % s progresí 1 000 % 1CT10 01. 05. 2042 1 000 000 Kč 77 Kč
Pracovní neschopnost (karenční doba 28 dní, denní
dávka od 29. dne) 1CD28 01. 05. 2042 500 Kč 463 Kč
Celkové běžné měsíční pojistné pro 1. pojištěného 1 560 Kč
2. pojištěný
Titul, jméno a příjmení: Nikola Chlumecká
Datum narození: 31. 01. 2010
Rodné číslo: 1051315705
Zaměstnání: Dítě
Přehled připojištění Kód tarifu Konec pojištění Pojistná částka (PČ) Měsíční pojistné
Invalidita dítěte 1CID 01. 05. 2028 5 000 000 Kč 167 Kč
Snížená soběstačnost dítěte 1CLD 01. 05. 2028 5 000 000 Kč 248 Kč
Trvalé následky úrazu od 0,5 % s progresí 1 000 % 1CTD 01. 05. 2036 2 000 000 Kč 129 Kč
Denní odškodné úrazu 1CODZ 01. 05. 2036 600 Kč 338 Kč
Celkové běžné měsíční pojistné pro 2. pojištěného 882 Kč
`;

  it("aggregates all insured persons and does not use the first insured premium as total", () => {
    const validated = runAiReviewDeterministicValidators(minimalEnvelope(), {
      isModelation: false,
      declaredByAdvisor: true,
      declaredAtUpload: "2026-04-28T13:27:00.000Z",
    });

    expect(validated.insuredPersons).toHaveLength(2);
    expect(validated.insuredPersons?.[0]?.monthlyPremium).toBe(1560);
    expect(validated.insuredPersons?.[1]?.monthlyPremium).toBe(882);
    expect(validated.premium?.totalMonthlyPremium).toBe(2442);
    expect(validated.premium?.source).toBe("sum_of_insured_persons");
    expect(validated.extractedFields.totalMonthlyPremium?.value).toBe("2442");
    expect(validated.premium?.calculationBreakdown).toEqual([
      { label: "1. pojištěný Jiří Chlumecký", amount: 1560, frequency: "monthly" },
      { label: "2. pojištěný Nikola Chlumecká", amount: 882, frequency: "monthly" },
    ]);
  });

  it("repairs extraction when AI returned only the first insured but document text contains both insured blocks", () => {
    const env = minimalEnvelope();
    env.insuredPersons = [
      {
        order: 1,
        role: "primary_insured",
        fullName: "Jiří Chlumecký",
        monthlyPremium: 1560,
      },
    ];

    const validated = runAiReviewDeterministicValidators(env, null, uniqaText);

    expect(validated.insuredPersons).toHaveLength(2);
    expect(validated.insuredPersons?.[1]?.fullName).toBe("Nikola Chlumecká");
    expect(validated.insuredPersons?.[1]?.birthDate).toBe("31.01.2010");
    expect(validated.insuredPersons?.[1]?.birthNumber).toBe("1051315705");
    expect(validated.premium?.totalMonthlyPremium).toBe(2442);
    expect(validated.premium?.totalAnnualPremium).toBe(29304);
    expect(validated.extractedFields.premiumAmount?.value).toBe("2442");
    expect(validated.extractedFields.annualPremium?.value).toBe("29304");
  });

  it("repairs contract total when extracted total equals one insured premium", () => {
    const env = minimalEnvelope();
    env.insuredPersons = [
      { order: 1, role: "primary_insured", fullName: "Jiří Chlumecký", monthlyPremium: 1560 },
      { order: 2, role: "child_insured", fullName: "Nikola Chlumecká", monthlyPremium: 882 },
    ];
    env.extractedFields.totalContractMonthlyPremium = { value: "1 560 Kč", status: "extracted", confidence: 0.9 };
    env.extractedFields.annualPremium = { value: "18 720 Kč", status: "extracted", confidence: 0.9 };

    const validated = runAiReviewDeterministicValidators(env, null, uniqaText);

    expect(validated.premium?.totalMonthlyPremium).toBe(2442);
    expect(validated.premium?.totalAnnualPremium).toBe(29304);
    expect(validated.reviewWarnings?.some((w) => w.message.includes("jedné pojištěné osoby"))).toBe(true);
  });

  it("extracts life insurance risks from per-insured tables", () => {
    const env = minimalEnvelope();
    env.insuredPersons = [{ order: 1, role: "primary_insured", fullName: "Jiří Chlumecký", monthlyPremium: 1560 }];

    const validated = runAiReviewDeterministicValidators(env, null, uniqaText);

    expect(validated.insuredRisks?.length).toBeGreaterThanOrEqual(10);
    expect(validated.insuredRisks?.some((r) => r.riskLabel === "Smrt (hlavní pojištění)" && r.premium === "66 Kč")).toBe(true);
    expect(validated.insuredRisks?.some((r) => r.riskLabel === "Invalidita dítěte" && r.linkedParticipantName === "Nikola Chlumecká")).toBe(true);
    expect(validated.extractedFields.insuredRisks?.value).toEqual(validated.insuredRisks);
  });

  it("does not block CRM publishing from AI proposal/modelation wording when advisor checkbox is false", () => {
    const validated = runAiReviewDeterministicValidators(minimalEnvelope(), {
      isModelation: false,
      declaredByAdvisor: true,
      declaredAtUpload: "2026-04-28T13:27:00.000Z",
    });

    expect(validated.publishHints?.contractPublishable).toBe(true);
    expect(validated.publishHints?.reviewOnly).toBe(false);
    expect(validated.reviewWarnings?.some((w) => w.message === "Dokument obsahuje výraz návrh/modelace. Ověřte, zda jde o finální stav.")).toBe(true);
    expect(shouldPublishToCrm({ extractedPayload: validated, reviewApprovedByAdvisor: true })).toBe(true);
  });

  it("marks review-only only when advisor explicitly declares modelation at upload", () => {
    const validated = runAiReviewDeterministicValidators(minimalEnvelope(), {
      isModelation: true,
      declaredByAdvisor: true,
      declaredAtUpload: "2026-04-28T13:27:00.000Z",
    });

    expect(validated.publishHints?.contractPublishable).toBe(false);
    expect(validated.publishHints?.reviewOnly).toBe(true);
    expect(validated.publishHints?.reasons).toContain("advisor_declared_modelation");
    expect(shouldPublishToCrm({ extractedPayload: validated, reviewApprovedByAdvisor: true })).toBe(false);
  });
});
