import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EffectiveSetting } from "../effective-settings-resolver";

vi.mock("db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  },
  tenantSettings: { tenantId: "tenant_id", key: "key", value: "value", domain: "domain" },
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
}));

import { db } from "db";

describe("effective-settings-resolver", () => {
  const tenantId = "tenant-123";

  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockResolvedValue([]);
  });

  describe("resolveEffectiveSetting", () => {
    it("returns default when no tenant override exists", async () => {
      const { resolveEffectiveSetting } = await import("../effective-settings-resolver");
      const result = await resolveEffectiveSetting(tenantId, "ai.assistant_enabled");
      expect(result).not.toBeNull();
      expect(result!.key).toBe("ai.assistant_enabled");
      expect(result!.value).toBe(true);
      expect(result!.origin).toBe("default");
      expect(result!.lockedByHigherScope).toBe(false);
    });

    it("returns tenant override when present", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([{ value: false }]);
      const { resolveEffectiveSetting } = await import("../effective-settings-resolver");
      const result = await resolveEffectiveSetting(tenantId, "ai.assistant_enabled");
      expect(result!.value).toBe(false);
      expect(result!.origin).toBe("tenant_override");
    });

    it("returns null for unknown key", async () => {
      const { resolveEffectiveSetting } = await import("../effective-settings-resolver");
      const result = await resolveEffectiveSetting(tenantId, "unknown.key");
      expect(result).toBeNull();
    });
  });

  describe("getSettingOrigin", () => {
    it("returns default when no override", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([]);
      const { getSettingOrigin } = await import("../effective-settings-resolver");
      const origin = await getSettingOrigin(tenantId, "review.strictness");
      expect(origin).toBe("default");
    });

    it("returns tenant_override when override present", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([{ value: "high" }]);
      const { getSettingOrigin } = await import("../effective-settings-resolver");
      const origin = await getSettingOrigin(tenantId, "review.strictness");
      expect(origin).toBe("tenant_override");
    });
  });

  describe("resolveEffectiveSettings", () => {
    it("returns all settings with defaults when no overrides", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([]);
      const { resolveEffectiveSettings } = await import("../effective-settings-resolver");
      const results = await resolveEffectiveSettings(tenantId);
      expect(results.length).toBeGreaterThanOrEqual(20);
      for (const r of results) {
        expect(r.origin).toBe("default");
      }
    });

    it("returns domain-filtered settings", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([]);
      const { resolveEffectiveSettings } = await import("../effective-settings-resolver");
      const results = await resolveEffectiveSettings(tenantId, "ai_behavior");
      expect(results.length).toBeGreaterThanOrEqual(1);
      for (const r of results) {
        expect(r.domain).toBe("ai_behavior");
      }
    });

    it("applies tenant override values", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([
        { key: "ai.assistant_enabled", value: false },
      ]);
      const { resolveEffectiveSettings } = await import("../effective-settings-resolver");
      const results = await resolveEffectiveSettings(tenantId, "ai_behavior");
      const assistantSetting = results.find((r) => r.key === "ai.assistant_enabled");
      expect(assistantSetting?.value).toBe(false);
      expect(assistantSetting?.origin).toBe("tenant_override");
    });
  });

  describe("getEffectiveSettingValue", () => {
    it("returns typed default value", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([]);
      const { getEffectiveSettingValue } = await import("../effective-settings-resolver");
      const value = await getEffectiveSettingValue<string>(tenantId, "review.strictness");
      expect(value).toBe("medium");
    });

    it("returns tenant override if present", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([{ value: "high" }]);
      const { getEffectiveSettingValue } = await import("../effective-settings-resolver");
      const value = await getEffectiveSettingValue<string>(tenantId, "review.strictness");
      expect(value).toBe("high");
    });
  });
});
