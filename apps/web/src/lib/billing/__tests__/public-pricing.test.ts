import { describe, expect, it } from "vitest";
import {
  annualSavingsVersusTwelveMonthly,
  effectiveMonthlyKcWhenBilledAnnually,
  PUBLIC_MONTHLY_PRICE_KC,
  yearlyTotalKcFromMonthlyList,
} from "@/lib/billing/public-pricing";

describe("public-pricing (Fáze 5)", () => {
  it("měsíční cílové částky", () => {
    expect(PUBLIC_MONTHLY_PRICE_KC.starter).toBe(990);
    expect(PUBLIC_MONTHLY_PRICE_KC.pro).toBe(1990);
    expect(PUBLIC_MONTHLY_PRICE_KC.team).toBe(3490);
  });

  it("roční fakturace = −20 % oproti 12× měsíční", () => {
    const m = 990;
    expect(effectiveMonthlyKcWhenBilledAnnually(m)).toBe(792);
    expect(yearlyTotalKcFromMonthlyList(m)).toBe(9504);
    expect(annualSavingsVersusTwelveMonthly(m)).toBe(11880 - 9504);
  });

  it("Management: roční součet a úspora", () => {
    expect(yearlyTotalKcFromMonthlyList(3490)).toBe(33504);
    expect(annualSavingsVersusTwelveMonthly(3490)).toBe(41880 - 33504);
  });
});
