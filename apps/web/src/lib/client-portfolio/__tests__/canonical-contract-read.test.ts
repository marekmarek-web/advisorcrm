import { describe, it, expect } from "vitest";
import {
  mapContractToCanonicalProduct,
  mapContractsToCanonicalProducts,
  filterFvEligibleProducts,
  type RawContractInput,
} from "../canonical-contract-read";

function makeContract(overrides: Partial<RawContractInput> = {}): RawContractInput {
  return {
    id: "c1",
    contactId: "ct1",
    segment: "INV",
    type: "INV",
    partnerId: null,
    productId: null,
    partnerName: "Conseq",
    productName: "Conseq Invest",
    premiumAmount: "5000",
    premiumAnnual: null,
    contractNumber: "123456",
    startDate: "2024-01-15",
    anniversaryDate: null,
    note: null,
    visibleToClient: true,
    portfolioStatus: "active",
    sourceKind: "ai_review",
    portfolioAttributes: {},
    ...overrides,
  };
}

describe("canonical-contract-read", () => {
  describe("mapContractToCanonicalProduct", () => {
    it("maps basic contract fields", () => {
      const product = mapContractToCanonicalProduct(makeContract());
      expect(product.id).toBe("c1");
      expect(product.segment).toBe("INV");
      expect(product.segmentLabel).toBe("Investice");
      expect(product.partnerName).toBe("Conseq");
      expect(product.premiumMonthly).toBe(5000);
      expect(product.portfolioStatus).toBe("active");
    });

    it("returns null for unknown segment label", () => {
      const product = mapContractToCanonicalProduct(makeContract({ segment: "UNKNOWN" }));
      expect(product.segmentLabel).toBe("UNKNOWN");
      expect(product.segmentDetail).toBeNull();
    });
  });

  describe("investment detail (INV, DIP)", () => {
    it("extracts investment fields from portfolioAttributes", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          segment: "INV",
          portfolioAttributes: {
            investmentFunds: [{ name: "Realitní fond", allocation: "100%" }],
            investmentStrategy: "Dynamický",
            investmentHorizon: "20 let",
            targetAmount: "2000000",
            resolvedFundId: "investika_realitni_fond",
            resolvedFundCategory: null,
            fvSourceType: "fund-library",
          },
        }),
      );
      expect(product.segmentDetail).not.toBeNull();
      expect(product.segmentDetail!.kind).toBe("investment");
      if (product.segmentDetail!.kind === "investment") {
        expect(product.segmentDetail!.fundName).toBe("Realitní fond");
        expect(product.segmentDetail!.fundAllocation).toBe("100%");
        expect(product.segmentDetail!.investmentStrategy).toBe("Dynamický");
        expect(product.segmentDetail!.investmentHorizon).toBe("20 let");
        expect(product.segmentDetail!.resolvedFundId).toBe("investika_realitni_fond");
        expect(product.segmentDetail!.fvSourceType).toBe("fund-library");
      }
    });

    it("DIP also maps to investment detail", () => {
      const product = mapContractToCanonicalProduct(makeContract({ segment: "DIP" }));
      expect(product.segmentDetail?.kind).toBe("investment");
    });

    it("handles empty investmentFunds gracefully", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({ portfolioAttributes: {} }),
      );
      if (product.segmentDetail?.kind === "investment") {
        expect(product.segmentDetail.fundName).toBeNull();
        expect(product.segmentDetail.investmentStrategy).toBeNull();
      }
    });

    it("prefers concrete fund name over generic marketing label on canonical productName", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          productName: "Pravidelné investování RYTMUS",
          portfolioAttributes: {
            investmentFunds: [{ name: "iShares MSCI World UCITS ETF", allocation: "100%" }],
          },
        }),
      );
      expect(product.productName).toBe("iShares MSCI World UCITS ETF");
    });
  });

  describe("life insurance detail (ZP)", () => {
    it("extracts ŽP fields", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          segment: "ZP",
          partnerName: "Kooperativa",
          premiumAmount: "1200",
          premiumAnnual: "14400",
          startDate: "2022-03-01",
          anniversaryDate: "2052-03-01",
          portfolioAttributes: {
            sumInsured: "500000",
            persons: [{ role: "insured", name: "Jan Novák" }],
            risks: [{ label: "Smrt", amount: "500000" }],
            generalPractitioner: "MUDr. Novotný",
          },
        }),
      );
      expect(product.segmentDetail?.kind).toBe("life_insurance");
      if (product.segmentDetail?.kind === "life_insurance") {
        expect(product.segmentDetail.insurer).toBe("Kooperativa");
        expect(product.segmentDetail.monthlyPremium).toBe(1200);
        expect(product.segmentDetail.annualPremium).toBe(14400);
        expect(product.segmentDetail.sumInsured).toBe("500000");
        expect(product.segmentDetail.persons).toHaveLength(1);
        expect(product.segmentDetail.risks).toHaveLength(1);
        expect(product.segmentDetail.generalPractitioner).toBe("MUDr. Novotný");
      }
    });

    it("handles missing persons/risks gracefully", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({ segment: "ZP", portfolioAttributes: {} }),
      );
      if (product.segmentDetail?.kind === "life_insurance") {
        expect(product.segmentDetail.persons).toEqual([]);
        expect(product.segmentDetail.risks).toEqual([]);
      }
    });

    it("deduplicates ŽP risks that only differ by personRef or amount formatting", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          segment: "ZP",
          portfolioAttributes: {
            risks: [
              { label: "Smrt (hlavní pojištění)", amount: "50 000 Kč", personRef: "A" },
              { label: "Smrt (hlavní pojištění)", amount: "50 000 Kč", personRef: "B" },
              { label: "Smrt (hlavní pojištění)", amount: "50000", personRef: undefined },
            ],
          },
        }),
      );
      expect(product.segmentDetail?.kind).toBe("life_insurance");
      if (product.segmentDetail?.kind === "life_insurance") {
        expect(product.segmentDetail.risks).toHaveLength(1);
        expect(product.segmentDetail.risks[0].label).toBe("Smrt (hlavní pojištění)");
      }
    });

    it("deduplicates ŽP risks when labels differ only by typography (comma vs dot, spaced digits, NBSP)", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          segment: "ZP",
          portfolioAttributes: {
            risks: [
              { label: "Trvalé následky od 0,5 % s progresí 1 000 %", amount: "1\u00a0000\u00a0000" },
              { label: "Trvalé následky od 0.5 % s progresí 1000 %", amount: "1000000" },
            ],
          },
        }),
      );
      expect(product.segmentDetail?.kind).toBe("life_insurance");
      if (product.segmentDetail?.kind === "life_insurance") {
        expect(product.segmentDetail.risks).toHaveLength(1);
      }
    });

    it("deduplicates ŽP risks when amount is stored as number in JSON", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          segment: "ZP",
          portfolioAttributes: {
            risks: [
              { label: "Smrt", amount: "50000" },
              { label: "Smrt", amount: 50_000 as unknown as string },
            ],
          },
        }),
      );
      expect(product.segmentDetail?.kind).toBe("life_insurance");
      if (product.segmentDetail?.kind === "life_insurance") {
        expect(product.segmentDetail.risks).toHaveLength(1);
      }
    });
  });

  describe("vehicle detail (AUTO_PR, AUTO_HAV)", () => {
    it("extracts POV fields", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          segment: "AUTO_PR",
          partnerName: "ČSOB Pojišťovna",
          portfolioAttributes: {
            vehicleRegistration: "1A2 3456",
            coverageLines: [{ label: "POV", amount: "100M/100M" }],
          },
        }),
      );
      expect(product.segmentDetail?.kind).toBe("vehicle");
      if (product.segmentDetail?.kind === "vehicle") {
        expect(product.segmentDetail.subtype).toBe("POV");
        expect(product.segmentDetail.vehicleRegistration).toBe("1A2 3456");
        expect(product.segmentDetail.coverageLines).toHaveLength(1);
      }
    });

    it("AUTO_HAV maps to HAV subtype", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({ segment: "AUTO_HAV" }),
      );
      if (product.segmentDetail?.kind === "vehicle") {
        expect(product.segmentDetail.subtype).toBe("HAV");
      }
    });
  });

  describe("property detail (MAJ, ODP)", () => {
    it("extracts property fields", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          segment: "MAJ",
          partnerName: "Generali",
          portfolioAttributes: {
            propertyAddress: "Pražská 10, Praha",
            sumInsured: "3000000",
            coverageLines: [{ label: "Nemovitost", amount: "3M" }],
          },
        }),
      );
      expect(product.segmentDetail?.kind).toBe("property");
      if (product.segmentDetail?.kind === "property") {
        expect(product.segmentDetail.subtype).toBe("property");
        expect(product.segmentDetail.propertyAddress).toBe("Pražská 10, Praha");
        expect(product.segmentDetail.sumInsured).toBe("3000000");
      }
    });

    it("ODP maps to liability subtype", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({ segment: "ODP" }),
      );
      if (product.segmentDetail?.kind === "property") {
        expect(product.segmentDetail.subtype).toBe("liability");
      }
    });
  });

  describe("pension detail (DPS)", () => {
    it("extracts DPS fields", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          segment: "DPS",
          partnerName: "NN Penzijní společnost",
          portfolioAttributes: {
            participantContribution: "1000",
            employerContribution: "500",
            stateContributionEstimate: "230",
            investmentStrategy: "Dynamická",
          },
        }),
      );
      expect(product.segmentDetail?.kind).toBe("pension");
      if (product.segmentDetail?.kind === "pension") {
        expect(product.segmentDetail.company).toBe("NN Penzijní společnost");
        expect(product.segmentDetail.participantContribution).toBe("1000");
        expect(product.segmentDetail.employerContribution).toBe("500");
        expect(product.segmentDetail.investmentStrategy).toBe("Dynamická");
      }
    });
  });

  describe("loan detail (HYPO, UVER)", () => {
    it("extracts loan fields", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          segment: "HYPO",
          partnerName: "Česká spořitelna",
          premiumAmount: "15000",
          portfolioAttributes: {
            loanPrincipal: "3500000",
            loanFixationUntil: "2027-06-01",
            loanMaturityDate: "2050-01-01",
          },
        }),
      );
      expect(product.segmentDetail?.kind).toBe("loan");
      if (product.segmentDetail?.kind === "loan") {
        expect(product.segmentDetail.lender).toBe("Česká spořitelna");
        expect(product.segmentDetail.loanPrincipal).toBe("3500000");
        expect(product.segmentDetail.monthlyPayment).toBe(15000);
        expect(product.segmentDetail.fixationUntil).toBe("2027-06-01");
        expect(product.segmentDetail.maturityDate).toBe("2050-01-01");
      }
    });

    it("UVER also maps to loan detail", () => {
      const product = mapContractToCanonicalProduct(makeContract({ segment: "UVER" }));
      expect(product.segmentDetail?.kind).toBe("loan");
    });
  });

  describe("FV readiness", () => {
    it("populates FV readiness from portfolio attributes", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({
          portfolioAttributes: {
            resolvedFundId: "abc",
            resolvedFundCategory: null,
            fvSourceType: "fund-library",
            investmentHorizon: "15 let",
            targetAmount: "1000000",
            expectedFutureValue: "1500000",
          },
        }),
      );
      expect(product.fvReadiness.resolvedFundId).toBe("abc");
      expect(product.fvReadiness.fvSourceType).toBe("fund-library");
      expect(product.fvReadiness.investmentHorizon).toBe("15 let");
      expect(product.fvReadiness.monthlyAmount).toBe(5000);
      expect(product.fvReadiness.targetAmount).toBe(1000000);
      expect(product.fvReadiness.expectedFutureValue).toBe("1500000");
    });

    it("returns nulls when no FV data", () => {
      const product = mapContractToCanonicalProduct(makeContract());
      expect(product.fvReadiness.resolvedFundId).toBeNull();
      expect(product.fvReadiness.fvSourceType).toBeNull();
    });
  });

  describe("filterFvEligibleProducts", () => {
    it("filters only products with fvSourceType and resolution", () => {
      const products = mapContractsToCanonicalProducts([
        makeContract({
          id: "with-fv",
          portfolioAttributes: {
            resolvedFundId: "abc",
            fvSourceType: "fund-library",
          },
        }),
        makeContract({
          id: "without-fv",
          portfolioAttributes: {},
        }),
        makeContract({
          id: "with-category",
          portfolioAttributes: {
            resolvedFundCategory: "equity",
            fvSourceType: "heuristic-fallback",
          },
        }),
      ]);
      const eligible = filterFvEligibleProducts(products);
      expect(eligible).toHaveLength(2);
      expect(eligible.map((p) => p.id)).toEqual(["with-fv", "with-category"]);
    });
  });

  describe("mapContractsToCanonicalProducts", () => {
    it("maps array of contracts preserving order", () => {
      const products = mapContractsToCanonicalProducts([
        makeContract({ id: "a", segment: "INV" }),
        makeContract({ id: "b", segment: "ZP" }),
        makeContract({ id: "c", segment: "DPS" }),
      ]);
      expect(products).toHaveLength(3);
      expect(products[0].segmentDetail?.kind).toBe("investment");
      expect(products[1].segmentDetail?.kind).toBe("life_insurance");
      expect(products[2].segmentDetail?.kind).toBe("pension");
    });
  });

  describe("null/empty data handling", () => {
    it("handles null portfolioAttributes", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({ portfolioAttributes: null }),
      );
      expect(product.segmentDetail).not.toBeNull();
      expect(product.fvReadiness.resolvedFundId).toBeNull();
    });

    it("handles empty premium strings", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({ premiumAmount: "", premiumAnnual: "" }),
      );
      expect(product.premiumMonthly).toBeNull();
      expect(product.premiumAnnual).toBeNull();
    });

    it("handles zero premium", () => {
      const product = mapContractToCanonicalProduct(
        makeContract({ premiumAmount: "0" }),
      );
      expect(product.premiumMonthly).toBeNull();
    });
  });
});
