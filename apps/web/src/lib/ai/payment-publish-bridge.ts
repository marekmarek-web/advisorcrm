/**
 * Phase 3E/3F — Payment setup visibility tiers for advisor API and regression tests.
 *
 * Phase 3 / Slice 1 update: client portal now reads from both client_payment_setups
 * (status='active', needsHumanReview=false) and legacy payment_accounts.
 * The canonical payment read layer (canonical-payment-read.ts) unifies both sources.
 */

export type PaymentSetupClientVisibility = "advisor_ready" | "client_visible" | "draft_only" | "hidden";

/**
 * Maps DB status on client_payment_setups to an explicit visibility tier.
 * 'active' with needsHumanReview=false → client_visible (ready for portal).
 * 'active' with needsHumanReview=true → advisor_ready (still needs confirmation).
 */
export function resolvePaymentSetupClientVisibility(
  status: string,
  needsHumanReview?: boolean,
): PaymentSetupClientVisibility {
  if (status === "active") {
    return needsHumanReview === false ? "client_visible" : "advisor_ready";
  }
  if (status === "review_required") return "draft_only";
  if (status === "draft") return "draft_only";
  return "hidden";
}
