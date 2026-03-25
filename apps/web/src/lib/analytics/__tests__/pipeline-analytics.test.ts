import { describe, it, expect, vi } from "vitest";
import { getPipelineMetrics, getPipelineBreakdown, getPipelineLatency } from "../pipeline-analytics";

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
    eq: vi.fn(),
    and: vi.fn(),
    gte: vi.fn(),
    sql: Object.assign((s: TemplateStringsArray) => s[0], { raw: (s: string) => s }),
  };
});

describe("getPipelineMetrics", () => {
  it("returns default zeros", async () => {
    const result = await getPipelineMetrics("t1");
    expect(result.preprocessSuccessRate).toBe(0);
    expect(result.extractionSuccessRate).toBe(0);
    expect(result.extractionFailedRate).toBe(0);
    expect(result.applyGateBlockRate).toBe(0);
  });
});

describe("getPipelineBreakdown", () => {
  it("returns empty array by documentType", async () => {
    const result = await getPipelineBreakdown("t1", "documentType");
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array by advisor", async () => {
    const result = await getPipelineBreakdown("t1", "advisor");
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array by institution", async () => {
    const result = await getPipelineBreakdown("t1", "institution");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("getPipelineLatency", () => {
  it("returns default zeros", async () => {
    const result = await getPipelineLatency("t1");
    expect(result.avgPreprocessDurationMs).toBe(0);
    expect(result.avgExtractionDurationMs).toBe(0);
    expect(result.avgReviewToApproveHours).toBe(0);
    expect(result.avgApproveToApplyHours).toBe(0);
  });
});
