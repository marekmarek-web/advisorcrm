import "server-only";

import { getPublicPlanLabelFromTier } from "@/lib/billing/plan-catalog";
import type { CheckoutCatalogSnapshot, PlanInterval, PlanTier } from "./billing-types";

const TIERS: PlanTier[] = ["starter", "pro", "team"];
const INTERVALS: PlanInterval[] = ["month", "year"];

const ENV_KEYS: Record<PlanTier, Record<PlanInterval, string>> = {
  starter: {
    month: "STRIPE_PRICE_STARTER_MONTHLY",
    year: "STRIPE_PRICE_STARTER_YEARLY",
  },
  pro: {
    month: "STRIPE_PRICE_PRO_MONTHLY",
    year: "STRIPE_PRICE_PRO_YEARLY",
  },
  team: {
    month: "STRIPE_PRICE_TEAM_MONTHLY",
    year: "STRIPE_PRICE_TEAM_YEARLY",
  },
};

export function getLegacyStripePriceId(): string | null {
  const v = process.env.STRIPE_PRICE_ID?.trim();
  return v || null;
}

export function getPriceIdForTierInterval(
  tier: PlanTier,
  interval: PlanInterval
): string | null {
  const key = ENV_KEYS[tier][interval];
  const v = process.env[key]?.trim();
  return v || null;
}

export function hasAnyMultiTierPrice(): boolean {
  for (const t of TIERS) {
    for (const i of INTERVALS) {
      if (getPriceIdForTierInterval(t, i)) return true;
    }
  }
  return false;
}

/** Checkout je možný, pokud je secret a je buď legacy price, nebo aspoň jedna multi cena. */
export function isCheckoutEnvironmentReady(): boolean {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return false;
  if (getLegacyStripePriceId()) return true;
  return hasAnyMultiTierPrice();
}

export function getTrialPeriodDays(): number {
  const raw = process.env.STRIPE_TRIAL_PERIOD_DAYS?.trim();
  if (!raw) return 14;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 14;
}

export function getCheckoutCatalogSnapshot(): CheckoutCatalogSnapshot {
  const legacySingle = Boolean(getLegacyStripePriceId());
  const tiers = TIERS.map((tier) => ({
    tier,
    month: Boolean(getPriceIdForTierInterval(tier, "month")),
    year: Boolean(getPriceIdForTierInterval(tier, "year")),
  }));
  return {
    legacySingle,
    useTierPicker: hasAnyMultiTierPrice(),
    tiers,
    trialPeriodDays: getTrialPeriodDays(),
  };
}

export function parsePlanTier(raw: unknown): PlanTier | null {
  if (raw === "starter" || raw === "pro" || raw === "team") return raw;
  return null;
}

export function parsePlanInterval(raw: unknown): PlanInterval | null {
  if (raw === "month" || raw === "year") return raw;
  return null;
}

export function planLabelCs(tier: PlanTier, interval: PlanInterval): string {
  const intl: Record<PlanInterval, string> = {
    month: "měsíčně",
    year: "ročně",
  };
  return `${getPublicPlanLabelFromTier(tier)} (${intl[interval]})`;
}
