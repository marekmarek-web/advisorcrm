import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAdvisorSummary, getAdvisorPerformance, getAdvisorBottlenecks } from "../advisor-performance";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockGroupBy = vi.fn();
const mockLimit = vi.fn();

vi.mock("db", () => {
  const chain = () => ({
    select: (...a: unknown[]) => { mockSelect(...a); return chain(); },
    from: (...a: unknown[]) => { mockFrom(...a); return chain(); },
    where: (...a: unknown[]) => { mockWhere(...a); return chain(); },
    groupBy: (...a: unknown[]) => { mockGroupBy(...a); return chain(); },
    limit: (...a: unknown[]) => { mockLimit(...a); return []; },
    then: (fn: (v: unknown[]) => unknown) => Promise.resolve(fn([])),
    [Symbol.asyncIterator]: async function* () {},
  });
  const proxy = new Proxy(chain(), {
    get(target, prop) {
      if (prop === "then") return (fn: (v: unknown[]) => unknown) => Promise.resolve(fn([]));
      if (typeof prop === "symbol") return (target as Record<symbol, unknown>)[prop];
      return (..._a: unknown[]) => proxy;
    },
  });
  return {
    db: { select: () => proxy },
    contractUploadReviews: { tenantId: "tenantId", assignedTo: "assignedTo", status: "status", createdAt: "createdAt" },
    clientPaymentSetups: { tenantId: "tenantId", needsHumanReview: "needsHumanReview" },
    tasks: { tenantId: "tenantId", assignedTo: "assignedTo", dueDate: "dueDate", completedAt: "completedAt" },
    reminders: { tenantId: "tenantId", userId: "userId", status: "status", dueAt: "dueAt" },
    communicationDrafts: { tenantId: "tenantId", createdBy: "createdBy", status: "status" },
    escalationEvents: { tenantId: "tenantId", escalatedTo: "escalatedTo", status: "status" },
    contractReviewCorrections: { tenantId: "tenantId", correctedBy: "correctedBy", correctedFields: "correctedFields", createdAt: "createdAt" },
    auditLog: { tenantId: "tenantId", userId: "userId", action: "action", createdAt: "createdAt" },
    eq: vi.fn(),
    and: vi.fn(),
    gte: vi.fn(),
    inArray: vi.fn(),
    sql: Object.assign((s: TemplateStringsArray, ..._args: unknown[]) => s[0], { raw: (s: string) => s }),
  };
});

describe("getAdvisorSummary", () => {
  it("returns default zeros when DB returns empty", async () => {
    const result = await getAdvisorSummary("t1", "u1");
    expect(result.pendingReviews).toBe(0);
    expect(result.blockedItems).toBe(0);
    expect(result.paymentSetupsWaiting).toBe(0);
    expect(result.tasksDue).toBe(0);
    expect(result.overdueTasks).toBe(0);
    expect(result.escalations).toBe(0);
    expect(result.applyReadyItems).toBe(0);
    expect(result.communicationDraftsAwaiting).toBe(0);
  });

  it("returns expected type shape", async () => {
    const result = await getAdvisorSummary("t1", "u1");
    expect(typeof result.pendingReviews).toBe("number");
    expect(typeof result.blockedItems).toBe("number");
    expect(typeof result.escalations).toBe("number");
  });
});

describe("getAdvisorPerformance", () => {
  it("returns default zeros when DB returns empty", async () => {
    const result = await getAdvisorPerformance("t1", "u1");
    expect(result.documentsProcessed).toBe(0);
    expect(result.averageReviewTimeHours).toBe(0);
    expect(result.applyCompletionRate).toBe(0);
    expect(result.correctionRate).toBe(0);
    expect(result.followUpCompletionRate).toBe(0);
    expect(result.overdueRatio).toBe(0);
    expect(result.aiAssistantUsageCount).toBe(0);
  });

  it("accepts optional time window", async () => {
    const window = { startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") };
    const result = await getAdvisorPerformance("t1", "u1", window);
    expect(result.documentsProcessed).toBe(0);
  });
});

describe("getAdvisorBottlenecks", () => {
  it("returns empty arrays when no corrections", async () => {
    const result = await getAdvisorBottlenecks("t1", "u1");
    expect(result.topBlockedReasons).toEqual([]);
    expect(result.mostCorrectedFields).toEqual([]);
    expect(result.worstDocTypes).toEqual([]);
  });
});
