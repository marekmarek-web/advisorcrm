/**
 * Phase 3 / Slice 1 — Canonical product read layer + per-segment model + truthfulness tests.
 * Tests the canonical-contract-read.ts layer via the products re-export.
 */
import { describe, it, expect } from "vitest";
import {
  mapContractToCanonicalProduct,
  mapContractsToCanonicalProducts,
  filterFvEligibleProducts,
  type RawContractInput,
} from "@/lib/client-portfolio/canonical-contract-read";
import { findMissingPortfolioProducts } from "@/lib/client-portfolio/read-model";

function makeRow(overrides: Partial<RawContractInput> = {}): RawContractInput {
  return {
    id: "c-1",
    contactId: "contact-1",
    segment: "INV",
    type: "INV",
    partnerId: null,
    productId: null,
    partnerName: "ATRIS",
    productName: "Atris fond",
    premiumAmount: "5000",
    premiumAnnual: null,
    contractNumber: "INV-001",
    startDate: "2024-01-01",
    anniversaryDate: null,
    note: null,
    visibleToClient: true,
    portfolioStatus: "active",
    sourceKind: "ai_review",
    portfolioAttributes: {},
    ...overrides,
  };
}

describe("mapContractToCanonicalProduct", () => {
  describe("investment (INV / DIP)", () => {
    it("extracts investment segment detail", () => {
      const row = makeRow({
        segment: "INV",
        type: "INV",
        partnerName: "Conseq",
        portfolioAttributes: {
          investmentFunds: [{ name: "iShares Core MSCI World", allocation: "100%" }],
          investmentHorizon: "10 let",
          investmentStrategy: "Dynamická",
          targetAmount: "1000000",
          resolvedFundId: "ishares_core_msci_world",
          resolvedFundCategory: "equity",
          fvSourceType: "fund-library",
        },
      });
      const product = mapContractToCanonicalProduct(row);
      expect(product.segment).toBe("INV");
      expect(product.segmentLabel).toBe("Investice");
      expect(product.segmentDetail?.kind).toBe("investment");
      if (product.segmentDetail?.kind !== "investment") throw new Error("unreachable");
      expect(product.segmentDetail.institution).toBe("Conseq");
      expect(product.segmentDetail.fundName).toBe("iShares Core MSCI World");
      expect(product.segmentDetail.investmentStrategy).toBe("Dynamická");
      expect(product.segmentDetail.resolvedFundId).toBe("ishares_core_msci_world");
    });

    it("handles missing fund data gracefully", () => {
      const row = makeRow({ segment: "DIP", type: "DIP", portfolioAttributes: {} });
      const product = mapContractToCanonicalProduct(row);
      expect(product.segmentDetail?.kind).toBe("investment");
      if (product.segmentDetail?.kind !== "investment") throw new Error("unreachable");
      expect(product.segmentDetail.fundName).toBeNull();
      expect(product.segmentDetail.resolvedFundId).toBeNull();
    });
  });

  describe("life insurance (ZP)", () => {
    it("extracts ZP segment detail", () => {
      const row = makeRow({
        segment: "ZP",
        type: "ZP",
        partnerName: "Generali",
        premiumAmount: "1200",
        startDate: "2023-06-01",
        anniversaryDate: "2053-06-01",
        portfolioAttributes: {
          sumInsured: "500000",
          risks: [{ label: "Smrt", amount: "500000" }],
          persons: [{ role: "policyholder", name: "Jan Novák" }],
          generalPractitioner: "MUDr. Novotný",
        },
      });
      const product = mapContractToCanonicalProduct(row);
      expect(product.segmentDetail?.kind).toBe("life_insurance");
      if (product.segmentDetail?.kind !== "life_insurance") throw new Error("unreachable");
      expect(product.segmentDetail.insurer).toBe("Generali");
      expect(product.segmentDetail.risks).toHaveLength(1);
      expect(product.segmentDetail.persons).toHaveLength(1);
      expect(product.segmentDetail.generalPractitioner).toBe("MUDr. Novotný");
    });

    it("returns empty arrays for missing risks/persons", () => {
      const row = makeRow({ segment: "ZP", type: "ZP", portfolioAttributes: {} });
      const product = mapContractToCanonicalProduct(row);
      if (product.segmentDetail?.kind !== "life_insurance") throw new Error("unreachable");
      expect(product.segmentDetail.risks).toEqual([]);
      expect(product.segmentDetail.persons).toEqual([]);
    });
  });

  describe("vehicles (AUTO_PR / AUTO_HAV)", () => {
    it("maps POV subtype", () => {
      const row = makeRow({
        segment: "AUTO_PR",
        type: "AUTO_PR",
        portfolioAttributes: { vehicleRegistration: "1A2 3456" },
      });
      const product = mapContractToCanonicalProduct(row);
      expect(product.segmentDetail?.kind).toBe("vehicle");
      if (product.segmentDetail?.kind !== "vehicle") throw new Error("unreachable");
      expect(product.segmentDetail.subtype).toBe("POV");
      expect(product.segmentDetail.vehicleRegistration).toBe("1A2 3456");
    });

    it("maps HAV subtype", () => {
      const row = makeRow({ segment: "AUTO_HAV", type: "AUTO_HAV", portfolioAttributes: {} });
      const product = mapContractToCanonicalProduct(row);
      if (product.segmentDetail?.kind !== "vehicle") throw new Error("unreachable");
      expect(product.segmentDetail.subtype).toBe("HAV");
    });
  });

  describe("property (MAJ / ODP)", () => {
    it("extracts property detail", () => {
      const row = makeRow({
        segment: "MAJ",
        type: "MAJ",
        portfolioAttributes: {
          propertyAddress: "Praha 1",
          sumInsured: "5000000",
          coverageLines: [{ label: "Povodeň", amount: "5000000" }],
        },
      });
      const product = mapContractToCanonicalProduct(row);
      expect(product.segmentDetail?.kind).toBe("property");
      if (product.segmentDetail?.kind !== "property") throw new Error("unreachable");
      expect(product.segmentDetail.propertyAddress).toBe("Praha 1");
      expect(product.segmentDetail.subtype).toBe("property");
    });

    it("maps ODP as liability subtype", () => {
      const row = makeRow({ segment: "ODP", type: "ODP", portfolioAttributes: {} });
      const product = mapContractToCanonicalProduct(row);
      if (product.segmentDetail?.kind !== "property") throw new Error("unreachable");
      expect(product.segmentDetail.subtype).toBe("liability");
    });
  });

  describe("pension (DPS)", () => {
    it("extracts pension detail", () => {
      const row = makeRow({
        segment: "DPS",
        type: "DPS",
        partnerName: "NN",
        portfolioAttributes: {
          participantContribution: "1000",
          employerContribution: "500",
          stateContributionEstimate: "200",
          investmentStrategy: "Dynamická",
        },
      });
      const product = mapContractToCanonicalProduct(row);
      expect(product.segmentDetail?.kind).toBe("pension");
      if (product.segmentDetail?.kind !== "pension") throw new Error("unreachable");
      expect(product.segmentDetail.company).toBe("NN");
      expect(product.segmentDetail.participantContribution).toBe("1000");
      expect(product.segmentDetail.investmentStrategy).toBe("Dynamická");
    });
  });

  describe("loans (HYPO / UVER)", () => {
    it("extracts loan detail", () => {
      const row = makeRow({
        segment: "HYPO",
        type: "HYPO",
        partnerName: "Česká spořitelna",
        premiumAmount: "15000",
        portfolioAttributes: {
          loanPrincipal: "3000000",
          loanFixationUntil: "2028-01-01",
          loanMaturityDate: "2044-01-01",
        },
      });
      const product = mapContractToCanonicalProduct(row);
      expect(product.segmentDetail?.kind).toBe("loan");
      if (product.segmentDetail?.kind !== "loan") throw new Error("unreachable");
      expect(product.segmentDetail.lender).toBe("Česká spořitelna");
      expect(product.segmentDetail.loanPrincipal).toBe("3000000");
      expect(product.segmentDetail.monthlyPayment).toBe(15000);
    });
  });

  describe("generic/unknown segment", () => {
    it("returns null segmentDetail for unknown segments", () => {
      const row = makeRow({ segment: "CEST", type: "CEST", portfolioAttributes: {} });
      const product = mapContractToCanonicalProduct(row);
      expect(product.segmentDetail).toBeNull();
    });
  });
});

describe("mapContractsToCanonicalProducts", () => {
  it("maps batch of rows", () => {
    const rows = [
      makeRow({ id: "1", segment: "INV", type: "INV" }),
      makeRow({ id: "2", segment: "ZP", type: "ZP" }),
    ];
    const products = mapContractsToCanonicalProducts(rows);
    expect(products).toHaveLength(2);
    expect(products[0].segmentDetail?.kind).toBe("investment");
    expect(products[1].segmentDetail?.kind).toBe("life_insurance");
  });
});

describe("filterFvEligibleProducts", () => {
  it("filters products with FV data", () => {
    const products = mapContractsToCanonicalProducts([
      makeRow({
        id: "1",
        segment: "INV",
        type: "INV",
        portfolioAttributes: {
          resolvedFundId: "ishares_core_msci_world",
          fvSourceType: "fund-library",
        },
      }),
      makeRow({
        id: "2",
        segment: "ZP",
        type: "ZP",
        portfolioAttributes: {},
      }),
    ]);
    const eligible = filterFvEligibleProducts(products);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe("1");
  });

  it("includes heuristic-fallback products", () => {
    const products = mapContractsToCanonicalProducts([
      makeRow({
        id: "1",
        segment: "INV",
        type: "INV",
        portfolioAttributes: {
          resolvedFundCategory: "equity",
          fvSourceType: "heuristic-fallback",
        },
      }),
    ]);
    expect(filterFvEligibleProducts(products)).toHaveLength(1);
  });
});

describe("findMissingPortfolioProducts (truthfulness)", () => {
  it("detects missing active visible products", () => {
    const all = [
      { id: "1", visibleToClient: true, portfolioStatus: "active", archivedAt: null },
      { id: "2", visibleToClient: true, portfolioStatus: "active", archivedAt: null },
      { id: "3", visibleToClient: false, portfolioStatus: "active", archivedAt: null },
    ];
    const read = [{ id: "1" }];
    expect(findMissingPortfolioProducts(all, read)).toEqual(["2"]);
  });

  it("ignores archived and draft products", () => {
    const all = [
      { id: "1", visibleToClient: true, portfolioStatus: "draft", archivedAt: null },
      { id: "2", visibleToClient: true, portfolioStatus: "active", archivedAt: new Date() },
    ];
    expect(findMissingPortfolioProducts(all, [])).toEqual([]);
  });

  it("returns empty when all are present", () => {
    const all = [{ id: "1", visibleToClient: true, portfolioStatus: "active", archivedAt: null }];
    expect(findMissingPortfolioProducts(all, [{ id: "1" }])).toEqual([]);
  });
});

describe("sourceKind parity", () => {
  it("ai_review and manual produce identical canonical output shape", () => {
    const ai = mapContractToCanonicalProduct(makeRow({ sourceKind: "ai_review" }));
    const manual = mapContractToCanonicalProduct(makeRow({ sourceKind: "manual" }));
    expect(ai.segmentDetail?.kind).toBe(manual.segmentDetail?.kind);
    expect(Object.keys(ai)).toEqual(Object.keys(manual));
  });
});

describe("empty/partial data resilience", () => {
  it("handles all segments with empty portfolioAttributes", () => {
    const segments = ["INV", "DIP", "ZP", "AUTO_PR", "AUTO_HAV", "MAJ", "ODP", "DPS", "HYPO", "UVER", "CEST"];
    for (const seg of segments) {
      const product = mapContractToCanonicalProduct(makeRow({ segment: seg, type: seg, portfolioAttributes: {} }));
      expect(product.segment).toBe(seg);
    }
  });

  it("handles null portfolioAttributes", () => {
    const product = mapContractToCanonicalProduct(makeRow({ portfolioAttributes: null }));
    expect(product.segmentDetail?.kind).toBe("investment");
  });
});
