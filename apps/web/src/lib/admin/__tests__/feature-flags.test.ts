import { describe, it, expect, beforeEach } from "vitest";
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
  setFeatureOverride,
  clearFeatureOverride,
  getFlagDefinition,
  getAllFlagStates,
} from "../feature-flags";

describe("feature-flags", () => {
  const tenantId = "flag-test-tenant";

  beforeEach(() => {
    // Clear any overrides set in previous tests
    for (const flag of FEATURE_FLAGS) {
      clearFeatureOverride(flag.code, tenantId);
      clearFeatureOverride(flag.code, null);
    }
  });

  describe("FEATURE_FLAGS", () => {
    it("has at least 8 flags", () => {
      expect(FEATURE_FLAGS.length).toBeGreaterThanOrEqual(8);
    });

    it("all flags have required fields", () => {
      for (const flag of FEATURE_FLAGS) {
        expect(flag.code).toBeTruthy();
        expect(flag.label).toBeTruthy();
        expect(flag.description).toBeTruthy();
        expect(typeof flag.defaultEnabled).toBe("boolean");
        expect(flag.rolloutScope).toBeTruthy();
      }
    });

    it("has no duplicate codes", () => {
      const codes = FEATURE_FLAGS.map((f) => f.code);
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });

    it("contains expected flags", () => {
      const codes = FEATURE_FLAGS.map((f) => f.code);
      expect(codes).toContain("adobe_preprocess_v2");
      expect(codes).toContain("mobile_capture_v2");
      expect(codes).toContain("manager_dashboards");
      expect(codes).toContain("assistant_apply_suggest");
    });
  });

  describe("getFlagDefinition", () => {
    it("returns definition for known code", () => {
      const flag = getFlagDefinition("mobile_capture_v2");
      expect(flag).toBeDefined();
      expect(flag?.code).toBe("mobile_capture_v2");
    });

    it("returns undefined for unknown code", () => {
      expect(getFlagDefinition("nonexistent_flag")).toBeUndefined();
    });
  });

  describe("isFeatureEnabled", () => {
    it("returns default value for global flag with no overrides", () => {
      const flag = getFlagDefinition("mobile_capture_v2");
      expect(isFeatureEnabled("mobile_capture_v2")).toBe(flag?.defaultEnabled);
    });

    it("returns false for internal flags without override", () => {
      expect(isFeatureEnabled("policy_engine", tenantId)).toBe(false);
    });

    it("returns false for unknown flag", () => {
      expect(isFeatureEnabled("nonexistent_flag")).toBe(false);
    });

    it("respects tenant override", () => {
      expect(isFeatureEnabled("adobe_preprocess_v2", tenantId)).toBe(false);
      setFeatureOverride("adobe_preprocess_v2", tenantId, true);
      expect(isFeatureEnabled("adobe_preprocess_v2", tenantId)).toBe(true);
    });

    it("respects global override over default", () => {
      setFeatureOverride("mobile_capture_v2", null, false);
      expect(isFeatureEnabled("mobile_capture_v2")).toBe(false);
    });

    it("global override takes precedence over tenant override", () => {
      setFeatureOverride("mobile_capture_v2", null, false);
      setFeatureOverride("mobile_capture_v2", tenantId, true);
      // Global override wins
      expect(isFeatureEnabled("mobile_capture_v2", tenantId)).toBe(false);
    });
  });

  describe("setFeatureOverride and clearFeatureOverride", () => {
    it("can enable a disabled flag for a tenant", () => {
      setFeatureOverride("payment_extraction_v2", tenantId, true);
      expect(isFeatureEnabled("payment_extraction_v2", tenantId)).toBe(true);
    });

    it("can disable an enabled flag for a tenant", () => {
      setFeatureOverride("manager_dashboards", tenantId, false);
      expect(isFeatureEnabled("manager_dashboards", tenantId)).toBe(false);
    });

    it("clearing restores default", () => {
      const defaultEnabled = getFlagDefinition("manager_dashboards")?.defaultEnabled;
      setFeatureOverride("manager_dashboards", tenantId, false);
      expect(isFeatureEnabled("manager_dashboards", tenantId)).toBe(false);
      clearFeatureOverride("manager_dashboards", tenantId);
      expect(isFeatureEnabled("manager_dashboards", tenantId)).toBe(defaultEnabled);
    });
  });

  describe("getAllFlagStates", () => {
    it("returns all flags", () => {
      const states = getAllFlagStates(tenantId);
      expect(states.length).toBe(FEATURE_FLAGS.length);
    });

    it("marks overridden flags correctly", () => {
      setFeatureOverride("adobe_preprocess_v2", tenantId, true);
      const states = getAllFlagStates(tenantId);
      const state = states.find((s) => s.code === "adobe_preprocess_v2");
      expect(state?.source).toBe("tenant_override");
      expect(state?.enabled).toBe(true);
    });

    it("marks global override flags correctly", () => {
      setFeatureOverride("mobile_capture_v2", null, false);
      const states = getAllFlagStates(tenantId);
      const state = states.find((s) => s.code === "mobile_capture_v2");
      expect(state?.source).toBe("global_override");
      expect(state?.enabled).toBe(false);
    });

    it("marks default flags as default source", () => {
      const states = getAllFlagStates(tenantId);
      const state = states.find((s) => s.code === "new_classifier");
      expect(state?.source).toBe("default");
    });
  });
});
