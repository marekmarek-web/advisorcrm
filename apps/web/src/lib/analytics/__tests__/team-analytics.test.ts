import { describe, it, expect, vi } from "vitest";
import { getTeamAnalyticsSummary, getTeamMemberComparison, getTeamHeatmapData } from "../team-analytics";
import type { AnalyticsScope } from "../analytics-scope";

vi.mock("db", () => {
  const proxy: Record<string, unknown> = {};
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.select = () => chain();
    c.from = () => chain();
    c.where = () => chain();
    c.groupBy = () => chain();
    c.limit = () => [];
    c.then = (fn: (v: unknown[]) => unknown) => Promise.resolve(fn([]));
    return c;
  };
  return {
    db: { select: () => chain() },
    contractUploadReviews: { tenantId: "tenantId", assignedTo: "assignedTo", status: "status", createdAt: "createdAt" },
    clientPaymentSetups: { tenantId: "tenantId", needsHumanReview: "needsHumanReview" },
    reminders: { tenantId: "tenantId", dueAt: "dueAt", status: "status" },
    escalationEvents: { tenantId: "tenantId", status: "status" },
    auditLog: { tenantId: "tenantId", action: "action", createdAt: "createdAt" },
    eq: vi.fn(),
    and: vi.fn(),
    gte: vi.fn(),
    inArray: vi.fn(),
    sql: Object.assign((s: TemplateStringsArray) => s[0], { raw: (s: string) => s }),
  };
});

const managerScope: AnalyticsScope = {
  tenantId: "t1",
  userId: "m1",
  roleName: "Manager",
  visibleUserIds: ["u1", "u2", "u3"],
  scopeType: "manager",
};

describe("getTeamAnalyticsSummary", () => {
  it("returns default summary structure", async () => {
    const result = await getTeamAnalyticsSummary(managerScope);
    expect(result.tenantId).toBe("t1");
    expect(result.totalPendingReviews).toBe(0);
    expect(result.totalBlockedItems).toBe(0);
    expect(result.unresolvedEscalations).toBe(0);
    expect(result.blockedPayments).toBe(0);
    expect(result.aiUsageTotal).toBe(0);
    expect(result.averageReviewAgeHours).toBe(0);
  });
});

describe("getTeamMemberComparison", () => {
  it("returns empty array for empty visibleUserIds", async () => {
    const scope: AnalyticsScope = { ...managerScope, visibleUserIds: [] };
    const result = await getTeamMemberComparison(scope);
    expect(result).toEqual([]);
  });

  it("returns array for valid scope", async () => {
    const result = await getTeamMemberComparison(managerScope);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("getTeamHeatmapData", () => {
  it("returns empty array for empty visibleUserIds", async () => {
    const scope: AnalyticsScope = { ...managerScope, visibleUserIds: [] };
    const result = await getTeamHeatmapData(scope);
    expect(result).toEqual([]);
  });

  it("returns array for valid scope", async () => {
    const result = await getTeamHeatmapData(managerScope);
    expect(Array.isArray(result)).toBe(true);
  });
});
