import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PROVIDER_REGISTRY,
  getProvider,
  getProvidersByType,
  getEffectiveProviderStatus,
  getActiveProvider,
  setProviderStatus,
  clearProviderStatusOverride,
  activateDegradedMode,
  deactivateDegradedMode,
  isDegradedMode,
  activateGlobalDegradedMode,
  deactivateGlobalDegradedMode,
  listActiveDegradedModes,
  getProviderStatusReport,
  getUnhealthyProviders,
  resolveProviderForType,
  type ProviderType,
} from "../provider-fallbacks";

describe("PROVIDER_REGISTRY", () => {
  it("contains all required provider types", () => {
    const types = [...new Set(PROVIDER_REGISTRY.map((p) => p.providerType))];
    expect(types).toContain("ai_extraction");
    expect(types).toContain("storage");
    expect(types).toContain("email");
    expect(types).toContain("ai_assistant");
  });

  it("all entries have a fallback strategy", () => {
    PROVIDER_REGISTRY.forEach((p) => {
      expect(p.fallbackStrategy).toBeDefined();
    });
  });
});

describe("getProvider", () => {
  it("returns provider by ID", () => {
    const p = getProvider("openai_gpt4");
    expect(p).toBeDefined();
    expect(p!.providerType).toBe("ai_extraction");
  });

  it("returns undefined for unknown provider", () => {
    expect(getProvider("nonexistent")).toBeUndefined();
  });
});

describe("getProvidersByType", () => {
  it("returns all email providers", () => {
    const emailProviders = getProvidersByType("email");
    expect(emailProviders.length).toBeGreaterThanOrEqual(2);
    emailProviders.forEach((p) => expect(p.providerType).toBe("email"));
  });
});

describe("setProviderStatus / getEffectiveProviderStatus", () => {
  afterEach(() => {
    clearProviderStatusOverride("openai_gpt4");
  });

  it("overrides provider status", () => {
    setProviderStatus("openai_gpt4", "unavailable", "Manual override for test");
    expect(getEffectiveProviderStatus("openai_gpt4")).toBe("unavailable");
  });

  it("throws for unknown provider", () => {
    expect(() => setProviderStatus("nonexistent", "healthy", "test")).toThrow(/Unknown provider/);
  });

  it("clears override correctly", () => {
    setProviderStatus("openai_gpt4", "unavailable", "test");
    clearProviderStatusOverride("openai_gpt4");
    expect(getEffectiveProviderStatus("openai_gpt4")).toBe("unknown");
  });

  it("returns change result with previous status", () => {
    const result = setProviderStatus("openai_gpt4", "degraded", "Test");
    expect(result.previousStatus).toBe("unknown");
    expect(result.newStatus).toBe("degraded");
    expect(result.activatedAt).toBeInstanceOf(Date);
  });
});

describe("getActiveProvider", () => {
  afterEach(() => {
    clearProviderStatusOverride("openai_gpt4");
    clearProviderStatusOverride("openai_gpt35_fallback");
  });

  it("returns healthy provider when healthy", () => {
    setProviderStatus("openai_gpt4", "healthy", "test");
    const active = getActiveProvider("ai_extraction");
    expect(active?.providerId).toBe("openai_gpt4");
  });

  it("returns null when all providers unavailable", () => {
    setProviderStatus("openai_gpt4", "unavailable", "test");
    setProviderStatus("openai_gpt35_fallback", "unavailable", "test");
    const active = getActiveProvider("ai_extraction");
    expect(active).toBeNull();
  });
});

describe("degraded mode", () => {
  afterEach(() => {
    deactivateDegradedMode("tenant-1", "ai_assistant");
    deactivateGlobalDegradedMode("email");
  });

  it("activates and checks degraded mode for tenant", () => {
    activateDegradedMode("tenant-1", "ai_assistant");
    expect(isDegradedMode("tenant-1", "ai_assistant")).toBe(true);
    expect(isDegradedMode("tenant-2", "ai_assistant")).toBe(false);
  });

  it("deactivates degraded mode", () => {
    activateDegradedMode("tenant-1", "ai_assistant");
    deactivateDegradedMode("tenant-1", "ai_assistant");
    expect(isDegradedMode("tenant-1", "ai_assistant")).toBe(false);
  });

  it("global degraded mode applies to all tenants", () => {
    activateGlobalDegradedMode("email");
    expect(isDegradedMode("tenant-1", "email")).toBe(true);
    expect(isDegradedMode("tenant-2", "email")).toBe(true);
  });

  it("listActiveDegradedModes returns keys", () => {
    activateDegradedMode("t1", "storage");
    const keys = listActiveDegradedModes();
    expect(keys.some((k) => k.includes("storage"))).toBe(true);
    deactivateDegradedMode("t1", "storage");
  });
});

describe("getProviderStatusReport", () => {
  afterEach(() => {
    clearProviderStatusOverride("supabase_storage");
  });

  it("returns all providers in report", () => {
    const report = getProviderStatusReport();
    expect(report.length).toBe(PROVIDER_REGISTRY.length);
  });

  it("includes override reason when present", () => {
    setProviderStatus("supabase_storage", "degraded", "Bucket quota exceeded");
    const report = getProviderStatusReport();
    const storageEntry = report.find((r) => r.providerId === "supabase_storage");
    expect(storageEntry?.overrideReason).toBe("Bucket quota exceeded");
  });
});

describe("getUnhealthyProviders", () => {
  afterEach(() => {
    clearProviderStatusOverride("sendgrid");
  });

  it("returns degraded and unavailable providers", () => {
    setProviderStatus("sendgrid", "degraded", "test");
    const unhealthy = getUnhealthyProviders();
    expect(unhealthy.some((p) => p.providerId === "sendgrid")).toBe(true);
  });

  it("does not include healthy providers", () => {
    const unhealthy = getUnhealthyProviders();
    unhealthy.forEach((p) => {
      expect(["degraded", "unavailable"]).toContain(p.status);
    });
  });
});

describe("resolveProviderForType", () => {
  afterEach(() => {
    clearProviderStatusOverride("openai_gpt4");
  });

  it("resolves to primary when healthy", () => {
    setProviderStatus("openai_gpt4", "healthy", "test");
    const result = resolveProviderForType("ai_extraction");
    expect(result.resolvedProviderId).toBe("openai_gpt4");
    expect(result.isFallback).toBe(false);
  });

  it("resolves to fallback when primary is unavailable", () => {
    setProviderStatus("openai_gpt4", "unavailable", "test");
    const result = resolveProviderForType("ai_extraction");
    expect(result.resolvedProviderId).toBe("openai_gpt35_fallback");
    expect(result.isFallback).toBe(true);
  });
});
