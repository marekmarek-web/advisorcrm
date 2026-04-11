import type { PlanLimits } from "@/lib/billing/plan-catalog";
import type { EffectiveLimits } from "@/lib/billing/plan-catalog";

export type UsageCounters = Readonly<{
  assistantActionsUsed: number;
  imageIntakesUsed: number;
  aiReviewPagesUsed: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
}>;

export type RemainingQuota =
  | { bypassed: true }
  | {
      bypassed: false;
      assistantActions: number;
      imageIntakes: number;
      aiReviewPages: number;
      tokenBudget: number;
    };

/**
 * Pure: remaining headroom per PlanLimits vs usage row (monthly).
 * Internal admin / bypass → all dimensions unlimited from an enforcement perspective.
 */
export function computeRemainingQuota(params: {
  limits: EffectiveLimits;
  used: UsageCounters;
}): RemainingQuota {
  const lim = params.limits;
  if (lim.bypass === true) {
    return { bypassed: true };
  }
  const L: PlanLimits = lim.limits;
  const u = params.used;
  return {
    bypassed: false,
    assistantActions: Math.max(0, L.aiActionsPerMonth - u.assistantActionsUsed),
    imageIntakes: Math.max(0, L.aiImageIntakesPerMonth - u.imageIntakesUsed),
    aiReviewPages: Math.max(0, L.aiReviewPagesPerMonth - u.aiReviewPagesUsed),
    tokenBudget: Math.max(0, L.internalTokenBudgetPerMonth - (u.inputTokensUsed + u.outputTokensUsed)),
  };
}
