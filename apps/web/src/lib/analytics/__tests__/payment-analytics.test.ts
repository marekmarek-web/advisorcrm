import { describe, it, expect, vi } from "vitest";
import { getPaymentMetrics, getPaymentQualityBreakdown } from "../payment-analytics";

vi.mock("db", () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.select = () => chain();
    c.from = () => chain();
    c.where = () => chain();
    c.then = (fn: (v: unknown[]) => unknown) => Promise.resolve(fn([]));
    return c;
  };
  return {
    db: { select: () => chain() },
    clientPaymentSetups: { tenantId: "t", status: "s", createdAt: "c", needsHumanReview: "n", extractedData: "e" },
    eq: vi.fn(),
    and: vi.fn(),
    gte: vi.fn(),
    sql: Object.assign((s: TemplateStringsArray) => s[0], { raw: (s: string) => s }),
  };
});

describe("getPaymentMetrics", () => {
  it("returns default zeros", async () => {
    const result = await getPaymentMetrics("t1");
    expect(result.created).toBe(0);
    expect(result.blocked).toBe(0);
    expect(result.applied).toBe(0);
    expect(result.awaitingReview).toBe(0);
    expect(result.portalVisibilityRate).toBe(0);
  });

  it("accepts optional time window", async () => {
    const w = { startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") };
    const result = await getPaymentMetrics("t1", w);
    expect(typeof result.created).toBe("number");
  });
});

describe("getPaymentQualityBreakdown", () => {
  it("returns default zeros", async () => {
    const result = await getPaymentQualityBreakdown("t1");
    expect(result.missingIban).toBe(0);
    expect(result.missingVs).toBe(0);
    expect(result.missingAmount).toBe(0);
    expect(result.conflictCount).toBe(0);
  });
});
