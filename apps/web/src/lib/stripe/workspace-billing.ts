import "server-only";

import { unstable_cache } from "next/cache";
import { db, tenants, subscriptions, eq, desc } from "db";
import type { WorkspaceBillingSnapshot } from "./billing-types";
import { getCheckoutCatalogSnapshot } from "./price-catalog";
import { isStripeCheckoutAvailable, isStripePortalAvailable } from "./server";
import {
  getDaysRemainingInTrial,
  isTrialActive,
} from "@/lib/billing/plan-catalog";

export type { WorkspaceBillingSnapshot } from "./billing-types";

async function fetchBillingRows(tenantId: string, knownStripeCustomerId?: string | null) {
  const [tenantStripeRow, latestSubRow] = await Promise.all([
    db
      .select({
        stripeCustomerId: tenants.stripeCustomerId,
        trialStartedAt: tenants.trialStartedAt,
        trialEndsAt: tenants.trialEndsAt,
        trialPlanKey: tenants.trialPlanKey,
        trialConvertedAt: tenants.trialConvertedAt,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
      .then((r) => {
        const row = r[0];
        if (!row) return null;
        return {
          ...row,
          stripeCustomerId:
            knownStripeCustomerId !== undefined ? knownStripeCustomerId : row.stripeCustomerId,
        };
      }),
    db
      .select({
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        plan: subscriptions.plan,
      })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1)
      .then((r) => r[0]),
  ]);
  return { tenantStripeRow, latestSubRow };
}

export async function getWorkspaceBillingSnapshot(params: {
  tenantId: string;
  roleName: string;
  /** Optional: pass pre-fetched value to skip one DB round-trip. */
  stripeCustomerId?: string | null;
}): Promise<WorkspaceBillingSnapshot | undefined> {
  const { tenantId, roleName, stripeCustomerId } = params;

  const cachedFetch = unstable_cache(
    () => fetchBillingRows(tenantId, stripeCustomerId),
    [`billing-rows-${tenantId}`],
    { revalidate: 300, tags: [`billing-${tenantId}`] }
  );

  const { tenantStripeRow, latestSubRow } = await cachedFetch();

  const stripeSecretOk = isStripePortalAvailable();
  const checkoutOk = isStripeCheckoutAvailable();
  const hasBillingContext =
    stripeSecretOk ||
    Boolean(tenantStripeRow?.stripeCustomerId) ||
    Boolean(latestSubRow) ||
    Boolean(tenantStripeRow?.trialEndsAt);

  if (!hasBillingContext) return undefined;

  const now = new Date();
  const trialActive =
    Boolean(tenantStripeRow?.trialEndsAt) &&
    isTrialActive({
      trialEndsAt: tenantStripeRow?.trialEndsAt ?? null,
      trialConvertedAt: tenantStripeRow?.trialConvertedAt ?? null,
      now,
    });

  const workspaceTrial =
    tenantStripeRow?.trialEndsAt || tenantStripeRow?.trialStartedAt
      ? {
          isActive: trialActive,
          trialStartedAt: tenantStripeRow.trialStartedAt?.toISOString() ?? null,
          trialEndsAt: tenantStripeRow.trialEndsAt?.toISOString() ?? null,
          trialPlanKey: tenantStripeRow.trialPlanKey ?? null,
          daysRemaining: getDaysRemainingInTrial(tenantStripeRow.trialEndsAt, now),
        }
      : null;

  return {
    checkoutAvailable: checkoutOk,
    portalAvailable: stripeSecretOk && Boolean(tenantStripeRow?.stripeCustomerId),
    stripeCustomerId: tenantStripeRow?.stripeCustomerId ?? null,
    subscriptionStatus: latestSubRow?.status ?? null,
    currentPeriodEnd: latestSubRow?.currentPeriodEnd?.toISOString() ?? null,
    plan: latestSubRow?.plan ?? null,
    canManage: roleName === "Admin" || roleName === "Director",
    checkoutCatalog: getCheckoutCatalogSnapshot(),
    workspaceTrial,
  };
}

/** Call after a Stripe webhook changes the subscription to bust the cache. */
export { revalidateTag } from "next/cache";
export function getBillingCacheTag(tenantId: string) {
  return `billing-${tenantId}`;
}
