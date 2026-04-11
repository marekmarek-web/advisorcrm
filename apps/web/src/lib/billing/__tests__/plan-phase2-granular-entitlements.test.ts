import { describe, expect, it } from "vitest";
import { computeEffectiveAccessContext } from "@/lib/billing/access-resolution";
import {
  ALL_PLAN_SYNCED_SETTING_KEYS,
  getPlanDefaultTenantSettingsFromAccessContext,
} from "@/lib/billing/plan-catalog";
import {
  computeCapabilityGatedPlanDefaults,
  mergeTenantBooleanOverrides,
} from "@/lib/billing/plan-capability-settings";
import type { SubscriptionState } from "@/lib/stripe/billing-types";

const inactiveSub: SubscriptionState = {
  status: null,
  plan: null,
  currentPeriodEnd: null,
  isActive: false,
  inGracePeriod: false,
};

const future = new Date(Date.now() + 7 * 86_400_000);

function ctxStart() {
  return computeEffectiveAccessContext({
    now: new Date(),
    isInternalAdmin: false,
    subscriptionState: {
      status: "active",
      plan: "start",
      currentPeriodEnd: future,
      isActive: true,
      inGracePeriod: false,
    },
    tenantTrial: null,
  });
}

function ctxPro() {
  return computeEffectiveAccessContext({
    now: new Date(),
    isInternalAdmin: false,
    subscriptionState: {
      status: "active",
      plan: "pro",
      currentPeriodEnd: future,
      isActive: true,
      inGracePeriod: false,
    },
    tenantTrial: null,
  });
}

function ctxManagement() {
  return computeEffectiveAccessContext({
    now: new Date(),
    isInternalAdmin: false,
    subscriptionState: {
      status: "active",
      plan: "management",
      currentPeriodEnd: future,
      isActive: true,
      inGracePeriod: false,
    },
    tenantTrial: null,
  });
}

function ctxTrial() {
  return computeEffectiveAccessContext({
    now: new Date(),
    isInternalAdmin: false,
    subscriptionState: inactiveSub,
    tenantTrial: {
      trialStartedAt: new Date(),
      trialEndsAt: future,
      trialPlanKey: "pro",
      trialConvertedAt: null,
    },
  });
}

function ctxInternalAdmin() {
  return computeEffectiveAccessContext({
    now: new Date(),
    isInternalAdmin: true,
    subscriptionState: inactiveSub,
    tenantTrial: null,
  });
}

function ctxRestricted() {
  return computeEffectiveAccessContext({
    now: new Date(),
    isInternalAdmin: false,
    subscriptionState: inactiveSub,
    tenantTrial: null,
  });
}

describe("Phase 2 — plan defaults + capability gates", () => {
  it("exports a fixed set of synced setting keys", () => {
    expect(ALL_PLAN_SYNCED_SETTING_KEYS.length).toBe(19);
  });

  it("Start: AI review off, team off, portal messaging off", () => {
    const ctx = ctxStart();
    const gated = computeCapabilityGatedPlanDefaults(ctx);
    expect(gated["ai.review_enabled"]).toBe(false);
    expect(gated["team.overview_enabled"]).toBe(false);
    expect(gated["client_portal.allow_messaging"]).toBe(false);
    expect(gated["ai.assistant_enabled"]).toBe(true);
  });

  it("Pro: AI review on, portal messaging + service requests on", () => {
    const ctx = ctxPro();
    const gated = computeCapabilityGatedPlanDefaults(ctx);
    expect(gated["ai.review_enabled"]).toBe(true);
    expect(gated["client_portal.allow_messaging"]).toBe(true);
    expect(gated["client_portal.allow_service_requests"]).toBe(true);
    expect(gated["integrations.google_gmail_enabled"]).toBe(true);
  });

  it("Management: team + manager + advanced reports on", () => {
    const ctx = ctxManagement();
    const gated = computeCapabilityGatedPlanDefaults(ctx);
    expect(gated["team.overview_enabled"]).toBe(true);
    expect(gated["team.production_enabled"]).toBe(true);
    expect(gated["manager.summary_enabled"]).toBe(true);
    expect(gated["reports.advanced_enabled"]).toBe(true);
  });

  it("Trial (PRO-level): matches Pro capability-gated defaults", () => {
    const trial = ctxTrial();
    const pro = ctxPro();
    expect(trial.source).toBe("trial");
    expect(computeCapabilityGatedPlanDefaults(trial)).toEqual(computeCapabilityGatedPlanDefaults(pro));
  });

  it("Internal admin: all synced keys enabled in plan defaults and gated", () => {
    const ctx = ctxInternalAdmin();
    const plan = getPlanDefaultTenantSettingsFromAccessContext(ctx);
    for (const k of ALL_PLAN_SYNCED_SETTING_KEYS) {
      expect(plan[k]).toBe(true);
    }
    const gated = computeCapabilityGatedPlanDefaults(ctx);
    for (const k of ALL_PLAN_SYNCED_SETTING_KEYS) {
      expect(gated[k]).toBe(true);
    }
  });

  it("Restricted: all synced keys off", () => {
    const ctx = ctxRestricted();
    expect(ctx.source).toBe("restricted");
    const gated = computeCapabilityGatedPlanDefaults(ctx);
    for (const k of ALL_PLAN_SYNCED_SETTING_KEYS) {
      expect(gated[k]).toBe(false);
    }
  });

  it("Tenant override can only narrow (Pro + messaging off in DB)", () => {
    const ctx = ctxPro();
    const gated = computeCapabilityGatedPlanDefaults(ctx);
    const merged = mergeTenantBooleanOverrides(gated, { "client_portal.allow_messaging": false });
    expect(merged["client_portal.allow_messaging"]).toBe(false);
    expect(merged["ai.review_enabled"]).toBe(true);
  });

  it("ai_review is not tied to ai.assistant_enabled only (Pro: assistant on, review has its own row)", () => {
    const ctx = ctxPro();
    const plan = getPlanDefaultTenantSettingsFromAccessContext(ctx);
    expect(plan["ai.assistant_enabled"]).toBe(true);
    expect(plan["ai.review_enabled"]).toBe(true);
    const gated = computeCapabilityGatedPlanDefaults(ctx);
    const noAssistant = mergeTenantBooleanOverrides(gated, { "ai.assistant_enabled": false });
    expect(noAssistant["ai.assistant_enabled"]).toBe(false);
    expect(noAssistant["ai.review_enabled"]).toBe(true);
  });
});
