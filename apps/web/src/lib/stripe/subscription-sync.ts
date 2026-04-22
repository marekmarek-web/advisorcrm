import "server-only";
import type Stripe from "stripe";
import { subscriptions, invoices, tenants, eq, desc } from "db";
import { dbService, withServiceTenantContext } from "@/lib/db/service-db";

/**
 * Jak dlouho po překročení Stripe smart-retries dát uživateli ještě přístup
 * (application-side grace period), než workspace přepneme do restricted stavu.
 */
const DUNNING_GRACE_PERIOD_DAYS = 7;
/** Počet neúspěšných pokusů, po kterém začne aplikační grace period. */
const DUNNING_GRACE_TRIGGER_ATTEMPTS = 3;

export async function resolveTenantIdForSubscription(
  sub: Stripe.Subscription
): Promise<string | null> {
  const fromMeta = sub.metadata?.tenant_id?.trim();
  if (fromMeta) return fromMeta;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  if (!customerId) return null;

  const [row] = await dbService
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.stripeCustomerId, customerId))
    .limit(1);
  return row?.id ?? null;
}

export async function resolveTenantIdByCustomer(
  customerId: string,
): Promise<string | null> {
  const [row] = await dbService
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

  const promoCode = sub.metadata?.promo_code?.trim() || null;

  await withServiceTenantContext({ tenantId }, async (tx) => {
    await tx
      .insert(subscriptions)
      .values({
        tenantId,
        stripeSubscriptionId: sub.id,
        plan,
        status: sub.status,
        currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end ? "true" : "false",
        promoCode,
      })
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: {
          plan,
          status: sub.status,
          currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end ? "true" : "false",
          // promoCode sem vědomě nedáváme — nechceme přepsat hodnotu, která přišla z checkout/audit flow.
          updatedAt: new Date(),
        },
      });
  });
}

export type FailedInvoiceDunningOutcome = {
  failedPaymentAttempts: number;
  gracePeriodEndsAt: Date | null;
  /** True jen při events, které grace period právě spustily (= překročili jsme trigger). */
  graceStarted: boolean;
};

/**
 * Reakce na `invoice.payment_failed`: zvýší čítač selhaných pokusů, uloží
 * datum posledního selhání a po `DUNNING_GRACE_TRIGGER_ATTEMPTS` nastaví
 * aplikační grace period. Když grace period už běží, neposune ji.
 */
export async function applyFailedInvoiceToSubscription(
  tenantId: string,
): Promise<FailedInvoiceDunningOutcome> {
  return await withServiceTenantContext({ tenantId }, async (tx) => {
    const [row] = await tx
      .select({
        id: subscriptions.id,
        failedPaymentAttempts: subscriptions.failedPaymentAttempts,
        gracePeriodEndsAt: subscriptions.gracePeriodEndsAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);

    if (!row) {
      return { failedPaymentAttempts: 0, gracePeriodEndsAt: null, graceStarted: false };
    }

    const nextAttempts = (row.failedPaymentAttempts ?? 0) + 1;
    const now = new Date();
    let gracePeriodEndsAt = row.gracePeriodEndsAt;
    let graceStarted = false;

    if (
      nextAttempts >= DUNNING_GRACE_TRIGGER_ATTEMPTS &&
      !gracePeriodEndsAt
    ) {
      gracePeriodEndsAt = new Date(
        now.getTime() + DUNNING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
      );
      graceStarted = true;
    }

    await tx
      .update(subscriptions)
      .set({
        failedPaymentAttempts: nextAttempts,
        lastPaymentFailedAt: now,
        gracePeriodEndsAt,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, row.id));

    return {
      failedPaymentAttempts: nextAttempts,
      gracePeriodEndsAt,
      graceStarted,
    };
  });
}

export type SucceededInvoiceRecoveryOutcome = {
  recoveredFromDunning: boolean;
  previous: {
    failedPaymentAttempts: number;
    gracePeriodEndsAt: string | null;
    restrictedAt: string | null;
  } | null;
};

/**
 * Reakce na `invoice.payment_succeeded`: resetuje dunning čítače. Pokud
 * workspace byl v grace period nebo restricted, vrátí `recoveredFromDunning=true`
 * aby webhook zalogoval `dunning.recovered`.
 */
export async function applySucceededInvoiceToSubscription(
  tenantId: string,
): Promise<SucceededInvoiceRecoveryOutcome> {
  return await withServiceTenantContext({ tenantId }, async (tx) => {
    const [row] = await tx
      .select({
        id: subscriptions.id,
        failedPaymentAttempts: subscriptions.failedPaymentAttempts,
        gracePeriodEndsAt: subscriptions.gracePeriodEndsAt,
        restrictedAt: subscriptions.restrictedAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);

    if (!row) {
      return { recoveredFromDunning: false, previous: null };
    }

    const wasInDunning =
      (row.failedPaymentAttempts ?? 0) > 0 ||
      row.gracePeriodEndsAt !== null ||
      row.restrictedAt !== null;

    if (!wasInDunning) {
      return { recoveredFromDunning: false, previous: null };
    }

    const now = new Date();
    await tx
      .update(subscriptions)
      .set({
        failedPaymentAttempts: 0,
        gracePeriodEndsAt: null,
        restrictedAt: null,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, row.id));

    return {
      recoveredFromDunning: true,
      previous: {
        failedPaymentAttempts: row.failedPaymentAttempts ?? 0,
        gracePeriodEndsAt: row.gracePeriodEndsAt?.toISOString() ?? null,
        restrictedAt: row.restrictedAt?.toISOString() ?? null,
      },
    };
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

  await withServiceTenantContext({ tenantId }, async (tx) => {
    await tx
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
  });
}

export async function setTenantStripeCustomer(
  tenantId: string,
  customerId: string
): Promise<void> {
  await withServiceTenantContext({ tenantId }, async (tx) => {
    await tx
      .update(tenants)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
  });
}

/** Marks workspace trial as consumed when a Stripe subscription exists (Phase 2: idempotent job). */
export async function markTenantTrialConverted(tenantId: string): Promise<void> {
  await withServiceTenantContext({ tenantId }, async (tx) => {
    await tx
      .update(tenants)
      .set({ trialConvertedAt: new Date(), updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
  });
}
