import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { getBillingReturnUrls, parseBillingContext } from "@/lib/stripe/billing-return-paths";
import { getStripe, isStripePortalAvailable } from "@/lib/stripe/server";
import { db, tenants, eq } from "db";

export const dynamic = "force-dynamic";

function canManageWorkspaceBilling(roleName: string) {
  return roleName === "Admin" || roleName === "Director";
}

export async function POST(request: Request) {
  if (!isStripePortalAvailable()) {
    return NextResponse.json(
      { error: "Stripe není nakonfigurováno (STRIPE_SECRET_KEY)." },
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

  const [tenantRow] = await db
    .select({ stripeCustomerId: tenants.stripeCustomerId })
    .from(tenants)
    .where(eq(tenants.id, m.tenantId))
    .limit(1);
  const customerId = tenantRow?.stripeCustomerId?.trim();
  if (!customerId) {
    return NextResponse.json(
      { error: "Workspace nemá propojeného zákazníka ve Stripe. Nejprve dokončete předplatné přes checkout." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const billingContext = parseBillingContext(
    (body as { billingContext?: unknown }).billingContext
  );
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { portalReturnUrl } = getBillingReturnUrls(appBase, billingContext);
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: portalReturnUrl,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Chybí URL billing portálu." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
