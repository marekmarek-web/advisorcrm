import { describe, it, expect, vi } from "vitest";
import { getAssistantUsageMetrics, getAssistantUseCaseBreakdown, getAssistantHelpfulness } from "../assistant-analytics";

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
    auditLog: { tenantId: "t", userId: "u", action: "a", createdAt: "c" },
    eq: vi.fn(),
    and: vi.fn(),
    gte: vi.fn(),
    sql: Object.assign((s: TemplateStringsArray) => s[0], { raw: (s: string) => s }),
  };
});

describe("getAssistantUsageMetrics", () => {
  it("returns default zeros", async () => {
    const result = await getAssistantUsageMetrics("t1");
    expect(result.uniqueUsers).toBe(0);
    expect(result.sessions).toBe(0);
    expect(result.queries).toBe(0);
    expect(result.toolsInvoked).toBe(0);
    expect(result.draftsCreated).toBe(0);
    expect(result.actionsApplied).toBe(0);
  });

  it("accepts optional time window", async () => {
    const w = { startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") };
    const result = await getAssistantUsageMetrics("t1", w);
    expect(typeof result.uniqueUsers).toBe("number");
  });
});

describe("getAssistantUseCaseBreakdown", () => {
  it("returns empty array when no data", async () => {
    const result = await getAssistantUseCaseBreakdown("t1");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("getAssistantHelpfulness", () => {
  it("returns default zeros", async () => {
    const result = await getAssistantHelpfulness("t1");
    expect(result.actionAcceptanceRate).toBe(0);
    expect(result.draftEditRate).toBe(0);
    expect(result.rejectionRate).toBe(0);
    expect(result.fallbackRate).toBe(0);
  });
});
