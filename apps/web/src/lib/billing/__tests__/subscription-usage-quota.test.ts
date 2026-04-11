import { describe, expect, it } from "vitest";
import { computeRemainingQuota } from "@/lib/billing/quota-math";
import { formatUtcPeriodMonth } from "@/lib/billing/usage-period";
import { QuotaExceededError } from "@/lib/billing/quota-errors";
import { getDefaultPlanLimits } from "@/lib/billing/plan-catalog";

const LIMITS_START = getDefaultPlanLimits("start");
const LIMITS_PRO = getDefaultPlanLimits("pro");

describe("usage-period", () => {
  it("formats UTC YYYY-MM", () => {
    expect(formatUtcPeriodMonth(new Date(Date.UTC(2026, 3, 5)))).toBe("2026-04");
    expect(formatUtcPeriodMonth(new Date(Date.UTC(2026, 11, 1)))).toBe("2026-12");
  });
});

describe("computeRemainingQuota", () => {
  const used = {
    assistantActionsUsed: 100,
    imageIntakesUsed: 10,
    aiReviewPagesUsed: 50,
    inputTokensUsed: 1000,
    outputTokensUsed: 2000,
  };

  it("bypasses when EffectiveLimits has bypass: true (internal admin)", () => {
    const r = computeRemainingQuota({
      limits: { bypass: true },
      used,
    });
    expect(r).toEqual({ bypassed: true });
  });

  it("subtracts usage from Start plan limits", () => {
    const r = computeRemainingQuota({
      limits: { bypass: false, limits: LIMITS_START },
      used: {
        assistantActionsUsed: 140,
        imageIntakesUsed: 15,
        aiReviewPagesUsed: 0,
        inputTokensUsed: 400_000,
        outputTokensUsed: 50_000,
      },
    });
    expect(r.bypassed).toBe(false);
    if (r.bypassed) return;
    expect(r.assistantActions).toBe(10);
    expect(r.imageIntakes).toBe(5);
    expect(r.aiReviewPages).toBe(0);
    expect(r.tokenBudget).toBe(50_000);
  });

  it("trial-equivalent Pro limits: same as LIMITS_PRO", () => {
    const r = computeRemainingQuota({
      limits: { bypass: false, limits: LIMITS_PRO },
      used,
    });
    expect(r.bypassed).toBe(false);
    if (r.bypassed) return;
    expect(r.assistantActions).toBe(700 - 100);
    expect(r.imageIntakes).toBe(100 - 10);
    expect(r.aiReviewPages).toBe(300 - 50);
    expect(r.tokenBudget).toBe(2_500_000 - 3000);
  });
});

describe("QuotaExceededError", () => {
  it("exposes structured detail", () => {
    const err = new QuotaExceededError({
      capability: "ai_assistant_actions",
      limit: 150,
      used: 150,
      remaining: 0,
      upgradeTargetSuggestion: "pro",
    });
    expect(QuotaExceededError.is(err)).toBe(true);
    expect(err.detail.upgradeTargetSuggestion).toBe("pro");
  });
});
