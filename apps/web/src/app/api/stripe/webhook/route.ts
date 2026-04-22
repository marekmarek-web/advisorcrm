import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq, stripeWebhookEvents, sql } from "db";
import { dbService } from "@/lib/db/service-db";
import { getStripe } from "@/lib/stripe/server";
import {
  resolveTenantIdForSubscription,
  resolveTenantIdByCustomer,
  setTenantStripeCustomer,
  upsertSubscriptionFromStripe,
  upsertInvoiceFromStripe,
  markTenantTrialConverted,
  applyFailedInvoiceToSubscription,
  applySucceededInvoiceToSubscription,
} from "@/lib/stripe/subscription-sync";
import {
  BILLING_AUDIT_ACTIONS,
  writeBillingAudit,
  type BillingAuditAction,
} from "@/lib/stripe/billing-audit";
import {
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
  sendInvoiceReceiptEmail,
  sendTrialEndingEmail,
} from "@/lib/stripe/billing-email-notifier";
import { recordTermsAcceptance } from "@/lib/legal/terms-acceptance";

export const dynamic = "force-dynamic";

function stripeObjectIdFromEvent(event: Stripe.Event): string | null {
  const obj = event.data?.object as { id?: unknown } | null;
  return obj && typeof obj.id === "string" ? obj.id : null;
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;

      const tenantId =
        session.metadata?.tenant_id?.trim() || session.client_reference_id?.trim() || null;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      if (!tenantId || !customerId || !subId) return;

      await setTenantStripeCustomer(tenantId, customerId);
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subId);
      await upsertSubscriptionFromStripe(tenantId, sub);
      await markTenantTrialConverted(tenantId);

      // Delta A10: při checkoutu uživatel akceptuje Terms + DPA (tlačítko
      // "Zaplatit a přijmout podmínky"). Evidujeme jako důkaz pro enterprise DD.
      const stripeUserId = session.metadata?.user_id?.trim() || null;
      if (stripeUserId) {
        await recordTermsAcceptance({
          userId: stripeUserId,
          tenantId,
          context: "checkout",
          documents: ["terms", "dpa", "privacy"],
        });
      }

      await writeBillingAudit({
        tenantId,
        action: BILLING_AUDIT_ACTIONS.CHECKOUT_COMPLETED,
        actorKind: "webhook",
        stripeEventId: event.id,
        stripeObjectId: session.id,
        metadata: {
          subscriptionId: sub.id,
          status: sub.status,
          promoCode: session.metadata?.promo_code ?? null,
        },
      });
      return;
    }
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = await resolveTenantIdForSubscription(sub);
      if (!tenantId) return;
      const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
      const daysLeft = trialEnd
        ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000))
        : 3;
      if (trialEnd) {
        await sendTrialEndingEmail({
          tenantId,
          daysLeft,
          trialEndsAt: trialEnd,
        });
      }
      await writeBillingAudit({
        tenantId,
        action: BILLING_AUDIT_ACTIONS.SUBSCRIPTION_UPDATED,
        actorKind: "webhook",
        stripeEventId: event.id,
        stripeObjectId: sub.id,
        metadata: {
          trialWillEnd: true,
          trialEnd: trialEnd?.toISOString() ?? null,
          daysLeft,
        },
      });
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = await resolveTenantIdForSubscription(sub);
      if (!tenantId) return;
      const cust =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
      if (cust) {
        await setTenantStripeCustomer(tenantId, cust);
      }
      await upsertSubscriptionFromStripe(tenantId, sub);
      if (event.type !== "customer.subscription.deleted") {
        await markTenantTrialConverted(tenantId);
      }

      if (event.type === "customer.subscription.deleted") {
        const effectiveUntilUnix = sub.items.data[0]?.current_period_end ?? null;
        await sendSubscriptionCanceledEmail({
          tenantId,
          effectiveUntil: effectiveUntilUnix ? new Date(effectiveUntilUnix * 1000) : null,
        });
      }

      const action: BillingAuditAction =
        event.type === "customer.subscription.created"
          ? BILLING_AUDIT_ACTIONS.SUBSCRIPTION_CREATED
          : event.type === "customer.subscription.deleted"
            ? BILLING_AUDIT_ACTIONS.SUBSCRIPTION_DELETED
            : BILLING_AUDIT_ACTIONS.SUBSCRIPTION_UPDATED;

      await writeBillingAudit({
        tenantId,
        action,
        actorKind: "webhook",
        stripeEventId: event.id,
        stripeObjectId: sub.id,
        toState: {
          status: sub.status,
          cancel_at_period_end: sub.cancel_at_period_end,
          current_period_end:
            sub.items.data[0]?.current_period_end ?? null,
        },
        metadata: {
          hasDiscount:
            Array.isArray(
              (sub as unknown as { discounts?: unknown[] }).discounts,
            ) &&
            ((sub as unknown as { discounts?: unknown[] }).discounts?.length ?? 0) > 0,
          promoCode: sub.metadata?.promo_code ?? null,
        },
      });
      return;
    }
    case "invoice.finalized": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
      if (!customerId) return;
      const tenantId = await resolveTenantIdByCustomer(customerId);
      if (!tenantId) return;
      await upsertInvoiceFromStripe(tenantId, inv);
      await writeBillingAudit({
        tenantId,
        action: BILLING_AUDIT_ACTIONS.INVOICE_FINALIZED,
        actorKind: "webhook",
        stripeEventId: event.id,
        stripeObjectId: inv.id ?? null,
        metadata: {
          amountDue: inv.amount_due,
          currency: inv.currency,
          hostedInvoiceUrl: inv.hosted_invoice_url,
        },
      });
      return;
    }
    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
      if (!customerId) return;
      const tenantId = await resolveTenantIdByCustomer(customerId);
      if (!tenantId) return;
      await upsertInvoiceFromStripe(tenantId, inv);

      if (inv.amount_paid > 0) {
        await sendInvoiceReceiptEmail({ tenantId, invoice: inv });
      }

      const recovery = await applySucceededInvoiceToSubscription(tenantId);
      if (recovery.recoveredFromDunning) {
        await writeBillingAudit({
          tenantId,
          action: BILLING_AUDIT_ACTIONS.DUNNING_RECOVERED,
          actorKind: "webhook",
          stripeEventId: event.id,
          stripeObjectId: inv.id ?? null,
          fromState: recovery.previous,
        });
      }

      await writeBillingAudit({
        tenantId,
        action: BILLING_AUDIT_ACTIONS.INVOICE_PAID,
        actorKind: "webhook",
        stripeEventId: event.id,
        stripeObjectId: inv.id ?? null,
        metadata: {
          amountPaid: inv.amount_paid,
          currency: inv.currency,
          hostedInvoiceUrl: inv.hosted_invoice_url,
        },
      });
      return;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
      if (!customerId) return;
      const tenantId = await resolveTenantIdByCustomer(customerId);
      if (!tenantId) return;
      await upsertInvoiceFromStripe(tenantId, inv);

      const dunning = await applyFailedInvoiceToSubscription(tenantId);

      await sendPaymentFailedEmail({
        tenantId,
        invoice: inv,
        gracePeriodEndsAt: dunning.gracePeriodEndsAt ?? null,
      });

      await writeBillingAudit({
        tenantId,
        action: BILLING_AUDIT_ACTIONS.INVOICE_PAYMENT_FAILED,
        actorKind: "webhook",
        stripeEventId: event.id,
        stripeObjectId: inv.id ?? null,
        toState: {
          failedPaymentAttempts: dunning.failedPaymentAttempts,
          gracePeriodEndsAt: dunning.gracePeriodEndsAt?.toISOString() ?? null,
        },
        metadata: {
          amountDue: inv.amount_due,
          currency: inv.currency,
          hostedInvoiceUrl: inv.hosted_invoice_url,
          nextPaymentAttempt: inv.next_payment_attempt,
        },
      });

      if (dunning.graceStarted) {
        await writeBillingAudit({
          tenantId,
          action: BILLING_AUDIT_ACTIONS.DUNNING_GRACE_PERIOD_STARTED,
          actorKind: "webhook",
          stripeEventId: event.id,
          stripeObjectId: inv.id ?? null,
          toState: {
            gracePeriodEndsAt: dunning.gracePeriodEndsAt?.toISOString() ?? null,
            failedPaymentAttempts: dunning.failedPaymentAttempts,
          },
        });
      }
      return;
    }
    default:
      return;
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // Idempotentní přihláška k eventu:
  //  - nový event: insert se statusem `processing`
  //  - duplicitní `completed`: nic nedělat, vrátit duplicate=true
  //  - dřívější `failed`/`processing`: znovu převzít (Stripe retry) a inkrementovat attempts
  const now = new Date();
  const claimed = await dbService
    .insert(stripeWebhookEvents)
    .values({
      id: event.id,
      status: "processing",
      attempts: 1,
      receivedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: stripeWebhookEvents.id,
      set: {
        status: "processing",
        attempts: sql`${stripeWebhookEvents.attempts} + 1`,
        updatedAt: now,
        lastError: null,
      },
      where: sql`${stripeWebhookEvents.status} <> 'completed'`,
    })
    .returning({
      id: stripeWebhookEvents.id,
      status: stripeWebhookEvents.status,
      attempts: stripeWebhookEvents.attempts,
    });

  if (claimed.length === 0) {
    // RETURNING prázdné → WHERE vyloučil řádek (status === 'completed')
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleStripeEvent(event);
    await dbService
      .update(stripeWebhookEvents)
      .set({ status: "completed", processedAt: new Date(), updatedAt: new Date(), lastError: null })
      .where(eq(stripeWebhookEvents.id, event.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await dbService
      .update(stripeWebhookEvents)
      .set({ status: "failed", updatedAt: new Date(), lastError: message.slice(0, 2000) })
      .where(eq(stripeWebhookEvents.id, event.id));
    console.error("[stripe webhook]", {
      eventId: event.id,
      type: event.type,
      objectId: stripeObjectIdFromEvent(event),
      err: message,
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
