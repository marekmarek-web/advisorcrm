import { describe, expect, it } from "vitest";
import { DEFAULT_STATE } from "../mortgage.config";
import {
  calculateResult,
  computeLoanRate,
  computeMortgageRate,
  computePMT,
  getBorrowingAmount,
  getCalculatedLtv,
  getOffersWithBanks,
  ownFromLtvAuto,
  ownFromLtvMortgage,
} from "../mortgage.engine";
import type { MortgageState } from "../mortgage.types";

function state(patch: Partial<MortgageState>): MortgageState {
  return { ...DEFAULT_STATE, ...patch };
}

describe("mortgage.engine", () => {
  it("computePMT returns expected annuity payment range", () => {
    const pmt = computePMT(6_000_000, 4.18, 30);
    expect(pmt).toBeGreaterThan(29_000);
    expect(pmt).toBeLessThan(30_000);
  });

  it("calculates LTV for mortgage and akontace for auto", () => {
    expect(getCalculatedLtv(state({ product: "mortgage", loan: 6_000_000, own: 600_000 }))).toBe(
      91
    );

    expect(
      getCalculatedLtv(state({ product: "loan", loanType: "auto", loan: 500_000, own: 100_000 }))
    ).toBe(20);
  });

  it("computes mortgage rate with subtype/refi/fix adjustments", () => {
    const base = computeMortgageRate(state({ mortgageType: "standard", type: "new" }), 5);
    const investment = computeMortgageRate(
      state({ mortgageType: "investment", type: "new" }),
      5
    );
    const american = computeMortgageRate(state({ mortgageType: "american", type: "new" }), 5);
    const refi = computeMortgageRate(state({ mortgageType: "standard", type: "refi" }), 5);
    const shortFix = computeMortgageRate(state({ mortgageType: "standard", type: "new" }), 3);
    const longFix = computeMortgageRate(state({ mortgageType: "standard", type: "new" }), 10);

    expect(investment).toBeGreaterThan(base);
    expect(american).toBeGreaterThan(investment);
    expect(refi).toBeLessThanOrEqual(base);
    expect(shortFix).toBeGreaterThan(base);
    expect(longFix).toBeLessThanOrEqual(base);
  });

  it("computes loan rate by subtype", () => {
    const consumer = computeLoanRate(state({ product: "loan", loanType: "consumer" }));
    const auto = computeLoanRate(state({ product: "loan", loanType: "auto" }));
    const consolidation = computeLoanRate(
      state({ product: "loan", loanType: "consolidation" })
    );

    expect(auto).toBeLessThan(consumer);
    expect(consolidation).toBeLessThan(consumer);
    expect(auto).toBeLessThan(consolidation);
  });

  it("returns borrowing amount by product logic", () => {
    expect(
      getBorrowingAmount(state({ product: "mortgage", loan: 3_000_000, own: 500_000 }))
    ).toBe(3_000_000);

    expect(
      getBorrowingAmount(state({ product: "loan", loanType: "auto", loan: 600_000, own: 150_000 }))
    ).toBe(450_000);

    expect(
      getBorrowingAmount(
        state({ product: "loan", loanType: "consolidation", loan: 700_000, extra: 100_000 })
      )
    ).toBe(800_000);
  });

  it("computes own resources from LTV and akontace", () => {
    expect(ownFromLtvMortgage(6_000_000, 90)).toBe(600_000);
    expect(ownFromLtvAuto(500_000, 20)).toBe(100_000);
  });

  it("sorts offers by rate and exposes monthly payment", () => {
    const offers = getOffersWithBanks(state({ product: "mortgage", term: 30 }));
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].rate).toBeLessThanOrEqual(offers[1].rate);
    expect(offers[0].monthlyPayment).toBeGreaterThan(0);
  });

  it("recalculates own resources when LTV lock and loan changes", () => {
    const initial = state({ product: "mortgage", loan: 6_000_000, ltvLock: 90 });
    const resultInitial = calculateResult({ ...initial, own: ownFromLtvMortgage(6_000_000, 90) });
    const resultUpdated = calculateResult({
      ...initial,
      loan: 7_000_000,
      own: ownFromLtvMortgage(7_000_000, 90),
    });
    expect(resultUpdated.propertyValue).toBeGreaterThan(resultInitial.propertyValue);
    expect(resultUpdated.displayLtv).toBe(90);
  });

  it("consolidation includes extra money in final payment", () => {
    const withoutExtra = calculateResult(
      state({ product: "loan", loanType: "consolidation", loan: 500_000, extra: 0, term: 6 })
    );
    const withExtra = calculateResult(
      state({ product: "loan", loanType: "consolidation", loan: 500_000, extra: 200_000, term: 6 })
    );

    expect(withExtra.borrowingAmount).toBe(700_000);
    expect(withExtra.monthlyPayment).toBeGreaterThan(withoutExtra.monthlyPayment);
  });
});
