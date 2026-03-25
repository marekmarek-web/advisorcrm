import { describe, it, expect } from "vitest";
import {
  sortBySeverityAndDate,
  buildQuickActions,
  resolveDeepLinkForItem,
  type ActionCenterItem,
} from "../action-center";

function makeItem(overrides?: Partial<ActionCenterItem>): ActionCenterItem {
  return {
    id: "ac_1",
    type: "review_waiting",
    title: "Test",
    description: "Desc",
    severity: "info",
    entityType: "review",
    entityId: "r1",
    quickActions: [],
    deepLink: "/portal/today",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("sortBySeverityAndDate", () => {
  it("sorts urgent first", () => {
    const items = [
      makeItem({ id: "a", severity: "info" }),
      makeItem({ id: "b", severity: "urgent" }),
      makeItem({ id: "c", severity: "warning" }),
    ];
    const sorted = sortBySeverityAndDate(items);
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("c");
    expect(sorted[2].id).toBe("a");
  });

  it("sorts by date within same severity", () => {
    const older = new Date("2026-01-01");
    const newer = new Date("2026-03-01");
    const items = [
      makeItem({ id: "old", severity: "warning", createdAt: older }),
      makeItem({ id: "new", severity: "warning", createdAt: newer }),
    ];
    const sorted = sortBySeverityAndDate(items);
    expect(sorted[0].id).toBe("new");
  });
});

describe("buildQuickActions", () => {
  it("returns approve + detail for approval_pending", () => {
    const actions = buildQuickActions("approval_pending");
    expect(actions.length).toBe(2);
    expect(actions[0].actionType).toBe("approve_draft");
  });

  it("returns mark_done + snooze for reminder_due", () => {
    const actions = buildQuickActions("reminder_due");
    expect(actions.some((a) => a.actionType === "mark_done")).toBe(true);
    expect(actions.some((a) => a.actionType === "snooze")).toBe(true);
  });

  it("returns acknowledge for escalation", () => {
    const actions = buildQuickActions("escalation");
    expect(actions.some((a) => a.actionType === "acknowledge")).toBe(true);
  });
});

describe("resolveDeepLinkForItem", () => {
  it("resolves review deep link", () => {
    expect(resolveDeepLinkForItem("review", "r1")).toContain("/portal/contracts/review/r1");
  });

  it("resolves contact deep link", () => {
    expect(resolveDeepLinkForItem("contact", "c1")).toContain("/portal/contacts/c1");
  });

  it("resolves escalation deep link", () => {
    expect(resolveDeepLinkForItem("escalation", "e1")).toContain("/portal/team-overview");
  });

  it("falls back to /portal/today for unknown types", () => {
    expect(resolveDeepLinkForItem("unknown", "x")).toBe("/portal/today");
  });
});
