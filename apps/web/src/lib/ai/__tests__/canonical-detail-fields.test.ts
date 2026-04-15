import { describe, it, expect } from "vitest";
import { deriveCanonicalPhase1DetailFields } from "../canonical-detail-fields";

describe("deriveCanonicalPhase1DetailFields", () => {
  it("builds identityData from extractedFields when identityData block is absent", () => {
    const extracted = {
      extractedFields: {
        idCardNumber: { value: "AB123456", status: "extracted" },
        idCardIssuedBy: { value: "Magistrát", status: "extracted" },
        generalPractitioner: { value: "MUDr. Jan Novák", status: "extracted" },
      },
    };
    const { identityData, fundResolution } = deriveCanonicalPhase1DetailFields(extracted);
    expect(identityData?.idCardNumber).toBe("AB123456");
    expect(identityData?.idCardIssuedBy).toBe("Magistrát");
    expect(identityData?.generalPractitioner).toBe("MUDr. Jan Novák");
    expect(fundResolution).toBeNull();
  });

  it("derives fundResolution when investment funds and strategy are present", () => {
    const extracted = {
      documentClassification: {
        primaryType: "investment_subscription_document",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 0.9,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      parties: {},
      reviewWarnings: [],
      extractedFields: {
        investmentStrategy: { value: "Dynamický", status: "extracted" },
      },
      investmentFunds: [{ name: "Realita nemovitostní OPF", allocation: "100%", isin: "CZ0008474673" }],
    };
    const { fundResolution } = deriveCanonicalPhase1DetailFields(extracted as Record<string, unknown>);
    expect(fundResolution).not.toBeNull();
    expect(fundResolution?.resolvedFundId || fundResolution?.resolvedFundCategory).toBeTruthy();
    expect(fundResolution?.fvSourceType).toBeTruthy();
  });
});
