import "server-only";

import { db, tenants, subscriptions, eq, desc } from "db";
import type { WorkspaceBillingSnapshot } from "./billing-types";
import { isStripeCheckoutAvailable, isStripePortalAvailable } from "./server";

export type { WorkspaceBillingSnapshot } from "./billing-types";

export async function getWorkspaceBillingSnapshot(params: {
  tenantId: string;
  roleName: string;
}): Promise<WorkspaceBillingSnapshot | undefined> {
  const { tenantId, roleName } = params;

  const [tenantStripeRow] = await db
    .select({ stripeCustomerId: tenants.stripeCustomerId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const [latestSubRow] = await db
    .select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      plan: subscriptions.plan,
    })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);

  const stripeSecretOk = isStripePortalAvailable();
  const checkoutOk = isStripeCheckoutAvailable();
  const hasBillingContext =
    stripeSecretOk ||
    Boolean(tenantStripeRow?.stripeCustomerId) ||
    Boolean(latestSubRow);

  if (!hasBillingContext) return undefined;

  return {
    checkoutAvailable: checkoutOk,
    portalAvailable: stripeSecretOk && Boolean(tenantStripeRow?.stripeCustomerId),
    stripeCustomerId: tenantStripeRow?.stripeCustomerId ?? null,
    subscriptionStatus: latestSubRow?.status ?? null,
    currentPeriodEnd: latestSubRow?.currentPeriodEnd?.toISOString() ?? null,
    plan: latestSubRow?.plan ?? null,
    canManage: roleName === "Admin" || roleName === "Director",
  };
}
