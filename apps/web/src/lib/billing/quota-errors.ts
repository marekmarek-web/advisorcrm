import type { PublicPlanKey } from "@/lib/billing/plan-catalog";

/** Aligns with quota dimensions in subscription-usage / plan limits. */
export type QuotaExceededCapabilityKind =
  | "ai_assistant_actions"
  | "ai_image_intake"
  | "ai_review_pages"
  | "internal_token_budget";

export type QuotaExceededDetail = Readonly<{
  capability: QuotaExceededCapabilityKind;
  limit: number;
  used: number;
  remaining: number;
  /** Next public tier to unlock higher limits; null if already top tier or unknown. */
  upgradeTargetSuggestion: PublicPlanKey | null;
}>;

export class QuotaExceededError extends Error {
  readonly name = "QuotaExceededError";

  readonly detail: QuotaExceededDetail;

  constructor(detail: QuotaExceededDetail, message?: string) {
    super(
      message ??
        `Quota exceeded for ${detail.capability}: used ${detail.used}/${detail.limit} (remaining ${detail.remaining}).`,
    );
    this.detail = detail;
  }

  static is(e: unknown): e is QuotaExceededError {
    return e instanceof QuotaExceededError;
  }
}
