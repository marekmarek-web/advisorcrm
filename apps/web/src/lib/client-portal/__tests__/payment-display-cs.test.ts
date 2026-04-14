/**
 * Run: pnpm vitest run src/lib/client-portal/__tests__/payment-display-cs.test.ts
 */
import { describe, it, expect } from "vitest";
import { formatPaymentFrequencyCs } from "../payment-display-cs";

describe("formatPaymentFrequencyCs", () => {
  it("maps common English tokens to Czech", () => {
    expect(formatPaymentFrequencyCs("monthly")).toBe("Měsíčně");
    expect(formatPaymentFrequencyCs("yearly")).toBe("Ročně");
    expect(formatPaymentFrequencyCs("quarterly")).toBe("Čtvrtletně");
  });

  it("maps Czech phrases", () => {
    expect(formatPaymentFrequencyCs("měsíčně")).toBe("Měsíčně");
    expect(formatPaymentFrequencyCs("ročně")).toBe("Ročně");
  });

  it("returns null for empty", () => {
    expect(formatPaymentFrequencyCs(null)).toBeNull();
    expect(formatPaymentFrequencyCs("   ")).toBeNull();
  });
});
