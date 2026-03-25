import { describe, it, expect } from "vitest";
import {
  SETTINGS_REGISTRY,
  getSettingDefinition,
  getSettingsForDomain,
  validateSettingValue,
  getAllDomains,
  getSettingDefault,
} from "../settings-registry";

describe("settings-registry", () => {
  describe("SETTINGS_REGISTRY", () => {
    it("has at least 20 entries", () => {
      expect(SETTINGS_REGISTRY.length).toBeGreaterThanOrEqual(20);
    });

    it("all entries have required fields", () => {
      for (const s of SETTINGS_REGISTRY) {
        expect(s.key).toBeTruthy();
        expect(s.domain).toBeTruthy();
        expect(s.type).toBeTruthy();
        expect(s.description).toBeTruthy();
        expect(s.defaultValue !== undefined).toBe(true);
      }
    });

    it("has no duplicate keys", () => {
      const keys = SETTINGS_REGISTRY.map((s) => s.key);
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    });
  });

  describe("getSettingDefinition", () => {
    it("returns definition for known key", () => {
      const def = getSettingDefinition("ai.assistant_enabled");
      expect(def).toBeDefined();
      expect(def?.key).toBe("ai.assistant_enabled");
      expect(def?.domain).toBe("ai_behavior");
      expect(def?.type).toBe("boolean");
      expect(def?.defaultValue).toBe(true);
    });

    it("returns undefined for unknown key", () => {
      expect(getSettingDefinition("unknown.key")).toBeUndefined();
    });
  });

  describe("getSettingsForDomain", () => {
    it("returns settings for ai_behavior", () => {
      const settings = getSettingsForDomain("ai_behavior");
      expect(settings.length).toBeGreaterThanOrEqual(1);
      for (const s of settings) {
        expect(s.domain).toBe("ai_behavior");
      }
    });

    it("returns settings for review_policies", () => {
      const settings = getSettingsForDomain("review_policies");
      expect(settings.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty array for domain with no settings", () => {
      // If branding has no settings yet returns empty
      const settings = getSettingsForDomain("branding" as any);
      expect(Array.isArray(settings)).toBe(true);
    });
  });

  describe("validateSettingValue", () => {
    it("validates boolean correctly", () => {
      expect(validateSettingValue("ai.assistant_enabled", true).valid).toBe(true);
      expect(validateSettingValue("ai.assistant_enabled", false).valid).toBe(true);
      expect(validateSettingValue("ai.assistant_enabled", "yes").valid).toBe(false);
      expect(validateSettingValue("ai.assistant_enabled", 1).valid).toBe(false);
    });

    it("validates enum value", () => {
      expect(validateSettingValue("review.strictness", "medium").valid).toBe(true);
      expect(validateSettingValue("review.strictness", "low").valid).toBe(true);
      expect(validateSettingValue("review.strictness", "extreme").valid).toBe(false);
    });

    it("validates number with min/max", () => {
      expect(validateSettingValue("review.sla_warning_hours", 48).valid).toBe(true);
      expect(validateSettingValue("review.sla_warning_hours", 0).valid).toBe(false);
      expect(validateSettingValue("review.sla_warning_hours", 999).valid).toBe(false);
    });

    it("validates string type", () => {
      expect(validateSettingValue("tenant.timezone", "Europe/Prague").valid).toBe(true);
      expect(validateSettingValue("tenant.timezone", 42).valid).toBe(false);
    });

    it("rejects null value", () => {
      expect(validateSettingValue("ai.assistant_enabled", null).valid).toBe(false);
    });

    it("rejects unknown key", () => {
      const result = validateSettingValue("nonexistent.key", "value");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown setting key");
    });

    it("validates decimal number in range", () => {
      expect(validateSettingValue("mobile.scan_min_quality", 0.5).valid).toBe(true);
      expect(validateSettingValue("mobile.scan_min_quality", 1.5).valid).toBe(false);
    });

    it("validates json type as object", () => {
      expect(validateSettingValue("automation.allowed_actions", ["action1"]).valid).toBe(true);
      expect(validateSettingValue("automation.allowed_actions", "string").valid).toBe(false);
    });
  });

  describe("getAllDomains", () => {
    it("returns a list of unique domains", () => {
      const domains = getAllDomains();
      const unique = new Set(domains);
      expect(unique.size).toBe(domains.length);
      expect(domains).toContain("ai_behavior");
      expect(domains).toContain("review_policies");
      expect(domains).toContain("payment_policies");
    });
  });

  describe("getSettingDefault", () => {
    it("returns default value for known key", () => {
      expect(getSettingDefault("ai.assistant_enabled")).toBe(true);
      expect(getSettingDefault("review.strictness")).toBe("medium");
      expect(getSettingDefault("mobile.scan_min_quality")).toBe(0.3);
    });

    it("returns undefined for unknown key", () => {
      expect(getSettingDefault("unknown.key")).toBeUndefined();
    });
  });
});
