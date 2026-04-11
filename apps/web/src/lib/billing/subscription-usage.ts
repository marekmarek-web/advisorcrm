import "server-only";

import { db, subscriptionUsageMonthly, eq, and, sql } from "db";
import {
  PUBLIC_PLAN_ORDER,
  type EffectiveAccessContext,
  type PlanLimits,
  type PublicPlanKey,
} from "@/lib/billing/plan-catalog";
import { resolveEffectiveAccessContext } from "@/lib/billing/resolve-effective-access";
import { formatUtcPeriodMonth } from "@/lib/billing/usage-period";
import { computeRemainingQuota, type UsageCounters } from "@/lib/billing/quota-math";
import { QuotaExceededError, type QuotaExceededCapabilityKind } from "@/lib/billing/quota-errors";

export type QuotaDimension = "assistant_actions" | "image_intake" | "ai_review_pages" | "tokens";

export type UsageIncrementDelta = Readonly<{
  assistantActions?: number;
  imageIntakes?: number;
  aiReviewPages?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Added to monthly estimated cost (nominal USD). */
  estimatedCostUsd?: number;
}>;

export type SubscriptionUsageMonthlySnapshot = Readonly<
  UsageCounters & {
    tenantId: string;
    periodMonth: string;
    estimatedCost: string;
  }
>;

function getSuggestedUpgradePublicPlanKey(current: PublicPlanKey | null): PublicPlanKey | null {
  if (!current) return "pro";
  const idx = PUBLIC_PLAN_ORDER.indexOf(current);
  if (idx < 0 || idx >= PUBLIC_PLAN_ORDER.length - 1) return null;
  return PUBLIC_PLAN_ORDER[idx + 1]!;
}

function upgradeSuggestionFromAccessContext(ctx: EffectiveAccessContext): PublicPlanKey | null {
  if (ctx.source === "internal_admin") return null;
  if (ctx.source === "restricted") return "pro";
  return getSuggestedUpgradePublicPlanKey(ctx.publicPlanKey);
}

function emptyUsage(): UsageCounters {
  return {
    assistantActionsUsed: 0,
    imageIntakesUsed: 0,
    aiReviewPagesUsed: 0,
    inputTokensUsed: 0,
    outputTokensUsed: 0,
  };
}

function getLimitForDimension(limits: PlanLimits, d: QuotaDimension): number {
  switch (d) {
    case "assistant_actions":
      return limits.aiActionsPerMonth;
    case "image_intake":
      return limits.aiImageIntakesPerMonth;
    case "ai_review_pages":
      return limits.aiReviewPagesPerMonth;
    case "tokens":
      return limits.internalTokenBudgetPerMonth;
  }
}

function getUsedForDimension(used: UsageCounters, d: QuotaDimension): number {
  switch (d) {
    case "assistant_actions":
      return used.assistantActionsUsed;
    case "image_intake":
      return used.imageIntakesUsed;
    case "ai_review_pages":
      return used.aiReviewPagesUsed;
    case "tokens":
      return used.inputTokensUsed + used.outputTokensUsed;
  }
}

function dimensionToCapabilityKind(d: QuotaDimension): QuotaExceededCapabilityKind {
  switch (d) {
    case "assistant_actions":
      return "ai_assistant_actions";
    case "image_intake":
      return "ai_image_intake";
    case "ai_review_pages":
      return "ai_review_pages";
    case "tokens":
      return "internal_token_budget";
  }
}

/**
 * Upsert monthly row and add deltas (atomic increment).
 */
export async function incrementSubscriptionUsageMonthly(params: {
  tenantId: string;
  at?: Date;
  delta: UsageIncrementDelta;
}): Promise<void> {
  const at = params.at ?? new Date();
  const periodMonth = formatUtcPeriodMonth(at);
  const a = params.delta.assistantActions ?? 0;
  const i = params.delta.imageIntakes ?? 0;
  const p = params.delta.aiReviewPages ?? 0;
  const inTok = params.delta.inputTokens ?? 0;
  const outTok = params.delta.outputTokens ?? 0;
  const cost = params.delta.estimatedCostUsd ?? 0;

  if (a === 0 && i === 0 && p === 0 && inTok === 0 && outTok === 0 && cost === 0) {
    return;
  }

  await db
    .insert(subscriptionUsageMonthly)
    .values({
      tenantId: params.tenantId,
      periodMonth,
      assistantActionsUsed: a,
      imageIntakesUsed: i,
      aiReviewPagesUsed: p,
      inputTokensUsed: inTok,
      outputTokensUsed: outTok,
      estimatedCost: String(cost),
    })
    .onConflictDoUpdate({
      target: [subscriptionUsageMonthly.tenantId, subscriptionUsageMonthly.periodMonth],
      set: {
        assistantActionsUsed: sql`${subscriptionUsageMonthly.assistantActionsUsed} + ${a}`,
        imageIntakesUsed: sql`${subscriptionUsageMonthly.imageIntakesUsed} + ${i}`,
        aiReviewPagesUsed: sql`${subscriptionUsageMonthly.aiReviewPagesUsed} + ${p}`,
        inputTokensUsed: sql`${subscriptionUsageMonthly.inputTokensUsed} + ${inTok}`,
        outputTokensUsed: sql`${subscriptionUsageMonthly.outputTokensUsed} + ${outTok}`,
        estimatedCost: sql`${subscriptionUsageMonthly.estimatedCost}::numeric + ${String(cost)}::numeric`,
        updatedAt: new Date(),
      },
    });
}

export async function recordAssistantUsage(params: {
  tenantId: string;
  actions?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  at?: Date;
}): Promise<void> {
  await incrementSubscriptionUsageMonthly({
    tenantId: params.tenantId,
    at: params.at,
    delta: {
      assistantActions: params.actions ?? 1,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCostUsd: params.estimatedCostUsd,
    },
  });
}

export async function recordImageIntakeUsage(params: {
  tenantId: string;
  intakes?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  at?: Date;
}): Promise<void> {
  await incrementSubscriptionUsageMonthly({
    tenantId: params.tenantId,
    at: params.at,
    delta: {
      imageIntakes: params.intakes ?? 1,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCostUsd: params.estimatedCostUsd,
    },
  });
}

export async function recordAiReviewUsage(params: {
  tenantId: string;
  pages: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  at?: Date;
}): Promise<void> {
  const pages = Math.max(0, Math.floor(params.pages));
  await incrementSubscriptionUsageMonthly({
    tenantId: params.tenantId,
    at: params.at,
    delta: {
      aiReviewPages: pages,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCostUsd: params.estimatedCostUsd,
    },
  });
}

export async function getCurrentUsageForWorkspace(params: {
  tenantId: string;
  at?: Date;
}): Promise<SubscriptionUsageMonthlySnapshot> {
  const at = params.at ?? new Date();
  const periodMonth = formatUtcPeriodMonth(at);
  const [row] = await db
    .select()
    .from(subscriptionUsageMonthly)
    .where(
      and(
        eq(subscriptionUsageMonthly.tenantId, params.tenantId),
        eq(subscriptionUsageMonthly.periodMonth, periodMonth),
      ),
    )
    .limit(1);

  if (!row) {
    return {
      tenantId: params.tenantId,
      periodMonth,
      ...emptyUsage(),
      estimatedCost: "0",
    };
  }

  return {
    tenantId: params.tenantId,
    periodMonth,
    assistantActionsUsed: row.assistantActionsUsed,
    imageIntakesUsed: row.imageIntakesUsed,
    aiReviewPagesUsed: row.aiReviewPagesUsed,
    inputTokensUsed: row.inputTokensUsed,
    outputTokensUsed: row.outputTokensUsed,
    estimatedCost: String(row.estimatedCost ?? "0"),
  };
}

export async function getRemainingQuotaForWorkspace(params: {
  tenantId: string;
  accessContext: EffectiveAccessContext;
  at?: Date;
}): Promise<ReturnType<typeof computeRemainingQuota>> {
  const used = await getCurrentUsageForWorkspace({ tenantId: params.tenantId, at: params.at });
  return computeRemainingQuota({
    limits: params.accessContext.limits,
    used,
  });
}

export async function assertQuotaAvailable(params: {
  tenantId: string;
  userId: string;
  email: string | null | undefined;
  dimension: QuotaDimension;
  amount?: number;
  at?: Date;
}): Promise<void> {
  const amount = params.amount ?? 1;
  const accessContext = await resolveEffectiveAccessContext({
    tenantId: params.tenantId,
    userId: params.userId,
    email: params.email,
    now: params.at,
  });

  const limits = accessContext.limits;
  if (limits.bypass === true) {
    return;
  }

  const planLimits = limits.limits;
  const used = await getCurrentUsageForWorkspace({ tenantId: params.tenantId, at: params.at });
  const limit = getLimitForDimension(planLimits, params.dimension);
  const usedN = getUsedForDimension(used, params.dimension);
  const remaining = Math.max(0, limit - usedN);

  if (remaining >= amount) {
    return;
  }

  const suggestion = upgradeSuggestionFromAccessContext(accessContext);

  throw new QuotaExceededError({
    capability: dimensionToCapabilityKind(params.dimension),
    limit,
    used: usedN,
    remaining,
    upgradeTargetSuggestion: suggestion,
  });
}
