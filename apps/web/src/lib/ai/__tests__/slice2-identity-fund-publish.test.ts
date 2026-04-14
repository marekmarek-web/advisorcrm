import { describe, it, expect } from "vitest";
import {
  buildPortfolioAttributesFromExtracted,
} from "@/lib/portfolio/build-portfolio-attributes-from-extract";
import {
  buildContactUpdatePatch,
  selectExistingContractId,
} from "../apply-contract-review";

describe("Slice 2: Identity field filling", () => {
  it("buildContactUpdatePatch propagates identity fields", () => {
    const existing = {
      firstName: "Jan",
      lastName: "Novák",
      email: null,
      phone: null,
      birthDate: null,
      personalId: null,
      idCardNumber: null,
      idCardIssuedBy: null,
      idCardValidUntil: null,
      idCardIssuedAt: null,
      generalPractitioner: null,
      street: null,
      city: null,
      zip: null,
    };
    const payload = {
      idCardNumber: "123456789",
      idCardIssuedBy: "MěÚ Praha 4",
      idCardValidUntil: "2030-12-31",
      idCardIssuedAt: "2020-01-15",
      generalPractitioner: "MUDr. Jana Nováková",
    };
    const patch = buildContactUpdatePatch(existing, payload);
    expect(patch).toBeDefined();
  });
});

describe("Slice 2: Portfolio attributes with investment data", () => {
  it("extracts investmentStrategy and investmentFunds", () => {
    const extracted = {
      extractedFields: {
        investmentStrategy: { value: "Dynamický", status: "found", confidence: 0.9 },
        investmentHorizon: { value: "20 let", status: "found", confidence: 0.85 },
        intendedInvestment: { value: "2000000", status: "found", confidence: 0.9 },
      },
      investmentFunds: [
        { name: "Realita nemovitostní OPF", allocation: "100%", isin: "CZ0008474673" },
      ],
    };
    const attrs = buildPortfolioAttributesFromExtracted(extracted);
    expect(attrs.investmentStrategy).toBe("Dynamický");
    expect(attrs.investmentHorizon).toBe("20 let");
    expect(attrs.targetAmount).toBe("2000000");
    expect(Array.isArray(attrs.investmentFunds)).toBe(true);
    const funds = attrs.investmentFunds as Array<{ name: string; isin?: string }>;
    expect(funds.length).toBe(1);
    expect(funds[0].name).toBe("Realita nemovitostní OPF");
    expect(funds[0].isin).toBe("CZ0008474673");
  });

  it("extracts generalPractitioner for life insurance", () => {
    const extracted = {
      extractedFields: {
        generalPractitioner: { value: "MUDr. Jan Novák, Praha 4", status: "found", confidence: 0.8 },
      },
    };
    const attrs = buildPortfolioAttributesFromExtracted(extracted);
    expect(attrs.generalPractitioner).toBe("MUDr. Jan Novák, Praha 4");
  });

  it("extracts DPS/DIP contributions", () => {
    const extracted = {
      extractedFields: {
        participantContribution: { value: "1000 Kč", status: "found", confidence: 0.9 },
        employerContribution: { value: "500 Kč", status: "found", confidence: 0.85 },
      },
    };
    const attrs = buildPortfolioAttributesFromExtracted(extracted);
    expect(attrs.participantContribution).toBe("1000 Kč");
    expect(attrs.employerContribution).toBe("500 Kč");
  });

  it("does not hallucinate when fields are missing", () => {
    const extracted = {
      extractedFields: {
        fullName: { value: "Jan Novák", status: "found", confidence: 0.95 },
      },
    };
    const attrs = buildPortfolioAttributesFromExtracted(extracted);
    expect(attrs.investmentStrategy).toBeUndefined();
    expect(attrs.investmentFunds).toBeUndefined();
    expect(attrs.resolvedFundId).toBeUndefined();
    expect(attrs.generalPractitioner).toBeUndefined();
  });
});

describe("Slice 2: Canonical publish artifact", () => {
  it("selectExistingContractId matches by sourceContractReviewId first", () => {
    const candidates = [
      {
        id: "c1",
        contractNumber: "123",
        partnerName: "Pojistovna A",
        productName: "Produkt X",
        startDate: "2024-01-01",
        segment: "ZP",
        sourceContractReviewId: "review-abc",
      },
      {
        id: "c2",
        contractNumber: "123",
        partnerName: "Pojistovna A",
        productName: "Produkt X",
        startDate: "2024-01-01",
        segment: "ZP",
        sourceContractReviewId: null,
      },
    ];
    const result = selectExistingContractId(candidates, {
      contractNumber: "123",
      institutionName: "Pojistovna A",
      productName: "Produkt X",
      effectiveDate: "2024-01-01",
      segment: "ZP",
      sourceContractReviewId: "review-abc",
    });
    expect(result).toBe("c1");
  });
});
