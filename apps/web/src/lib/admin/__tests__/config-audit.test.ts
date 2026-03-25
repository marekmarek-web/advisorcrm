import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
  auditLog: {
    id: "id",
    tenantId: "tenant_id",
    userId: "user_id",
    action: "action",
    entityId: "entity_id",
    meta: "meta",
    createdAt: "created_at",
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
}));
vi.mock("drizzle-orm", () => ({
  like: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}));

import { logAudit } from "@/lib/audit";
import { db } from "db";

describe("config-audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
    mockDb.limit = vi.fn().mockResolvedValue([]);
  });

  describe("logConfigChange", () => {
    it("calls logAudit with correct action", async () => {
      const { logConfigChange } = await import("../config-audit");
      await logConfigChange({
        tenantId: "t1",
        userId: "u1",
        domain: "review_policies",
        key: "review.strictness",
        oldValue: "medium",
        newValue: "high",
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "config:review_policies:update",
          entityType: "setting",
          entityId: "review.strictness",
        })
      );
    });

    it("includes old and new value in meta", async () => {
      const { logConfigChange } = await import("../config-audit");
      await logConfigChange({
        tenantId: "t1",
        userId: "u1",
        domain: "ai_behavior",
        key: "ai.assistant_enabled",
        oldValue: true,
        newValue: false,
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            oldValue: true,
            newValue: false,
          }),
        })
      );
    });

    it("includes reason when provided", async () => {
      const { logConfigChange } = await import("../config-audit");
      await logConfigChange({
        tenantId: "t1",
        userId: "u1",
        domain: "ai_behavior",
        key: "ai.assistant_enabled",
        oldValue: true,
        newValue: false,
        reason: "Security restriction",
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            reason: "Security restriction",
          }),
        })
      );
    });
  });

  describe("logPolicyChange", () => {
    it("calls logAudit with policy action", async () => {
      const { logPolicyChange } = await import("../config-audit");
      await logPolicyChange({
        tenantId: "t1",
        userId: "u1",
        policyId: "review-policy-1",
        changeType: "update",
        oldPolicy: { outcome: "allow" },
        newPolicy: { outcome: "require_approval" },
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "policy:update",
          entityType: "policy",
          entityId: "review-policy-1",
        })
      );
    });

    it("handles create change type", async () => {
      const { logPolicyChange } = await import("../config-audit");
      await logPolicyChange({
        tenantId: "t1",
        userId: "u1",
        policyId: "new-policy",
        changeType: "create",
        newPolicy: { outcome: "block_apply" },
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "policy:create" })
      );
    });

    it("handles disable change type", async () => {
      const { logPolicyChange } = await import("../config-audit");
      await logPolicyChange({
        tenantId: "t1",
        userId: "u1",
        policyId: "existing-policy",
        changeType: "disable",
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "policy:disable" })
      );
    });
  });

  describe("getConfigChangeHistory", () => {
    it("returns empty array when no history", async () => {
      const { getConfigChangeHistory } = await import("../config-audit");
      const history = await getConfigChangeHistory("t1");
      expect(history).toEqual([]);
    });

    it("maps db rows to ConfigChangeEntry", async () => {
      const mockDb = db as any;
      mockDb.limit = vi.fn().mockResolvedValue([
        {
          id: "audit-1",
          tenantId: "t1",
          userId: "u1",
          action: "config:review_policies:update",
          entityId: "review.strictness",
          meta: { key: "review.strictness", domain: "review_policies", oldValue: "medium", newValue: "high" },
          createdAt: new Date("2026-01-01"),
        },
      ]);
      const { getConfigChangeHistory } = await import("../config-audit");
      const history = await getConfigChangeHistory("t1");
      expect(history.length).toBe(1);
      expect(history[0]!.key).toBe("review.strictness");
      expect(history[0]!.oldValue).toBe("medium");
      expect(history[0]!.newValue).toBe("high");
      expect(history[0]!.action).toBe("config:review_policies:update");
    });
  });

  describe("getPolicyChangeHistory", () => {
    it("returns empty array when no policy history", async () => {
      const { getPolicyChangeHistory } = await import("../config-audit");
      const history = await getPolicyChangeHistory("t1");
      expect(history).toEqual([]);
    });

    it("maps policy rows correctly", async () => {
      const mockDb = db as any;
      mockDb.limit = vi.fn().mockResolvedValue([
        {
          id: "audit-2",
          tenantId: "t1",
          userId: "u1",
          action: "policy:update",
          entityId: "my-policy",
          meta: { policyId: "my-policy", changeType: "update", oldPolicy: null, newPolicy: { outcome: "block_apply" } },
          createdAt: new Date("2026-01-02"),
        },
      ]);
      const { getPolicyChangeHistory } = await import("../config-audit");
      const history = await getPolicyChangeHistory("t1");
      expect(history.length).toBe(1);
      expect(history[0]!.key).toBe("my-policy");
      expect(history[0]!.domain).toBe("policy");
    });
  });
});
