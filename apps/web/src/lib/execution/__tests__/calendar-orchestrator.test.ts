import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearDedupStore } from "../execution-guards";

vi.mock("db", () => {
  const chain = () => {
    const self: Record<string, unknown> = {};
    const fn = vi.fn().mockImplementation(() => self);
    self.values = fn;
    self.returning = vi.fn().mockResolvedValue([{ id: "evt_1" }]);
    return self;
  };
  return {
    db: { insert: vi.fn().mockReturnValue(chain()) },
    events: { id: "id" },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

const { deriveDeadlines, createFollowupEvent, createClientMeeting } = await import("../calendar-orchestrator");

beforeEach(() => clearDedupStore());

describe("deriveDeadlines", () => {
  it("derives review deadline when old enough", () => {
    const old = new Date(Date.now() - 60 * 60 * 60 * 1000);
    const deadlines = deriveDeadlines([
      { entityType: "review", entityId: "r1", createdAt: old },
    ]);
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0].type).toBe("review_resolution");
  });

  it("uses explicit dueAt when provided", () => {
    const due = new Date("2026-12-01");
    const deadlines = deriveDeadlines([
      { entityType: "task", entityId: "t1", createdAt: new Date(), dueAt: due },
    ]);
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0].deadlineAt).toBe(due);
  });

  it("skips young review", () => {
    const deadlines = deriveDeadlines([
      { entityType: "review", entityId: "r1", createdAt: new Date() },
    ]);
    expect(deadlines).toHaveLength(0);
  });
});

describe("createFollowupEvent", () => {
  it("creates event through guards", async () => {
    const result = await createFollowupEvent({
      title: "Follow-up",
      startAt: new Date(),
      endAt: new Date(Date.now() + 3600_000),
      tenantId: "t1",
      assignedTo: "u1",
    }, { tenantId: "t1", userId: "u1", roleName: "Advisor" });
    expect(result.ok).toBe(true);
    expect(result.eventId).toBe("evt_1");
  });

  it("blocks on tenant mismatch", async () => {
    const result = await createFollowupEvent({
      title: "Follow-up",
      startAt: new Date(),
      endAt: new Date(Date.now() + 3600_000),
      tenantId: "other",
      assignedTo: "u1",
    }, { tenantId: "t1", userId: "u1", roleName: "Advisor" });
    expect(result.ok).toBe(false);
    expect(result.blockedReasons).toContain("TENANT_MISMATCH");
  });
});

describe("createClientMeeting", () => {
  it("creates meeting event", async () => {
    const result = await createClientMeeting(
      "c1", new Date(), new Date(Date.now() + 3600_000), "t1", "u1",
      { tenantId: "t1", userId: "u1", roleName: "Advisor" },
    );
    expect(result.ok).toBe(true);
  });
});
