/**
 * Veřejné ceny a výpočty pro landing, CRM billing UI a checkout copy.
 * Skutečné Stripe částky řídí Price IDs v env — tato čísla musí s nimi být sladěná.
 */

import { TRIAL_DURATION_DAYS } from "@/lib/billing/plan-catalog";
import type { PlanTier } from "@/lib/stripe/billing-types";

/** Roční fakturace: sleva oproti součtu 12× měsíční ceny. */
export const ANNUAL_BILLING_DISCOUNT_PERCENT = 20 as const;

/** Workspace + marketing trial — jeden zdroj s {@link TRIAL_DURATION_DAYS}. */
export const PUBLIC_TRIAL_DURATION_DAYS = TRIAL_DURATION_DAYS;

/** Veřejné měsíční ceny (Kč) před slevou — mapování na interní tier. */
export const PUBLIC_MONTHLY_PRICE_KC: Readonly<Record<PlanTier, number>> = {
  starter: 990,
  pro: 1990,
  team: 3490,
};

export function effectiveMonthlyKcWhenBilledAnnually(monthlyListKc: number): number {
  return Math.round(monthlyListKc * (1 - ANNUAL_BILLING_DISCOUNT_PERCENT / 100));
}

/** Celková roční částka při roční fakturaci (−20 % oproti 12× měsíční). */
export function yearlyTotalKcFromMonthlyList(monthlyListKc: number): number {
  return Math.round(monthlyListKc * 12 * (1 - ANNUAL_BILLING_DISCOUNT_PERCENT / 100));
}

/** Úspora v Kč za rok oproti zaplacení 12× měsíční ceny bez slevy. */
export function annualSavingsVersusTwelveMonthly(monthlyListKc: number): number {
  return monthlyListKc * 12 - yearlyTotalKcFromMonthlyList(monthlyListKc);
}

export function formatPublicPriceKc(amount: number): string {
  return amount.toLocaleString("cs-CZ");
}
