import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, eq, stripeWebhookEvents } from "db";
import { getStripe } from "@/lib/stripe/server";
import {
  resolveTenantIdForSubscription,
  resolveTenantIdByCustomer,
  setTenantStripeCustomer,
  upsertSubscriptionFromStripe,
  upsertInvoiceFromStripe,
  markTenantTrialConverted,
} from "@/lib/stripe/subscription-sync";

export const dynamic = "force-dynamic";

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
      return;
    }
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
      await markTenantTrialConverted(tenantId);
      return;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
    case "invoice.finalized": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
      if (!customerId) return;
      const tenantId = await resolveTenantIdByCustomer(customerId);
      if (!tenantId) return;
      await upsertInvoiceFromStripe(tenantId, inv);
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

  const inserted = await db
    .insert(stripeWebhookEvents)
    .values({ id: event.id })
    .onConflictDoNothing()
    .returning({ id: stripeWebhookEvents.id });

  if (inserted.length === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    await db.delete(stripeWebhookEvents).where(eq(stripeWebhookEvents.id, event.id));
    console.error("[stripe webhook]", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
