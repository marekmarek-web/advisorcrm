import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { getBillingReturnUrls, parseBillingContext } from "@/lib/stripe/billing-return-paths";
import {
  getLegacyStripePriceId,
  getPriceIdForTierInterval,
  getTrialPeriodDays,
  hasAnyMultiTierPrice,
  parsePlanInterval,
  parsePlanTier,
  planLabelCs,
} from "@/lib/stripe/price-catalog";
import { getStripe, isStripeCheckoutAvailable } from "@/lib/stripe/server";
import { resolvePromotionCode, isKnownPromoCode } from "@/lib/stripe/promo-codes";
import {
  PREMIUM_BROKERS_PROMO_CODE,
  PROMO_CODE_COOKIE,
} from "@/lib/stripe/promo-codes-shared";
import {
  BILLING_AUDIT_ACTIONS,
  writeBillingAudit,
} from "@/lib/stripe/billing-audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getKillSwitch } from "@/lib/ops/kill-switch";
import { db, tenants, eq } from "db";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function canManageWorkspaceBilling(roleName: string) {
  return roleName === "Admin" || roleName === "Director";
}

export async function POST(request: Request) {
  // Delta A23 — remote kill-switch: umožní finance/ops vypnout nové checkouty
  // (např. když se pokazí price-catalog nebo probíhá billing incident).
  if (await getKillSwitch("STRIPE_CHECKOUT_DISABLED", false)) {
    return NextResponse.json(
      { error: "Předplatné je dočasně nedostupné. Zkuste to prosím za chvíli." },
      { status: 503 },
    );
  }
  if (!isStripeCheckoutAvailable()) {
    return NextResponse.json(
      {
        error:
          "Stripe předplatné není nakonfigurováno (STRIPE_SECRET_KEY a STRIPE_PRICE_ID nebo STRIPE_PRICE_*_*).",
      },
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

  // FL-1 rate limit — Stripe checkout je drahá operace i pro Stripe (vytváří
  // sessions, promo lookups). Limitujeme na tenant+user, aby se nedaly spamovat.
  const limiter = checkRateLimit(request, "stripe-checkout", `${m.tenantId}:${user.id}`, {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "Příliš mnoho pokusů. Zkuste to za chvíli znovu." },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    billingContext?: unknown;
    tier?: unknown;
    interval?: unknown;
    legalAcknowledged?: unknown;
    promoCode?: unknown;
    betaTermsAck?: unknown;
  };
  if (body.legalAcknowledged !== true) {
    return NextResponse.json(
      { error: "Před zahájením předplatného potvrďte souhlas s právními dokumenty." },
      { status: 400 }
    );
  }
  const betaTermsAck = body.betaTermsAck === true;
  const billingContext = parseBillingContext(body.billingContext);
  const tier = parsePlanTier(body.tier);
  const interval = parsePlanInterval(body.interval);
  const rawPromoCode =
    typeof body.promoCode === "string" ? body.promoCode.trim() : "";
  const bodyPromoCode = rawPromoCode ? rawPromoCode.toUpperCase() : "";

  // Fallback na cookie nastavenou z `/invite/[code]` — nechá PB partnery
  // dojít od pozvánky přes registraci až do checkoutu bez manuálního zadávání.
  const cookieStore = await cookies();
  const cookiePromoCodeRaw = cookieStore.get(PROMO_CODE_COOKIE)?.value ?? "";
  const cookiePromoCode = cookiePromoCodeRaw
    ? cookiePromoCodeRaw.trim().toUpperCase()
    : "";

  const normalizedPromoCode = bodyPromoCode || cookiePromoCode;
  const promoCodeSource: "body" | "cookie" | null = bodyPromoCode
    ? "body"
    : cookiePromoCode
      ? "cookie"
      : null;

  // FL-1.6 — Pilot (Premium Brokers) vyžaduje potvrzení Beta Terms. Checkujeme
  // tvrdě: pokud je PB kód v cestě (ať už z body nebo z cookie), klient musí
  // mít zaškrtnutý checkbox. Pro audit zapíšeme odmítnutí i úspěšné potvrzení.
  const isPilotPromo = normalizedPromoCode === PREMIUM_BROKERS_PROMO_CODE;
  if (isPilotPromo && !betaTermsAck) {
    await writeBillingAudit({
      tenantId: m.tenantId,
      action: BILLING_AUDIT_ACTIONS.PROMO_CODE_REJECTED,
      actorKind: "user",
      actorUserId: user.id,
      metadata: {
        code: normalizedPromoCode,
        reason: "beta_terms_not_acked",
        source: promoCodeSource,
      },
    });
    return NextResponse.json(
      {
        error:
          "Před zahájením pilotního předplatného potvrďte podmínky beta programu (checkbox Beta Terms).",
      },
      { status: 400 },
    );
  }

  const legacy = getLegacyStripePriceId();
  const multi = hasAnyMultiTierPrice();

  let priceId: string | null = null;
  let subscriptionMetadata: Record<string, string> = {
    tenant_id: m.tenantId,
    checkout_legal_ack: "1",
    ...(isPilotPromo && betaTermsAck ? { beta_terms_acked: "1" } : {}),
  };

  if (multi) {
    if (!tier || !interval) {
      return NextResponse.json(
        { error: "Vyberte tarif a fakturační období (měsíčně / ročně)." },
        { status: 400 }
      );
    }
    priceId = getPriceIdForTierInterval(tier, interval);
    if (!priceId) {
      return NextResponse.json(
        { error: "Tato kombinace tarifu není na serveru nastavená (chybí příslušná STRIPE_PRICE_* env)." },
        { status: 400 }
      );
    }
    subscriptionMetadata = {
      ...subscriptionMetadata,
      plan_tier: tier,
      plan_interval: interval,
      plan_label: planLabelCs(tier, interval),
    };
  } else if (legacy) {
    priceId = legacy;
  } else {
    return NextResponse.json(
      { error: "Nastavte STRIPE_PRICE_ID nebo sadu STRIPE_PRICE_*_* proměnných." },
      { status: 400 }
    );
  }

  try {
    const [tenantRow] = await db
      .select({ stripeCustomerId: tenants.stripeCustomerId })
      .from(tenants)
      .where(eq(tenants.id, m.tenantId))
      .limit(1);
    const stripeCustomerId = tenantRow?.stripeCustomerId ?? null;

    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { successUrl, cancelUrl } = getBillingReturnUrls(appBase, billingContext);
    const stripe = getStripe();

    const trialDays = getTrialPeriodDays();

    // Promo kód: jen whitelisted (PREMIUM-BROKERS-2026). Neznámé kódy z body
    // odmítáme hard (brute-force ochrana na Stripe API). Neznámé/expirované
    // hodnoty z cookie fallbackujeme silent — cookie mohla zůstat z kampaně
    // která už skončila a nechceme kvůli ní lámat checkout.
    let resolvedPromo: Awaited<ReturnType<typeof resolvePromotionCode>> = null;
    if (normalizedPromoCode) {
      const isWhitelisted = isKnownPromoCode(normalizedPromoCode);
      if (!isWhitelisted) {
        await writeBillingAudit({
          tenantId: m.tenantId,
          action: BILLING_AUDIT_ACTIONS.PROMO_CODE_REJECTED,
          actorKind: "user",
          actorUserId: user.id,
          metadata: {
            code: normalizedPromoCode,
            reason: "not_whitelisted",
            source: promoCodeSource,
          },
        });
        if (promoCodeSource !== "cookie") {
          return NextResponse.json(
            { error: "Zadaný promo kód není platný." },
            { status: 400 },
          );
        }
        // cookie fallthrough → pokračujeme bez slevy
      } else {
        resolvedPromo = await resolvePromotionCode(normalizedPromoCode);
        if (!resolvedPromo) {
          await writeBillingAudit({
            tenantId: m.tenantId,
            action: BILLING_AUDIT_ACTIONS.PROMO_CODE_REJECTED,
            actorKind: "user",
            actorUserId: user.id,
            metadata: {
              code: normalizedPromoCode,
              reason: "stripe_lookup_failed",
              source: promoCodeSource,
            },
          });
          if (promoCodeSource !== "cookie") {
            return NextResponse.json(
              {
                error:
                  "Promo kód teď nelze ověřit u platební brány. Zkuste to znovu za chvíli nebo pokračujte bez slevy.",
              },
              { status: 400 },
            );
          }
          // cookie fallthrough → pokračujeme bez slevy
        } else {
          subscriptionMetadata = {
            ...subscriptionMetadata,
            promo_code: resolvedPromo.code,
            coupon_id: resolvedPromo.couponId,
          };
        }
      }
    }

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: subscriptionMetadata,
    };
    if (trialDays > 0) {
      subscriptionData.trial_period_days = trialDays;
    }

    // FL-2 — Stripe Tax CZ. Povolujeme automatický výpočet DPH, sběr IČO/DIČ
    // a update billing údajů na Customer objektu, aby Stripe mohl dodat ČR
    // formálně správnou fakturu (reverse charge pro EU B2B, 21 % pro domácí).
    // Pozn.: musí být ve Stripe dashboardu aktivováno Stripe Tax + nastavená
    // registrace v CZ (MANUAL STEP v docs).
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: m.tenantId,
      metadata: { tenant_id: m.tenantId },
      subscription_data: subscriptionData,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: "required",
      customer_update: stripeCustomerId
        ? { address: "auto", name: "auto", shipping: "auto" }
        : undefined,
    };

    if (resolvedPromo) {
      params.discounts = [{ promotion_code: resolvedPromo.id }];
      // Stripe neumí naráz `discounts` + `allow_promotion_codes` — discounts mají přednost.
    } else {
      // Umožníme uživateli zadat kód přímo v hosted checkout (pro budoucí veřejné kódy).
      params.allow_promotion_codes = true;
    }

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

    await writeBillingAudit({
      tenantId: m.tenantId,
      action: BILLING_AUDIT_ACTIONS.CHECKOUT_STARTED,
      actorKind: "user",
      actorUserId: user.id,
      stripeObjectId: session.id,
      metadata: {
        tier,
        interval,
        priceId,
        promoCode: resolvedPromo?.code ?? null,
        couponId: resolvedPromo?.couponId ?? null,
        couponSummary: resolvedPromo?.summary ?? null,
        promoCodeSource: resolvedPromo ? promoCodeSource : null,
        billingContext,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("[api/stripe/checkout]", err);
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        {
          error:
            "Platební brána odmítla požadavek. Zkontrolujte STRIPE_SECRET_KEY a ID cen (test/live), případně stav cen ve Stripe.",
          detail: err.message,
        },
        { status: 502 }
      );
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Nepodařilo se vytvořit platební relaci. Zkuste to znovu." },
      { status: 500 }
    );
  }
}
