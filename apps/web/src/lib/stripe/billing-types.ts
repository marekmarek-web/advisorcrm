export type WorkspaceBillingSnapshot = {
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  plan: string | null;
  canManage: boolean;
};

export type StripeBillingContext = "profile" | "setup";
