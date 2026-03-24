import "server-only";
import type Stripe from "stripe";
import { db, subscriptions, tenants, eq } from "db";

export async function resolveTenantIdForSubscription(
  sub: Stripe.Subscription
): Promise<string | null> {
  const fromMeta = sub.metadata?.tenant_id?.trim();
  if (fromMeta) return fromMeta;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  if (!customerId) return null;

  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.stripeCustomerId, customerId))
    .limit(1);
  return row?.id ?? null;
}

export async function upsertSubscriptionFromStripe(
  tenantId: string,
  sub: Stripe.Subscription
): Promise<void> {
  const item = sub.items.data[0];
  const price = item?.price;
  const plan =
    price && typeof price !== "string"
      ? (price.nickname || price.id)
      : typeof price === "string"
        ? price
        : "unknown";

  const endSec = item?.current_period_end;
  const currentPeriodEnd =
    typeof endSec === "number" ? new Date(endSec * 1000) : null;

  await db
    .insert(subscriptions)
    .values({
      tenantId,
      stripeSubscriptionId: sub.id,
      plan,
      status: sub.status,
      currentPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        plan,
        status: sub.status,
        currentPeriodEnd,
        updatedAt: new Date(),
      },
    });
}

export async function setTenantStripeCustomer(
  tenantId: string,
  customerId: string
): Promise<void> {
  await db
    .update(tenants)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
}
