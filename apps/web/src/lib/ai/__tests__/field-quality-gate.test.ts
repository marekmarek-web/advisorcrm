import { describe, expect, it } from "vitest";
import { detectPaymentFrequencyConflict } from "../field-quality-gate";

describe("detectPaymentFrequencyConflict", () => {
  it("does not flag povinné ručení when annual and monthly mirror the same annual premium", () => {
    const result = detectPaymentFrequencyConflict({
      paymentFrequency: { value: "ročně", status: "extracted" },
      totalMonthlyPremium: { value: "4000 CZK", status: "extracted" },
      annualPremium: { value: "4000 CZK", status: "extracted" },
      productName: { value: "Povinné ručení vozidla", status: "extracted" },
    });
    expect(result.hasConflict).toBe(false);
  });

  it("keeps life insurance mismatch warning when monthly and annual premium are identical", () => {
    const result = detectPaymentFrequencyConflict({
      paymentFrequency: { value: "měsíčně", status: "extracted" },
      totalMonthlyPremium: { value: "3775", status: "extracted" },
      annualPremium: { value: "3775", status: "extracted" },
      productName: { value: "Bel Mondo 20", status: "extracted" },
    });
    expect(result.hasConflict).toBe(true);
  });
});
