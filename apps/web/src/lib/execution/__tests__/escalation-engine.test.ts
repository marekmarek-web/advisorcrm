import { describe, it, expect, vi } from "vitest";

vi.mock("db", () => {
  const chain = () => {
    const self: Record<string, unknown> = {};
    const fn = vi.fn().mockImplementation(() => self);
    self.values = fn;
    self.set = fn;
    self.where = fn;
    self.limit = vi.fn().mockResolvedValue([]);
    return self;
  };
  return {
    db: { insert: vi.fn().mockReturnValue(chain()), select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) }), update: vi.fn().mockReturnValue(chain()) },
    escalationEvents: {},
    eq: vi.fn(),
    and: vi.fn(),
  };
});

vi.mock("@/lib/push/send", () => ({
  sendPushToUser: vi.fn(),
}));

vi.mock("../notification-center", () => ({
  emitNotification: vi.fn().mockResolvedValue({ id: "notif_1" }),
}));

const { evaluateEscalations, acknowledgeEscalation } = await import("../escalation-engine");

describe("evaluateEscalations", () => {
  it("creates escalation events for SLA breaches", async () => {
    const items = [
      { entityType: "review", entityId: "r1", ageHours: 100 },
    ];
    const events = await evaluateEscalations("t1", items, "manager1");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].policyCode).toBe("review_resolution");
    expect(events[0].status).toBe("pending");
  });

  it("returns empty for items below threshold", async () => {
    const events = await evaluateEscalations("t1", [
      { entityType: "review", entityId: "r2", ageHours: 10 },
    ], "manager1");
    expect(events).toHaveLength(0);
  });
});

describe("acknowledgeEscalation", () => {
  it("returns true on success", async () => {
    const result = await acknowledgeEscalation("esc_1", "t1");
    expect(result).toBe(true);
  });
});
