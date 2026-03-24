import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { getBillingReturnUrls, parseBillingContext } from "@/lib/stripe/billing-return-paths";
import { getStripe, isStripeCheckoutAvailable } from "@/lib/stripe/server";
import { db, tenants, eq } from "db";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

function canManageWorkspaceBilling(roleName: string) {
  return roleName === "Admin" || roleName === "Director";
}

export async function POST(request: Request) {
  if (!isStripeCheckoutAvailable()) {
    return NextResponse.json(
      { error: "Stripe předplatné není nakonfigurováno (STRIPE_SECRET_KEY / STRIPE_PRICE_ID)." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const m = await getMembership(user.id);
  if (!m) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspaceBilling(m.roleName)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const priceId = process.env.STRIPE_PRICE_ID!.trim();
  const [tenantRow] = await db
    .select({ stripeCustomerId: tenants.stripeCustomerId })
    .from(tenants)
    .where(eq(tenants.id, m.tenantId))
    .limit(1);
  const stripeCustomerId = tenantRow?.stripeCustomerId ?? null;

  const body = await request.json().catch(() => ({}));
  const billingContext = parseBillingContext(
    (body as { billingContext?: unknown }).billingContext
  );
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { successUrl, cancelUrl } = getBillingReturnUrls(appBase, billingContext);
  const stripe = getStripe();

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: m.tenantId,
    metadata: { tenant_id: m.tenantId },
    subscription_data: { metadata: { tenant_id: m.tenantId } },
  };

  if (stripeCustomerId) {
    params.customer = stripeCustomerId;
  } else {
    if (user.email) params.customer_email = user.email;
    params.customer_creation = "always";
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) {
    return NextResponse.json({ error: "Chybí URL checkout relace." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
