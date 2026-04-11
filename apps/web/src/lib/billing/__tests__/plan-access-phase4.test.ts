import { describe, expect, it } from "vitest";
import { computeEffectiveAccessContext } from "@/lib/billing/access-resolution";
import { computeCapabilityGatedPlanDefaults } from "@/lib/billing/plan-capability-settings";
import { isPlanCapabilityAllowed } from "@/lib/billing/plan-capability-allow";
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

/** Effective tenant booleans aligned with server enforcement (plan gates × defaults). */
function gatedSettingsFor(ctx: ReturnType<typeof computeEffectiveAccessContext>) {
  return computeCapabilityGatedPlanDefaults(ctx);
}

describe("Fáze 4 — capability matrix (server-side model)", () => {
  it("Start user: AI review PDF flow blocked (ai_review capability off)", () => {
    const ctx = ctxStart();
    const s = gatedSettingsFor(ctx);
    expect(isPlanCapabilityAllowed("ai_review", ctx, s)).toBe(false);
    expect(isPlanCapabilityAllowed("ai_review_export_pdf", ctx, s)).toBe(false);
  });

  it("Start user: client portal chat blocked (client_portal_messaging)", () => {
    const ctx = ctxStart();
    const s = gatedSettingsFor(ctx);
    expect(isPlanCapabilityAllowed("client_portal_messaging", ctx, s)).toBe(false);
  });

  it("Pro user: AI review allowed", () => {
    const ctx = ctxPro();
    const s = gatedSettingsFor(ctx);
    expect(isPlanCapabilityAllowed("ai_review", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("ai_review_export_pdf", ctx, s)).toBe(true);
  });

  it("Pro user: team overview blocked (Management tier)", () => {
    const ctx = ctxPro();
    const s = gatedSettingsFor(ctx);
    expect(isPlanCapabilityAllowed("team_overview", ctx, s)).toBe(false);
    expect(isPlanCapabilityAllowed("team_production", ctx, s)).toBe(false);
    expect(isPlanCapabilityAllowed("manager_summary", ctx, s)).toBe(false);
  });

  it("Management user: team overview + production allowed", () => {
    const ctx = ctxManagement();
    const s = gatedSettingsFor(ctx);
    expect(isPlanCapabilityAllowed("team_overview", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("team_production", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("team_goals_events", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("manager_summary", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("reports_advanced", ctx, s)).toBe(true);
  });

  it("Trial user: matches Pro for capabilities (trial = Pro-level)", () => {
    const trial = ctxTrial();
    const pro = ctxPro();
    const st = gatedSettingsFor(trial);
    const sp = gatedSettingsFor(pro);
    expect(trial.source).toBe("trial");
    expect(isPlanCapabilityAllowed("ai_review", trial, st)).toBe(isPlanCapabilityAllowed("ai_review", pro, sp));
    expect(isPlanCapabilityAllowed("team_overview", trial, st)).toBe(
      isPlanCapabilityAllowed("team_overview", pro, sp),
    );
  });

  it("Internal admin: bypass — all checked capabilities allowed with gated settings", () => {
    const ctx = ctxInternalAdmin();
    const s = gatedSettingsFor(ctx);
    expect(ctx.isBypassed).toBe(true);
    expect(isPlanCapabilityAllowed("ai_review", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("team_overview", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("google_gmail", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("client_portal_messaging", ctx, s)).toBe(true);
  });
});
