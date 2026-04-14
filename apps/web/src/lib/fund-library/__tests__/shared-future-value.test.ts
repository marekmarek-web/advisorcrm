/**
 * Run: pnpm vitest run src/lib/fund-library/__tests__/shared-future-value.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  parseInvestmentHorizonYears,
  futureValueOfMonthlyContributions,
  computePortalInvestmentFutureValue,
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
});
