/**
 * Run: pnpm vitest run src/lib/fund-library/__tests__/shared-future-value.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  parseInvestmentHorizonYears,
  futureValueOfMonthlyContributions,
  computePortalInvestmentFutureValue,
  computeSharedFutureValue,
  SHARED_FV_DISCLAIMER,
} from "../shared-future-value";

describe("parseInvestmentHorizonYears", () => {
  it("parses 'N let'", () => {
    expect(parseInvestmentHorizonYears("20 let", 2026)).toBe(20);
    expect(parseInvestmentHorizonYears("15 let", 2026)).toBe(15);
  });

  it("parses 'do roku YYYY'", () => {
    expect(parseInvestmentHorizonYears("do roku 2045", 2026)).toBe(19);
  });

  it("parses '10+ let'", () => {
    expect(parseInvestmentHorizonYears("10+ let", 2026)).toBe(10);
  });

  it("returns null when unclear", () => {
    expect(parseInvestmentHorizonYears(null, 2026)).toBeNull();
    expect(parseInvestmentHorizonYears("", 2026)).toBeNull();
    expect(parseInvestmentHorizonYears("dlouhodobě", 2026)).toBeNull();
  });
});

describe("futureValueOfMonthlyContributions", () => {
  it("returns positive FV for typical inputs", () => {
    const fv = futureValueOfMonthlyContributions(5000, 20, 6);
    expect(fv).not.toBeNull();
    expect(fv! > 0).toBe(true);
  });

  it("returns null for invalid horizon", () => {
    expect(futureValueOfMonthlyContributions(5000, 0, 6)).toBeNull();
  });
});

describe("computePortalInvestmentFutureValue", () => {
  it("uses heuristic category rates", () => {
    const r = computePortalInvestmentFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "equity",
      investmentHorizon: "10 let",
      monthlyContribution: 1000,
      annualContribution: null,
    });
    expect(r).not.toBeNull();
    expect(r!.horizonYears).toBe(10);
    expect(r!.sourceExplanation).toContain("kategorie");
  });

  it("returns null without horizon", () => {
    expect(
      computePortalInvestmentFutureValue({
        fvSourceType: "heuristic-fallback",
        resolvedFundId: null,
        resolvedFundCategory: "equity",
        investmentHorizon: null,
        monthlyContribution: 1000,
        annualContribution: null,
      }),
    ).toBeNull();
  });

  it("returns null for unknown category under heuristic", () => {
    expect(
      computePortalInvestmentFutureValue({
        fvSourceType: "heuristic-fallback",
        resolvedFundId: null,
        resolvedFundCategory: "unknown",
        investmentHorizon: "10 let",
        monthlyContribution: 1000,
        annualContribution: null,
      }),
    ).toBeNull();
  });

  it("derives monthly from annual when monthly missing", () => {
    const r = computePortalInvestmentFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "balanced",
      investmentHorizon: "5 let",
      monthlyContribution: null,
      annualContribution: 12000,
    });
    expect(r).not.toBeNull();
  });

  it("uses fund-library planning rate when resolvedFundId matches catalog", () => {
    const r = computePortalInvestmentFutureValue({
      fvSourceType: "fund-library",
      resolvedFundId: "conseq_globalni_akciovy_ucastnicky",
      resolvedFundCategory: null,
      investmentHorizon: "10 let",
      monthlyContribution: 1000,
      annualContribution: null,
    });
    expect(r).not.toBeNull();
    expect(r!.sourceExplanation).toContain("fondu");
  });

  it("uses explicit horizon years when text horizon missing", () => {
    const r = computePortalInvestmentFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "equity",
      investmentHorizon: null,
      horizonYearsExplicit: 12,
      monthlyContribution: 2000,
      annualContribution: null,
    });
    expect(r).not.toBeNull();
    expect(r!.horizonYears).toBe(12);
  });

  it("supports manual rate source", () => {
    const r = computePortalInvestmentFutureValue({
      fvSourceType: "manual",
      resolvedFundId: null,
      resolvedFundCategory: null,
      investmentHorizon: null,
      horizonYearsExplicit: 10,
      monthlyContribution: 1000,
      annualContribution: null,
      manualAnnualRatePercent: 6,
    });
    expect(r).not.toBeNull();
    expect(r!.sourceExplanation).toMatch(/analýz/i);
  });

  it("computes lump FV via shared path", () => {
    const r = computePortalInvestmentFutureValue({
      fvSourceType: "manual",
      resolvedFundId: null,
      resolvedFundCategory: null,
      investmentHorizon: null,
      horizonYearsExplicit: 10,
      monthlyContribution: null,
      annualContribution: null,
      lumpContribution: 100_000,
      manualAnnualRatePercent: 5,
    });
    expect(r).not.toBeNull();
    expect(r!.amount).toBeGreaterThan(100_000);
  });
});

describe("computeSharedFutureValue (shared output model)", () => {
  it("includes standard disclaimer on every result", () => {
    const a = computeSharedFutureValue({
      fvSourceType: null,
      resolvedFundId: null,
      resolvedFundCategory: null,
      investmentHorizon: null,
      monthlyContribution: null,
      annualContribution: null,
    });
    expect(a.disclaimer).toBe(SHARED_FV_DISCLAIMER);
    expect(a.disclaimer).toMatch(/nezaručen|orientační/i);

    const b = computeSharedFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "equity",
      investmentHorizon: "10 let",
      monthlyContribution: 1000,
      annualContribution: null,
    });
    expect(b.disclaimer).toBe(SHARED_FV_DISCLAIMER);
  });

  it("maps heuristic-fallback to category-fallback sourceType when rate applies", () => {
    const r = computeSharedFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "balanced",
      investmentHorizon: "15 let",
      monthlyContribution: 2000,
      annualContribution: null,
    });
    expect(r.sourceType).toBe("category-fallback");
    expect(r.expectedAnnualRatePercent).toBe(6);
    expect(r.projectionState).toBe("complete");
    expect(r.projectedFutureValue).not.toBeNull();
  });

  it("uses fund-library sourceType when resolved fund has planning rate", () => {
    const r = computeSharedFutureValue({
      fvSourceType: "fund-library",
      resolvedFundId: "conseq_globalni_akciovy_ucastnicky",
      resolvedFundCategory: null,
      investmentHorizon: "10 let",
      monthlyContribution: 1000,
      annualContribution: null,
    });
    expect(r.sourceType).toBe("fund-library");
    expect(r.projectionState).toBe("complete");
  });

  it("returns unavailable when fvSourceType is missing", () => {
    const r = computeSharedFutureValue({
      fvSourceType: null,
      resolvedFundId: "conseq_globalni_akciovy_ucastnicky",
      resolvedFundCategory: null,
      investmentHorizon: "10 let",
      monthlyContribution: 1000,
      annualContribution: null,
    });
    expect(r.sourceType).toBe("unavailable");
    expect(r.projectionState).toBe("unavailable");
    expect(r.projectedFutureValue).toBeNull();
  });

  it("partial state: rate known but horizon missing — no fake FV", () => {
    const r = computeSharedFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "equity",
      investmentHorizon: null,
      horizonYearsExplicit: null,
      monthlyContribution: 2000,
      annualContribution: null,
    });
    expect(r.projectionState).toBe("partial");
    expect(r.projectedFutureValue).toBeNull();
    expect(r.expectedAnnualRatePercent).toBe(8);
    expect(r.horizonYears).toBeNull();
  });

  it("partial state: horizon known but contribution missing — no fake FV", () => {
    const r = computeSharedFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "bond",
      investmentHorizon: "8 let",
      monthlyContribution: null,
      annualContribution: null,
      lumpContribution: null,
    });
    expect(r.projectionState).toBe("partial");
    expect(r.projectedFutureValue).toBeNull();
    expect(r.horizonYears).toBe(8);
  });

  it("passes through currentValue without using it as synthetic input", () => {
    const r = computeSharedFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "equity",
      investmentHorizon: "10 let",
      monthlyContribution: 1000,
      annualContribution: null,
      currentValue: 500_000,
    });
    expect(r.currentValue).toBe(500_000);
    expect(r.projectedFutureValue).not.toBeNull();
  });

  it("uses category fallback rates: conservative 4%, bond 6%", () => {
    const cons = computeSharedFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "conservative",
      investmentHorizon: "10 let",
      monthlyContribution: 1000,
      annualContribution: null,
    });
    expect(cons.expectedAnnualRatePercent).toBe(4);

    const bond = computeSharedFutureValue({
      fvSourceType: "heuristic-fallback",
      resolvedFundId: null,
      resolvedFundCategory: "bond",
      investmentHorizon: "10 let",
      monthlyContribution: 1000,
      annualContribution: null,
    });
    expect(bond.expectedAnnualRatePercent).toBe(6);
  });
});
