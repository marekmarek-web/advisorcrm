import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("db", () => {
  const chain = () => {
    const self: Record<string, unknown> = {};
    const fn = vi.fn().mockImplementation(() => self);
    self.values = fn;
    self.set = fn;
    self.where = fn;
    self.limit = fn;
    return self;
  };
  return {
    db: { insert: vi.fn().mockReturnValue(chain()), update: vi.fn().mockReturnValue(chain()) },
    advisorNotifications: {},
    eq: vi.fn(),
    and: vi.fn(),
  };
});

vi.mock("@/lib/push/send", () => ({
  sendPushToUser: vi.fn(),
}));

import {
  emitNotification,
  isDuplicate,
  clearNotificationDedupStore,
  bundleNotifications,
  type NotificationItem,
} from "../notification-center";

beforeEach(() => clearNotificationDedupStore());

describe("emitNotification", () => {
  it("creates notification with id and status", async () => {
    const result = await emitNotification({
      tenantId: "t1",
      type: "review_waiting",
      title: "Review waiting",
      body: "A review is pending",
      severity: "warning",
      targetUserId: "u1",
      channels: ["in_app"],
    });
    expect(result).not.toBeNull();
    expect(result!.id).toMatch(/^notif_/);
    expect(result!.status).toBe("unread");
  });

  it("deduplicates by groupKey", async () => {
    await emitNotification({
      tenantId: "t1",
      type: "review_waiting",
      title: "Review",
      body: "Body",
      severity: "warning",
      targetUserId: "u1",
      channels: ["in_app"],
      groupKey: "review_waiting:r1",
    });

    const second = await emitNotification({
      tenantId: "t1",
      type: "review_waiting",
      title: "Review",
      body: "Body",
      severity: "warning",
      targetUserId: "u1",
      channels: ["in_app"],
      groupKey: "review_waiting:r1",
    });

    expect(second).toBeNull();
  });
});

describe("isDuplicate", () => {
  it("returns false for undefined groupKey", () => {
    expect(isDuplicate(undefined)).toBe(false);
  });
});

describe("bundleNotifications", () => {
  it("groups notifications by type when groupKey present", () => {
    const items: NotificationItem[] = [
      { id: "n1", tenantId: "t1", type: "review_waiting", title: "A", body: "", severity: "warning", targetUserId: "u1", channels: ["in_app"], status: "unread", groupKey: "g1", createdAt: new Date() },
      { id: "n2", tenantId: "t1", type: "review_waiting", title: "B", body: "", severity: "warning", targetUserId: "u1", channels: ["in_app"], status: "unread", groupKey: "g2", createdAt: new Date() },
      { id: "n3", tenantId: "t1", type: "escalation", title: "C", body: "", severity: "urgent", targetUserId: "u1", channels: ["in_app"], status: "unread", createdAt: new Date() },
    ];
    const { groups, singles } = bundleNotifications(items);
    expect(groups.get("review_waiting")).toHaveLength(2);
    expect(singles).toHaveLength(1);
  });
});
