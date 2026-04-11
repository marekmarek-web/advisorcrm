/**
 * Test fixtures pro pricing / plány / trial — čisté objekty bez DB.
 * Použití: regresní testy Fáze 7 a budoucí integrační scénáře.
 */

import type { SubscriptionState } from "@/lib/stripe/billing-types";

export const SUBSCRIPTION_INACTIVE: SubscriptionState = {
  status: null,
  plan: null,
  currentPeriodEnd: null,
  isActive: false,
  inGracePeriod: false,
};

/** Aktivní placený Start (Stripe/DB plan string typicky odpovídá start / starter). */
export const PAID_SUBSCRIPTION_START: SubscriptionState = {
  status: "active",
  plan: "start",
  currentPeriodEnd: new Date(Date.now() + 86_400_000 * 30),
  isActive: true,
  inGracePeriod: false,
};

export const PAID_SUBSCRIPTION_PRO: SubscriptionState = {
  status: "active",
  plan: "pro",
  currentPeriodEnd: new Date(Date.now() + 86_400_000 * 30),
  isActive: true,
  inGracePeriod: false,
};

/** Interní tier `team` = veřejně Management. */
export const PAID_SUBSCRIPTION_MANAGEMENT: SubscriptionState = {
  status: "active",
  plan: "management",
  currentPeriodEnd: new Date(Date.now() + 86_400_000 * 30),
  isActive: true,
  inGracePeriod: false,
};

const future = () => new Date(Date.now() + 14 * 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);

/** Nový workspace trial — 14 dní Pro (viz ensure-workspace). */
export function trialWorkspaceNew() {
  return {
    trialStartedAt: new Date(),
    trialEndsAt: future(),
    trialPlanKey: "pro" as const,
    trialConvertedAt: null as Date | null,
  };
}

/** Vypršený trial, bez předplatného → restricted. */
export function trialWorkspaceExpired() {
  return {
    trialStartedAt: past(),
    trialEndsAt: past(),
    trialPlanKey: "pro" as const,
    trialConvertedAt: null as Date | null,
  };
}

/** Po konverzi na placené předplatné (Stripe sync). */
export function trialWorkspaceConverted() {
  return {
    trialStartedAt: past(),
    trialEndsAt: past(),
    trialPlanKey: "pro" as const,
    trialConvertedAt: new Date(),
  };
}
