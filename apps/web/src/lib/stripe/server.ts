import "server-only";

import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

/** Checkout Session (vyžaduje Price ID). */
export function isStripeCheckoutAvailable(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim());
}

/** Customer Portal (stačí secret + existující Stripe Customer na tenantovi). */
export function isStripePortalAvailable(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}
