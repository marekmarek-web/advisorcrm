import type { StripeBillingContext } from "./billing-types";

export function parseBillingContext(raw: unknown): StripeBillingContext {
  return raw === "setup" ? "setup" : "profile";
}

export function getBillingReturnUrls(base: string, ctx: StripeBillingContext) {
  const b = base.replace(/\/$/, "");
  if (ctx === "setup") {
    return {
      successUrl: `${b}/portal/setup?tab=fakturace&billing=success`,
      cancelUrl: `${b}/portal/setup?tab=fakturace&billing=cancel`,
      portalReturnUrl: `${b}/portal/setup?tab=fakturace`,
    };
  }
  return {
    successUrl: `${b}/portal/setup?tab=fakturace&billing=success`,
    cancelUrl: `${b}/portal/setup?tab=fakturace&billing=cancel`,
    portalReturnUrl: `${b}/portal/setup?tab=fakturace`,
  };
}
