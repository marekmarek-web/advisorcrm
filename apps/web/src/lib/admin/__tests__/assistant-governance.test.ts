import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_PROFILES,
  getEffectiveAssistantProfile,
  isCapabilityEnabled,
  setTenantAssistantProfile,
  setCapabilityOverride,
  clearCapabilityOverride,
  getEnabledCapabilities,
  buildDeterministicSummary,
} from "../assistant-governance";

describe("assistant-governance", () => {
  const tenantId = "gov-test-tenant";

  beforeEach(() => {
    // Reset to defaults
    setTenantAssistantProfile(tenantId, "balanced");
    clearCapabilityOverride(tenantId, "dashboard_summary");
    clearCapabilityOverride(tenantId, "automation_recommendations");
    clearCapabilityOverride(tenantId, "chat");
  });

  describe("DEFAULT_PROFILES", () => {
    it("has conservative, balanced, proactive profiles", () => {
      expect(DEFAULT_PROFILES["conservative"]).toBeDefined();
      expect(DEFAULT_PROFILES["balanced"]).toBeDefined();
      expect(DEFAULT_PROFILES["proactive"]).toBeDefined();
    });

    it("conservative has minimal capabilities", () => {
      const conservative = DEFAULT_PROFILES["conservative"]!;
      expect(conservative.capabilities).not.toContain("automation_recommendations");
      expect(conservative.capabilities).not.toContain("chat");
      expect(conservative.maxActionSeverity).toBe("read_only");
      expect(conservative.canProposeApply).toBe(false);
    });

    it("proactive has all capabilities", () => {
      const proactive = DEFAULT_PROFILES["proactive"]!;
      expect(proactive.capabilities).toContain("automation_recommendations");
      expect(proactive.canProposeApply).toBe(true);
      expect(proactive.maxActionSeverity).toBe("full");
    });

    it("balanced is between conservative and proactive", () => {
      const balanced = DEFAULT_PROFILES["balanced"]!;
      expect(balanced.capabilities).toContain("chat");
      expect(balanced.canProposeApply).toBe(false);
      expect(balanced.maxActionSeverity).toBe("draft_only");
    });
  });

  describe("getEffectiveAssistantProfile", () => {
    it("returns balanced profile by default when no tenantId", () => {
      const profile = getEffectiveAssistantProfile(undefined);
      expect(profile.profileId).toBe("balanced");
    });

    it("returns tenant-specific profile", () => {
      setTenantAssistantProfile(tenantId, "conservative");
      const profile = getEffectiveAssistantProfile(tenantId);
      expect(profile.profileId).toBe("conservative");
    });

    it("falls back to balanced for unknown profile", () => {
      setTenantAssistantProfile(tenantId, "unknown_profile");
      const profile = getEffectiveAssistantProfile(tenantId);
      expect(profile.profileId).toBe("balanced");
    });
  });

  describe("isCapabilityEnabled", () => {
    it("dashboard_summary is enabled for balanced", () => {
      setTenantAssistantProfile(tenantId, "balanced");
      expect(isCapabilityEnabled(tenantId, "dashboard_summary")).toBe(true);
    });

    it("automation_recommendations is disabled for balanced", () => {
      setTenantAssistantProfile(tenantId, "balanced");
      expect(isCapabilityEnabled(tenantId, "automation_recommendations")).toBe(false);
    });

    it("automation_recommendations is enabled for proactive", () => {
      setTenantAssistantProfile(tenantId, "proactive");
      expect(isCapabilityEnabled(tenantId, "automation_recommendations")).toBe(true);
    });

    it("capability override enables a disabled capability", () => {
      setTenantAssistantProfile(tenantId, "conservative");
      expect(isCapabilityEnabled(tenantId, "chat")).toBe(false);
      setCapabilityOverride(tenantId, "chat", true);
      expect(isCapabilityEnabled(tenantId, "chat")).toBe(true);
    });

    it("capability override disables an enabled capability", () => {
      setTenantAssistantProfile(tenantId, "proactive");
      expect(isCapabilityEnabled(tenantId, "automation_recommendations")).toBe(true);
      setCapabilityOverride(tenantId, "automation_recommendations", false);
      expect(isCapabilityEnabled(tenantId, "automation_recommendations")).toBe(false);
    });

    it("clearing override restores profile behavior", () => {
      setTenantAssistantProfile(tenantId, "conservative");
      setCapabilityOverride(tenantId, "chat", true);
      expect(isCapabilityEnabled(tenantId, "chat")).toBe(true);
      clearCapabilityOverride(tenantId, "chat");
      expect(isCapabilityEnabled(tenantId, "chat")).toBe(false);
    });

    it("works without tenantId", () => {
      // Should use balanced defaults
      expect(isCapabilityEnabled(undefined, "chat")).toBe(true);
      expect(isCapabilityEnabled(undefined, "automation_recommendations")).toBe(false);
    });
  });

  describe("getEnabledCapabilities", () => {
    it("returns subset for conservative", () => {
      setTenantAssistantProfile(tenantId, "conservative");
      const caps = getEnabledCapabilities(tenantId);
      expect(caps).toContain("dashboard_summary");
      expect(caps).not.toContain("chat");
      expect(caps).not.toContain("automation_recommendations");
    });

    it("returns full list for proactive", () => {
      setTenantAssistantProfile(tenantId, "proactive");
      const caps = getEnabledCapabilities(tenantId);
      expect(caps).toContain("automation_recommendations");
      expect(caps.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("buildDeterministicSummary", () => {
    it("returns deterministic type", () => {
      const summary = buildDeterministicSummary({ reviewCount: 3 });
      expect(summary.type).toBe("deterministic");
    });

    it("includes review count in message", () => {
      const summary = buildDeterministicSummary({ reviewCount: 3 });
      expect(summary.message).toContain("3 review(s)");
    });

    it("handles multiple context items", () => {
      const summary = buildDeterministicSummary({
        reviewCount: 2,
        blockedCount: 1,
        taskCount: 5,
      });
      expect(summary.details.length).toBe(3);
    });

    it("handles empty context", () => {
      const summary = buildDeterministicSummary({});
      expect(summary.message).toBe("No outstanding items");
    });
  });
});
