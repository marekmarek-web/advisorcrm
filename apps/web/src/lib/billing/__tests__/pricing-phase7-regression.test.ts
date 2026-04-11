/**
 * Fáze 7 — regresní testy pricing / effective access / capability matrix / quota základy.
 * Čisté funkce (bez DB, bez server-only guardů).
 */

import { describe, expect, it } from "vitest";
import { computeEffectiveAccessContext } from "@/lib/billing/access-resolution";
import { computeCapabilityGatedPlanDefaults } from "@/lib/billing/plan-capability-settings";
import { isPlanCapabilityAllowed, getUpgradePublicPlanForCapability } from "@/lib/billing/plan-capability-allow";
import {
  getDefaultPlanLimits,
  getPublicPlanLabelFromTier,
  getTrialDurationDays,
  PLAN_CAPABILITY_KEYS,
  PUBLIC_PLAN_KEYS,
  PUBLIC_DISPLAY_TITLE_BY_TIER,
  formatStoredSubscriptionPlanLabel,
  getRestrictedCapabilities,
  getInternalAdminCapabilities,
  shouldBypassPlanLimits,
  TRIAL_DURATION_DAYS,
} from "@/lib/billing/plan-catalog";
import { computeRemainingQuota } from "@/lib/billing/quota-math";
import { PlanAccessError } from "@/lib/billing/plan-access-errors";
import { PUBLIC_MONTHLY_PRICE_KC } from "@/lib/billing/public-pricing";
import { planLabelCs } from "@/lib/stripe/price-catalog";
import type { PlanTier } from "@/lib/stripe/billing-types";
import {
  PAID_SUBSCRIPTION_MANAGEMENT,
  PAID_SUBSCRIPTION_PRO,
  PAID_SUBSCRIPTION_START,
  SUBSCRIPTION_INACTIVE,
  trialWorkspaceExpired,
  trialWorkspaceNew,
} from "@/lib/billing/__tests__/fixtures/pricing-plan-fixtures";

function gated(ctx: ReturnType<typeof computeEffectiveAccessContext>) {
  return computeCapabilityGatedPlanDefaults(ctx);
}

describe("Fáze 7 — veřejné labely a pricing konstanty", () => {
  it("PUBLIC_PLAN_KEYS obsahuje jen Start / Pro / Management", () => {
    expect([...PUBLIC_PLAN_KEYS].sort()).toEqual(["management", "pro", "start"]);
  });

  it("veřejné názvy tierů neobsahují produktový název Team", () => {
    const labels = Object.values(PUBLIC_DISPLAY_TITLE_BY_TIER);
    expect(labels).toContain("Start");
    expect(labels).toContain("Pro");
    expect(labels).toContain("Management");
    expect(labels.some((l) => /^team$/i.test(l.trim()))).toBe(false);
  });

  it("interní tier team mapuje na label Management", () => {
    expect(getPublicPlanLabelFromTier("team")).toBe("Management");
  });

  it("formatStoredSubscriptionPlanLabel nahrazuje Team → Management", () => {
    expect(formatStoredSubscriptionPlanLabel("Team (měsíčně)")).toContain("Management");
    expect(formatStoredSubscriptionPlanLabel("Team (měsíčně)")).not.toMatch(/\bTeam\b/);
  });

  it("PUBLIC_MONTHLY_PRICE_KC má tři interní tiery", () => {
    expect(PUBLIC_MONTHLY_PRICE_KC.starter).toBe(990);
    expect(PUBLIC_MONTHLY_PRICE_KC.pro).toBe(1990);
    expect(PUBLIC_MONTHLY_PRICE_KC.team).toBe(3490);
  });

  it("checkout metadata planLabelCs používá veřejné labely (Start/Pro/Management)", () => {
    const tiers: PlanTier[] = ["starter", "pro", "team"];
    for (const t of tiers) {
      expect(planLabelCs(t, "month")).toContain(getPublicPlanLabelFromTier(t));
    }
  });
});

describe("Fáze 7 — trial a délka", () => {
  it("TRIAL_DURATION_DAYS a getTrialDurationDays = 14", () => {
    expect(TRIAL_DURATION_DAYS).toBe(14);
    expect(getTrialDurationDays()).toBe(14);
  });
});

describe("Fáze 7 — effective access context (pure)", () => {
  const now = new Date();

  it("paid Start: subscription, žádný bypass", () => {
    const ctx = computeEffectiveAccessContext({
      now,
      isInternalAdmin: false,
      subscriptionState: PAID_SUBSCRIPTION_START,
      tenantTrial: null,
    });
    expect(ctx.source).toBe("subscription");
    expect(ctx.isBypassed).toBe(false);
    expect(ctx.isRestricted).toBe(false);
    expect(ctx.publicPlanKey).toBe("start");
  });

  it("paid Pro: ai_review v capabilities", () => {
    const ctx = computeEffectiveAccessContext({
      now,
      isInternalAdmin: false,
      subscriptionState: PAID_SUBSCRIPTION_PRO,
      tenantTrial: null,
    });
    expect(ctx.capabilities.ai_review).toBe(true);
    expect(ctx.capabilities.client_portal_messaging).toBe(true);
  });

  it("paid Management: team overview a reports", () => {
    const ctx = computeEffectiveAccessContext({
      now,
      isInternalAdmin: false,
      subscriptionState: PAID_SUBSCRIPTION_MANAGEMENT,
      tenantTrial: null,
    });
    expect(ctx.capabilities.team_overview).toBe(true);
    expect(ctx.capabilities.team_production).toBe(true);
    expect(ctx.capabilities.reports_advanced).toBe(true);
  });

  it("active workspace trial: source trial, stejné capabilities jako Pro (gated)", () => {
    const ctx = computeEffectiveAccessContext({
      now,
      isInternalAdmin: false,
      subscriptionState: SUBSCRIPTION_INACTIVE,
      tenantTrial: trialWorkspaceNew(),
    });
    expect(ctx.source).toBe("trial");
    expect(ctx.isTrial).toBe(true);
    const s = gated(ctx);
    expect(isPlanCapabilityAllowed("ai_review", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("google_calendar", ctx, s)).toBe(true);
  });

  it("internal admin: bypass limitů a všechny capabilities zapnuté", () => {
    const ctx = computeEffectiveAccessContext({
      now,
      isInternalAdmin: true,
      subscriptionState: SUBSCRIPTION_INACTIVE,
      tenantTrial: null,
    });
    expect(ctx.source).toBe("internal_admin");
    expect(ctx.isBypassed).toBe(true);
    expect(shouldBypassPlanLimits(ctx.limits)).toBe(true);
    const caps = getInternalAdminCapabilities();
    for (const k of PLAN_CAPABILITY_KEYS) {
      expect(caps[k]).toBe(true);
    }
  });

  it("restricted po vypršení trialu: konzervativní capabilities", () => {
    const ctx = computeEffectiveAccessContext({
      now,
      isInternalAdmin: false,
      subscriptionState: SUBSCRIPTION_INACTIVE,
      tenantTrial: trialWorkspaceExpired(),
    });
    expect(ctx.source).toBe("restricted");
    expect(ctx.isRestricted).toBe(true);
    expect(getRestrictedCapabilities()).toEqual(ctx.capabilities);
  });
});

describe("Fáze 7 — capability matrix vs Start (konkrétní scénáře)", () => {
  const now = new Date();

  it("Start nemá AI review PDF; má Google Calendar", () => {
    const ctx = computeEffectiveAccessContext({
      now,
      isInternalAdmin: false,
      subscriptionState: PAID_SUBSCRIPTION_START,
      tenantTrial: null,
    });
    const s = gated(ctx);
    expect(isPlanCapabilityAllowed("ai_review", ctx, s)).toBe(false);
    expect(isPlanCapabilityAllowed("client_portal_messaging", ctx, s)).toBe(false);
    expect(isPlanCapabilityAllowed("client_portal_service_requests", ctx, s)).toBe(false);
    expect(isPlanCapabilityAllowed("google_calendar", ctx, s)).toBe(true);
  });

  it("Pro má plný klientský portál a AI review", () => {
    const ctx = computeEffectiveAccessContext({
      now,
      isInternalAdmin: false,
      subscriptionState: PAID_SUBSCRIPTION_PRO,
      tenantTrial: null,
    });
    const s = gated(ctx);
    expect(isPlanCapabilityAllowed("client_portal_messaging", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("client_portal_service_requests", ctx, s)).toBe(true);
    expect(isPlanCapabilityAllowed("ai_review", ctx, s)).toBe(true);
  });
});

describe("Fáze 7 — upgrade návrhy (CTA)", () => {
  it("getUpgradePublicPlanForCapability: team funkce → management", () => {
    expect(getUpgradePublicPlanForCapability("team_overview")).toBe("management");
    expect(getUpgradePublicPlanForCapability("ai_review")).toBe("pro");
  });

  it("PlanAccessError nese strukturovaný detail pro UI", () => {
    const err = new PlanAccessError({
      capability: "ai_review",
      blockedBy: "plan_tier",
      source: "subscription",
      publicPlanKey: "start",
      upgradeTargetSuggestion: "pro",
      upgradeTargetLabel: "Pro",
      currentPlanLabel: "Start",
    });
    expect(err.detail.upgradeTargetSuggestion).toBe("pro");
    expect(PlanAccessError.is(err)).toBe(true);
  });
});

describe("Fáze 7 — quota foundations", () => {
  it("Start má aiReviewPages limit 0; Pro má kladný limit", () => {
    const ls = getDefaultPlanLimits("start");
    const lp = getDefaultPlanLimits("pro");
    expect(ls.aiReviewPagesPerMonth).toBe(0);
    expect(lp.aiReviewPagesPerMonth).toBeGreaterThan(0);
  });

  it("internal admin bypass v computeRemainingQuota", () => {
    const r = computeRemainingQuota({
      limits: { bypass: true },
      used: {
        assistantActionsUsed: 999999,
        imageIntakesUsed: 999999,
        aiReviewPagesUsed: 999999,
        inputTokensUsed: 999999,
        outputTokensUsed: 999999,
      },
    });
    expect(r).toEqual({ bypassed: true });
  });
});
