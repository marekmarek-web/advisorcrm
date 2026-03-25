import { describe, it, expect, vi } from "vitest";
import { getExecutiveKPIs, getExecutiveFunnel, getExecutiveTrends } from "../executive-analytics";

vi.mock("db", () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.select = () => chain();
    c.from = () => chain();
    c.where = () => chain();
    c.groupBy = () => chain();
    c.then = (fn: (v: unknown[]) => unknown) => Promise.resolve(fn([]));
    return c;
  };
  return {
    db: { select: () => chain() },
    contractUploadReviews: { tenantId: "t", assignedTo: "a", status: "s", createdAt: "c", updatedAt: "u", detectedDocumentType: "d" },
    clientPaymentSetups: { tenantId: "t", status: "s", createdAt: "c", needsHumanReview: "n", extractedData: "e" },
    auditLog: { tenantId: "t", userId: "u", action: "a", createdAt: "c" },
    eq: vi.fn(),
    and: vi.fn(),
    gte: vi.fn(),
    sql: Object.assign((s: TemplateStringsArray) => s[0], { raw: (s: string) => s }),
  };
});

describe("getExecutiveKPIs", () => {
  it("returns default zeros", async () => {
    const result = await getExecutiveKPIs("t1");
    expect(result.totalProcessedDocs).toBe(0);
    expect(result.reviewCompletionRate).toBe(0);
    expect(result.blockedCriticalItems).toBe(0);
    expect(result.avgTimeToApplyHours).toBe(0);
    expect(result.paymentPortalReadinessRate).toBe(0);
  });

  it("accepts optional time window", async () => {
    const w = { startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") };
    const result = await getExecutiveKPIs("t1", w);
    expect(typeof result.totalProcessedDocs).toBe("number");
  });
});

describe("getExecutiveFunnel", () => {
  it("returns default funnel with all zeros", async () => {
    const result = await getExecutiveFunnel("t1");
    expect(result.uploaded).toBe(0);
    expect(result.preprocessed).toBe(0);
    expect(result.classified).toBe(0);
    expect(result.extracted).toBe(0);
    expect(result.reviewed).toBe(0);
    expect(result.approved).toBe(0);
    expect(result.applied).toBe(0);
  });
});

describe("getExecutiveTrends", () => {
  it("returns empty array when no data", async () => {
    const result = await getExecutiveTrends("t1", "daily");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it("accepts weekly period", async () => {
    const result = await getExecutiveTrends("t1", "weekly");
    expect(Array.isArray(result)).toBe(true);
  });
});
