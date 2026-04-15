/**
 * Products FV surface wiring tests.
 *
 * Validates that the canonical read layer + shared FV engine integration
 * produces the expected output states for various product configurations.
 *
 * Run: pnpm vitest run src/lib/client-portfolio/__tests__/products-fv-surface-wiring.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  mapContractToCanonicalProduct,
  type RawContractInput,
} from "../canonical-contract-read";
import { isFvEligibleSegment, canonicalPortfolioDetailRows } from "../portal-portfolio-display";
import { computeSharedFutureValue } from "@/lib/fund-library/shared-future-value";

function makeContract(overrides: Partial<RawContractInput> = {}): RawContractInput {
  return {
    id: "fv-test-1",
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
    sourceKind: "manual",
    portfolioAttributes: {},
    ...overrides,
  };
}

describe("FV surface wiring: segment eligibility", () => {
  it("INV is FV-eligible", () => {
    expect(isFvEligibleSegment("INV")).toBe(true);
  });

  it("DIP is FV-eligible", () => {
    expect(isFvEligibleSegment("DIP")).toBe(true);
  });

  it("DPS is FV-eligible", () => {
    expect(isFvEligibleSegment("DPS")).toBe(true);
  });

  it("ZP is NOT FV-eligible", () => {
    expect(isFvEligibleSegment("ZP")).toBe(false);
  });

  it("HYPO is NOT FV-eligible", () => {
    expect(isFvEligibleSegment("HYPO")).toBe(false);
  });

  it("AUTO_PR is NOT FV-eligible", () => {
    expect(isFvEligibleSegment("AUTO_PR")).toBe(false);
  });
});

describe("FV surface wiring: complete projection", () => {
  it("produces complete FV for investment with fund category + horizon + contribution", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "INV",
        premiumAmount: "5000",
        portfolioAttributes: {
          fvSourceType: "heuristic-fallback",
          resolvedFundCategory: "equity",
          investmentHorizon: "20 let",
        },
      }),
    );
    expect(isFvEligibleSegment(product.segment)).toBe(true);
    expect(product.fvReadiness.fvSourceType).toBe("heuristic-fallback");

    const fv = computeSharedFutureValue({
      fvSourceType: product.fvReadiness.fvSourceType!,
      resolvedFundId: product.fvReadiness.resolvedFundId,
      resolvedFundCategory: product.fvReadiness.resolvedFundCategory,
      investmentHorizon: product.fvReadiness.investmentHorizon,
      monthlyContribution: product.premiumMonthly,
      annualContribution: product.premiumAnnual,
    });

    expect(fv.projectionState).toBe("complete");
    expect(fv.projectedFutureValue).not.toBeNull();
    expect(fv.projectedFutureValue! > 0).toBe(true);
    expect(fv.horizonYears).toBe(20);
  });

  it("produces complete FV for DPS with category + horizon", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "DPS",
        premiumAmount: "2000",
        portfolioAttributes: {
          fvSourceType: "heuristic-fallback",
          resolvedFundCategory: "dps_dynamic",
          investmentHorizon: "15 let",
        },
      }),
    );

    const fv = computeSharedFutureValue({
      fvSourceType: product.fvReadiness.fvSourceType!,
      resolvedFundId: product.fvReadiness.resolvedFundId,
      resolvedFundCategory: product.fvReadiness.resolvedFundCategory,
      investmentHorizon: product.fvReadiness.investmentHorizon,
      monthlyContribution: product.premiumMonthly,
      annualContribution: product.premiumAnnual,
    });

    expect(fv.projectionState).toBe("complete");
    expect(fv.projectedFutureValue! > 0).toBe(true);
  });
});

describe("FV surface wiring: partial / unavailable states", () => {
  it("returns partial when horizon is missing", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "INV",
        premiumAmount: "5000",
        portfolioAttributes: {
          fvSourceType: "heuristic-fallback",
          resolvedFundCategory: "equity",
          investmentHorizon: null,
        },
      }),
    );

    const fv = computeSharedFutureValue({
      fvSourceType: product.fvReadiness.fvSourceType!,
      resolvedFundId: product.fvReadiness.resolvedFundId,
      resolvedFundCategory: product.fvReadiness.resolvedFundCategory,
      investmentHorizon: product.fvReadiness.investmentHorizon,
      monthlyContribution: product.premiumMonthly,
      annualContribution: product.premiumAnnual,
    });

    expect(fv.projectionState).not.toBe("complete");
    expect(fv.projectedFutureValue).toBeNull();
  });

  it("returns non-complete when contribution is missing", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "INV",
        premiumAmount: null,
        premiumAnnual: null,
        portfolioAttributes: {
          fvSourceType: "heuristic-fallback",
          resolvedFundCategory: "equity",
          investmentHorizon: "20 let",
        },
      }),
    );

    const fv = computeSharedFutureValue({
      fvSourceType: product.fvReadiness.fvSourceType!,
      resolvedFundId: product.fvReadiness.resolvedFundId,
      resolvedFundCategory: product.fvReadiness.resolvedFundCategory,
      investmentHorizon: product.fvReadiness.investmentHorizon,
      monthlyContribution: product.premiumMonthly,
      annualContribution: product.premiumAnnual,
    });

    expect(fv.projectionState).not.toBe("complete");
  });

  it("returns unavailable when category is unknown", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "INV",
        premiumAmount: "5000",
        portfolioAttributes: {
          fvSourceType: "heuristic-fallback",
          resolvedFundCategory: "unknown",
          investmentHorizon: "20 let",
        },
      }),
    );

    const fv = computeSharedFutureValue({
      fvSourceType: product.fvReadiness.fvSourceType!,
      resolvedFundId: product.fvReadiness.resolvedFundId,
      resolvedFundCategory: product.fvReadiness.resolvedFundCategory,
      investmentHorizon: product.fvReadiness.investmentHorizon,
      monthlyContribution: product.premiumMonthly,
      annualContribution: product.premiumAnnual,
    });

    expect(fv.projectionState).not.toBe("complete");
  });
});

describe("FV surface wiring: no fake data", () => {
  it("life insurance segment does not produce FV even with investment-like attrs", () => {
    expect(isFvEligibleSegment("ZP")).toBe(false);
  });

  it("canonical product with no portfolioAttributes still maps without FV data", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "INV",
        portfolioAttributes: null,
      }),
    );
    expect(product.fvReadiness.fvSourceType).toBeNull();
    expect(product.fvReadiness.resolvedFundId).toBeNull();
  });
});

describe("Segment-specific rendering: detail rows smoke", () => {
  it("investment product generates institution and fund rows", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "INV",
        partnerName: "Conseq",
        portfolioAttributes: {
          investmentFunds: [{ name: "S&P 500 ETF", allocation: "100%" }],
          investmentStrategy: "Dynamická",
          investmentHorizon: "20 let",
        },
      }),
    );
    const rows = canonicalPortfolioDetailRows(product);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Typ produktu");
    expect(labels).toContain("Instituce");
    expect(labels).toContain("Fond / třída");
    expect(labels).toContain("Strategie");
    expect(labels).toContain("Investiční horizont");
  });

  it("life insurance product generates insurer rows, not investment rows", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "ZP",
        partnerName: "Allianz",
        premiumAmount: "1500",
        portfolioAttributes: {
          persons: [{ role: "policyholder", name: "Jan" }],
          risks: [{ label: "Smrt", amount: "3M Kč" }],
        },
      }),
    );
    const rows = canonicalPortfolioDetailRows(product);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Pojišťovna");
    expect(labels).toContain("Měsíční pojistné");
    expect(labels).toContain("Osoby ve smlouvě");
    expect(labels).toContain("Rizika / připojištění");
    expect(labels).not.toContain("Fond / třída");
    expect(labels).not.toContain("Investiční horizont");
  });

  it("loan product generates lender and principal rows", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "HYPO",
        partnerName: "Česká spořitelna",
        portfolioAttributes: {
          loanPrincipal: "4 850 000 Kč",
          loanFixationUntil: "2028-05-01",
          loanMaturityDate: "2048-01-01",
        },
      }),
    );
    const rows = canonicalPortfolioDetailRows(product);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Úvěrující");
    expect(labels).toContain("Jistina");
    expect(labels).toContain("Fixace do");
    expect(labels).toContain("Splatnost");
  });

  it("vehicle product generates SPZ and insurer rows", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "AUTO_PR",
        partnerName: "Kooperativa",
        portfolioAttributes: {
          vehicleRegistration: "1AB 2345",
        },
      }),
    );
    const rows = canonicalPortfolioDetailRows(product);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("SPZ / vozidlo");
    expect(labels).toContain("Pojišťovna");
    expect(labels).toContain("Typ");
  });

  it("pension product generates company and contribution rows", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "DPS",
        partnerName: "Conseq",
        portfolioAttributes: {
          participantContribution: "2 000 Kč",
          employerContribution: "1 000 Kč",
          stateContributionEstimate: "340 Kč",
          investmentStrategy: "Dynamický fond",
        },
      }),
    );
    const rows = canonicalPortfolioDetailRows(product);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Společnost");
    expect(labels).toContain("Účastník");
    expect(labels).toContain("Zaměstnavatel");
    expect(labels).toContain("Státní příspěvek (odhad)");
    expect(labels).toContain("Strategie");
  });
});

describe("Empty / partial state truthfulness", () => {
  it("product with only segment and partner still renders detail rows", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "INV",
        premiumAmount: null,
        premiumAnnual: null,
        contractNumber: null,
        productName: null,
        portfolioAttributes: null,
      }),
    );
    const rows = canonicalPortfolioDetailRows(product);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].label).toBe("Typ produktu");
  });

  it("product with null premium does not show fake zero in detail rows", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "ZP",
        premiumAmount: null,
        premiumAnnual: null,
        portfolioAttributes: {},
      }),
    );
    const rows = canonicalPortfolioDetailRows(product);
    const premiumRow = rows.find((r) => r.label === "Měsíční pojistné");
    expect(premiumRow).toBeUndefined();
  });

  it("investment product with no fund data does not show fake fund name", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        segment: "INV",
        portfolioAttributes: {},
      }),
    );
    const rows = canonicalPortfolioDetailRows(product);
    const fundRow = rows.find((r) => r.label === "Fond / třída");
    expect(fundRow).toBeUndefined();
  });
});
