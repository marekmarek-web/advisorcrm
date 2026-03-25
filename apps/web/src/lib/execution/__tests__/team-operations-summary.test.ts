import { describe, it, expect, vi } from "vitest";

vi.mock("db", () => {
  const chain = () => {
    const self: Record<string, unknown> = {};
    const fn = vi.fn().mockImplementation(() => self);
    self.values = fn;
    self.set = fn;
    self.where = fn;
    self.groupBy = vi.fn().mockResolvedValue([
      { assignedTo: "adv1", count: 3, avgAge: 55.2 },
      { assignedTo: "adv2", count: 1, avgAge: 12.0 },
    ]);
    self.limit = vi.fn().mockResolvedValue([]);
    self.innerJoin = vi.fn().mockImplementation(() => self);
    return self;
  };
  return {
    db: {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(chain()) }),
      update: vi.fn().mockReturnValue(chain()),
    },
    contractUploadReviews: { tenantId: "tenant_id", assignedTo: "assigned_to", createdAt: "created_at", id: "id" },
    tasks: { id: "id", tenantId: "tenant_id", assignedTo: "assigned_to" },
    eq: vi.fn(),
    and: vi.fn(),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  };
});

const { getTeamOperationsSummary, reassignReview } = await import("../team-operations-summary");

describe("getTeamOperationsSummary", () => {
  it("returns summary with advisor metrics", async () => {
    const summary = await getTeamOperationsSummary("t1");
    expect(summary.tenantId).toBe("t1");
    expect(summary.advisorMetrics).toHaveLength(2);
    expect(summary.advisorMetrics[0].pendingReviews).toBe(3);
    expect(summary.totalPendingReviews).toBe(4);
  });

  it("computes average review age", async () => {
    const summary = await getTeamOperationsSummary("t1");
    expect(summary.averageReviewAgeHours).toBeGreaterThan(0);
  });
});

describe("reassignReview", () => {
  it("returns true on success", async () => {
    const result = await reassignReview("r1", "adv1", "adv2", "t1");
    expect(result).toBe(true);
  });
});
