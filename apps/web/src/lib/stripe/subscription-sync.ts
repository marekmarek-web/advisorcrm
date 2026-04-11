import "server-only";
import type Stripe from "stripe";
import { db, subscriptions, invoices, tenants, eq } from "db";

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

export async function resolveTenantIdByCustomer(
  customerId: string,
): Promise<string | null> {
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
  const metaLabel = sub.metadata?.plan_label?.trim();
  const planFromMeta =
    metaLabel ||
    (sub.metadata?.plan_tier && sub.metadata?.plan_interval
      ? `${sub.metadata.plan_tier} (${sub.metadata.plan_interval})`
      : null);

  const item = sub.items.data[0];
  const price = item?.price;
  const planFromPrice =
    price && typeof price !== "string"
      ? (price.nickname || price.id)
      : typeof price === "string"
        ? price
        : "unknown";

  const plan = planFromMeta || planFromPrice;

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
      cancelAtPeriodEnd: sub.cancel_at_period_end ? "true" : "false",
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        plan,
        status: sub.status,
        currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end ? "true" : "false",
        updatedAt: new Date(),
      },
    });
}

export async function upsertInvoiceFromStripe(
  tenantId: string,
  inv: Stripe.Invoice,
): Promise<void> {
  const amount = typeof inv.amount_due === "number" ? (inv.amount_due / 100).toFixed(2) : null;
  const paidAt = inv.status === "paid" && inv.status_transitions?.paid_at
    ? new Date(inv.status_transitions.paid_at * 1000)
    : null;
  const periodStart = inv.period_start ? new Date(inv.period_start * 1000) : null;
  const periodEnd = inv.period_end ? new Date(inv.period_end * 1000) : null;

  await db
    .insert(invoices)
    .values({
      tenantId,
      stripeInvoiceId: inv.id,
      amount,
      currency: inv.currency ?? "czk",
      status: inv.status ?? "draft",
      invoiceUrl: inv.hosted_invoice_url ?? null,
      paidAt,
      periodStart,
      periodEnd,
    })
    .onConflictDoUpdate({
      target: invoices.stripeInvoiceId,
      set: {
        amount,
        status: inv.status ?? "draft",
        invoiceUrl: inv.hosted_invoice_url ?? null,
        paidAt,
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

/** Marks workspace trial as consumed when a Stripe subscription exists (Phase 2: idempotent job). */
export async function markTenantTrialConverted(tenantId: string): Promise<void> {
  await db
    .update(tenants)
    .set({ trialConvertedAt: new Date(), updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
}
