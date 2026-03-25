import { describe, it, expect, vi } from "vitest";
import { getBacklogMetrics, getSLACompliance, getAgingBuckets } from "../backlog-analytics";
import type { AnalyticsScope } from "../analytics-scope";

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
    contractUploadReviews: { tenantId: "t", status: "s", createdAt: "c" },
    reminders: { tenantId: "t", status: "s", dueAt: "d" },
    escalationEvents: { tenantId: "t", status: "s", policyCode: "p", createdAt: "c", resolvedAt: "r" },
    clientPaymentSetups: { tenantId: "t", status: "s", createdAt: "c" },
    eq: vi.fn(),
    and: vi.fn(),
    gte: vi.fn(),
    sql: Object.assign((s: TemplateStringsArray) => s[0], { raw: (s: string) => s }),
  };
});

const managerScope: AnalyticsScope = {
  tenantId: "t1",
  userId: "m1",
  roleName: "Manager",
  visibleUserIds: ["u1", "u2"],
  scopeType: "manager",
};

describe("getBacklogMetrics", () => {
  it("returns default zeros", async () => {
    const result = await getBacklogMetrics(managerScope);
    expect(result.pendingReviewCount).toBe(0);
    expect(result.pendingApplyCount).toBe(0);
    expect(result.blockedCount).toBe(0);
    expect(result.unresolvedReminders).toBe(0);
    expect(result.unresolvedEscalations).toBe(0);
  });
});

describe("getSLACompliance", () => {
  it("returns empty array when no escalation data", async () => {
    const result = await getSLACompliance("t1");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });
});

describe("getAgingBuckets", () => {
  it("returns array with bucket structure", async () => {
    const result = await getAgingBuckets("t1");
    expect(Array.isArray(result)).toBe(true);
  });
});
