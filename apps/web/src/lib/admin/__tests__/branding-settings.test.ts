import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
  },
  tenantSettings: {
    id: "id",
    tenantId: "tenant_id",
    key: "key",
    value: "value",
    domain: "domain",
    updatedBy: "updated_by",
    updatedAt: "updated_at",
    version: "version",
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));
import { db } from "db";

describe("branding-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockDb = db as any;
    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockResolvedValue([]);
    mockDb.update = vi.fn().mockReturnValue(mockDb);
    mockDb.set = vi.fn().mockReturnValue(mockDb);
    mockDb.insert = vi.fn().mockReturnValue(mockDb);
    mockDb.values = vi.fn().mockResolvedValue(undefined);
  });

  describe("DEFAULT_BRANDING", () => {
    it("has expected default values", async () => {
      const { DEFAULT_BRANDING } = await import("../branding-settings");
      expect(DEFAULT_BRANDING.appNameVariant).toBe("WePlan");
      expect(DEFAULT_BRANDING.accentColor).toBe("#3B82F6");
      expect(DEFAULT_BRANDING.defaultTone).toBe("professional");
      expect(DEFAULT_BRANDING.assistantDisplayName).toBeTruthy();
    });
  });

  describe("getEffectiveBranding", () => {
    it("returns defaults when no tenant overrides", async () => {
      const { getEffectiveBranding, DEFAULT_BRANDING } = await import("../branding-settings");
      const branding = await getEffectiveBranding("t1");
      expect(branding.accentColor).toBe(DEFAULT_BRANDING.accentColor);
      expect(branding.appNameVariant).toBe(DEFAULT_BRANDING.appNameVariant);
    });

    it("applies tenant overrides for specific fields", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([
        { key: "branding.accentColor", value: "#FF0000" },
        { key: "branding.appNameVariant", value: "Acme CRM" },
      ]);
      const { getEffectiveBranding } = await import("../branding-settings");
      const branding = await getEffectiveBranding("t1");
      expect(branding.accentColor).toBe("#FF0000");
      expect(branding.appNameVariant).toBe("Acme CRM");
    });

    it("merges overrides with defaults", async () => {
      const mockDb = db as any;
      mockDb.where = vi.fn().mockResolvedValue([
        { key: "branding.accentColor", value: "#00FF00" },
      ]);
      const { getEffectiveBranding, DEFAULT_BRANDING } = await import("../branding-settings");
      const branding = await getEffectiveBranding("t1");
      expect(branding.accentColor).toBe("#00FF00");
      // Other defaults preserved
      expect(branding.appNameVariant).toBe(DEFAULT_BRANDING.appNameVariant);
    });
  });

  describe("mergeBranding", () => {
    it("merges override fields into base", async () => {
      const { mergeBranding, DEFAULT_BRANDING } = await import("../branding-settings");
      const merged = mergeBranding(DEFAULT_BRANDING, { accentColor: "#123456" });
      expect(merged.accentColor).toBe("#123456");
      expect(merged.appNameVariant).toBe(DEFAULT_BRANDING.appNameVariant);
    });

    it("ignores undefined override values", async () => {
      const { mergeBranding, DEFAULT_BRANDING } = await import("../branding-settings");
      const merged = mergeBranding(DEFAULT_BRANDING, { accentColor: undefined });
      expect(merged.accentColor).toBe(DEFAULT_BRANDING.accentColor);
    });

    it("does not mutate base", async () => {
      const { mergeBranding, DEFAULT_BRANDING } = await import("../branding-settings");
      const base = { ...DEFAULT_BRANDING };
      mergeBranding(base, { accentColor: "#FFFFFF" });
      expect(base.accentColor).toBe(DEFAULT_BRANDING.accentColor);
    });
  });
});
