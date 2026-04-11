/**
 * Effective access resolution (internal admin → subscription → workspace trial → restricted).
 * Pure functions — safe to import from tests without DB.
 */

import {
  type EffectiveAccessContext,
  type EffectiveLimits,
  type PlanCapabilities,
  type PlanLimits,
  type PublicPlanKey,
  type TrialInfo,
  getDefaultPlanCapabilities,
  getDefaultPlanLimits,
  getInternalAdminCapabilities,
  getInternalAdminLimits,
  getRestrictedCapabilities,
  getRestrictedLimits,
  getTrialPlanDefinition,
  getPlanDefinitionByInternalTier,
  isTrialActive,
  getDaysRemainingInTrial,
  tryParseInternalTierFromStoredPlan,
} from "@/lib/billing/plan-catalog";
import type { PlanTier, SubscriptionState } from "@/lib/stripe/billing-types";

export type { EffectiveAccessContext } from "@/lib/billing/plan-catalog";

function subscriptionGrantsAccess(state: SubscriptionState): boolean {
  return state.isActive || state.inGracePeriod;
}

function buildTrialInfo(
  tenantTrial: {
    trialStartedAt: Date | null;
    trialEndsAt: Date | null;
    trialPlanKey: string | null;
    trialConvertedAt: Date | null;
  } | null,
  now: Date
): TrialInfo | null {
  if (!tenantTrial || (!tenantTrial.trialStartedAt && !tenantTrial.trialEndsAt && !tenantTrial.trialPlanKey)) {
    return null;
  }
  const ends = tenantTrial.trialEndsAt;
  const active = isTrialActive({
    trialEndsAt: ends,
    trialConvertedAt: tenantTrial.trialConvertedAt,
    now,
  });
  return {
    trialStartedAt: tenantTrial.trialStartedAt,
    trialEndsAt: ends,
    trialPlanKey: tenantTrial.trialPlanKey,
    daysRemaining: getDaysRemainingInTrial(ends, now),
    isActive: active,
  };
}

function wrapPlanLimits(limits: PlanLimits): EffectiveLimits {
  return { bypass: false, limits };
}

/**
 * Pure effective access resolution for tests and callers that already fetched DB rows.
 */
export function computeEffectiveAccessContext(input: {
  now: Date;
  isInternalAdmin: boolean;
  subscriptionState: SubscriptionState;
  tenantTrial: {
    trialStartedAt: Date | null;
    trialEndsAt: Date | null;
    trialPlanKey: string | null;
    trialConvertedAt: Date | null;
  } | null;
}): EffectiveAccessContext {
  const { now, isInternalAdmin, subscriptionState, tenantTrial } = input;
  const trialInfo = buildTrialInfo(tenantTrial, now);

  if (isInternalAdmin) {
    return {
      source: "internal_admin",
      publicPlanKey: null,
      internalTier: null,
      capabilities: getInternalAdminCapabilities(),
      limits: getInternalAdminLimits(),
      trialInfo,
      isBypassed: true,
      isTrial: false,
      isRestricted: false,
    };
  }

  if (subscriptionGrantsAccess(subscriptionState)) {
    const parsed = tryParseInternalTierFromStoredPlan(subscriptionState.plan);
    const tier: PlanTier = parsed ?? "pro";
    const def = getPlanDefinitionByInternalTier(tier);
    return {
      source: "subscription",
      publicPlanKey: def.publicPlanKey,
      internalTier: tier,
      capabilities: def.capabilities,
      limits: wrapPlanLimits(def.limits),
      trialInfo,
      isBypassed: false,
      isTrial: false,
      isRestricted: false,
    };
  }

  if (
    tenantTrial &&
    isTrialActive({
      trialEndsAt: tenantTrial.trialEndsAt,
      trialConvertedAt: tenantTrial.trialConvertedAt,
      now,
    })
  ) {
    const def = getTrialPlanDefinition();
    return {
      source: "trial",
      publicPlanKey: def.publicPlanKey,
      internalTier: def.internalTier,
      capabilities: def.capabilities,
      limits: wrapPlanLimits(def.limits),
      trialInfo,
      isBypassed: false,
      isTrial: true,
      isRestricted: false,
    };
  }

  return {
    source: "restricted",
    publicPlanKey: null,
    internalTier: null,
    capabilities: getRestrictedCapabilities(),
    limits: getRestrictedLimits(),
    trialInfo,
    isBypassed: false,
    isTrial: false,
    isRestricted: true,
  };
}

/** Defaults for callers that only have subscription plan string (e.g. jobs). */
export function computeEffectiveCapabilitiesFromPlanString(plan: string | null): PlanCapabilities {
  const tier = tryParseInternalTierFromStoredPlan(plan);
  if (!tier) return getDefaultPlanCapabilities("start");
  return getDefaultPlanCapabilities(tier);
}

export function computeEffectiveLimitsFromPlanString(plan: string | null): PlanLimits {
  const tier = tryParseInternalTierFromStoredPlan(plan);
  if (!tier) return getDefaultPlanLimits("start");
  return getDefaultPlanLimits(tier);
}
