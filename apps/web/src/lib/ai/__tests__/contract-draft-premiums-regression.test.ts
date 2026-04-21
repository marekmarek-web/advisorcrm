/**
 * Regression pro `computeDraftPremiumsFromEnvelope`.
 *
 * Reál reportovaný uživatelem: ČSOB Naše odpovědnost, 4 959 Kč/rok. Původní
 * implementace vrátila `premiumAmount = 4 959` (což DB interpretuje jako měsíční)
 * → UI ukázalo 4 959 Kč/měs ≈ 59 508 Kč/rok. Po opravě musí být:
 *   premiumAmount ≈ 413,25 Kč/měs, premiumAnnual = 4 959 Kč.
 *
 * Cílem těchto testů je kodifikovat sémantiku:
 *   • premiumAmount  = MĚSÍČNÍ
 *   • premiumAnnual  = ROČNÍ
 */

import { describe, expect, it } from "vitest";
import { computeDraftPremiumsFromEnvelope } from "../contract-draft-premiums";
import type { DocumentReviewEnvelope } from "../document-review-types";

function envWith(
  fields: Record<string, string>,
  primary: DocumentReviewEnvelope["documentClassification"]["primaryType"] = "life_insurance_proposal"
): DocumentReviewEnvelope {
  const extractedFields: DocumentReviewEnvelope["extractedFields"] = {};
  for (const [k, v] of Object.entries(fields)) {
    extractedFields[k] = { value: v, status: "extracted", confidence: 0.9 };
  }
  return {
    documentClassification: {
      primaryType: primary,
      subtype: "fixture",
      lifecycleStatus: "proposal",
      documentIntent: "reference_only",
      confidence: 0.9,
      reasons: [],
    },
    documentMeta: { scannedVsDigital: "digital", overallConfidence: 0.9 },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields,
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

describe("computeDraftPremiumsFromEnvelope — měsíční vs roční sémantika", () => {
  it("ČSOB Naše odpovědnost 4 959 Kč ročně → premiumAmount ≈ 413,25 Kč/měs, premiumAnnual = 4 959", () => {
    const env = envWith({
      annualPremium: "4 959",
      paymentFrequency: "ročně",
    });
    const out = computeDraftPremiumsFromEnvelope(env, "ODP");
    expect(out.premiumAnnual).toBe("4959");
    expect(out.premiumAmount).toBe("413.25");
    // Guard: UI nesmí dostat 4 959 jako měsíční.
    expect(out.premiumAmount).not.toBe("4959");
  });

  it("jen monthlyPremium = 1 500 → premiumAmount = 1 500, premiumAnnual = 18 000", () => {
    const env = envWith({
      monthlyPremium: "1 500",
      paymentFrequency: "měsíčně",
    });
    const out = computeDraftPremiumsFromEnvelope(env, "ZP");
    expect(out.premiumAmount).toBe("1500");
    expect(out.premiumAnnual).toBe("18000");
  });

  it("monthly + annual zároveň — annual má přednost (reálnější hodnota z dokumentu)", () => {
    const env = envWith({
      monthlyPremium: "1 500",
      annualPremium: "18 500",
      paymentFrequency: "měsíčně",
    });
    const out = computeDraftPremiumsFromEnvelope(env, "ZP");
    expect(out.premiumAmount).toBe("1500");
    expect(out.premiumAnnual).toBe("18500");
  });

  it("regularAmount s měsíční frekvencí funguje stejně jako monthlyPremium", () => {
    const env = envWith({
      regularAmount: "2 442",
      paymentFrequency: "měsíčně",
    });
    const out = computeDraftPremiumsFromEnvelope(env, "ZP");
    expect(out.premiumAmount).toBe("2442");
    expect(out.premiumAnnual).toBe("29304");
  });

  it("regularAmount s čtvrtletní frekvencí → annualizovat (× 4) a dopočítat měsíční", () => {
    const env = envWith({
      regularAmount: "1 200",
      paymentFrequency: "čtvrtletně",
    });
    const out = computeDraftPremiumsFromEnvelope(env, "ZP");
    expect(out.premiumAnnual).toBe("4800");
    expect(out.premiumAmount).toBe("400");
  });

  it("jednorázová investice → premiumAnnual = null (nelze ročně), premiumAmount = jistina", () => {
    const env = envWith(
      {
        regularAmount: "1 000 000",
        paymentFrequency: "jednorázově",
      },
      "investment_subscription_document"
    );
    const out = computeDraftPremiumsFromEnvelope(env, "INV");
    expect(out.premiumAmount).toBe("1000000");
    expect(out.premiumAnnual).toBeNull();
  });

  it("HYPO/UVER — premiumAmount = premiumAnnual = loanAmount (splátka se řídí jinou logikou)", () => {
    const env = envWith({
      loanAmount: "3 500 000",
    });
    const out = computeDraftPremiumsFromEnvelope(env, "HYPO");
    expect(out.premiumAmount).toBe("3500000");
    expect(out.premiumAnnual).toBe("3500000");
  });

  it("úplně prázdný envelope → { null, null }", () => {
    const env = envWith({});
    const out = computeDraftPremiumsFromEnvelope(env, "ZP");
    expect(out.premiumAmount).toBeNull();
    expect(out.premiumAnnual).toBeNull();
  });
});
