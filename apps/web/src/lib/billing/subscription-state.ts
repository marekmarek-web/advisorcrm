import "server-only";

import { db, subscriptions, eq, desc } from "db";
import { getEffectiveSettingValue } from "@/lib/admin/effective-settings-resolver";
import type { SubscriptionState } from "@/lib/stripe/billing-types";

export type { SubscriptionState } from "@/lib/stripe/billing-types";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const PAST_DUE_STATUSES = new Set(["past_due"]);

export async function getSubscriptionState(tenantId: string): Promise<SubscriptionState> {
  const [latestSub] = await db
    .select({
      status: subscriptions.status,
      plan: subscriptions.plan,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);

  if (!latestSub) {
    return { status: null, plan: null, currentPeriodEnd: null, isActive: false, inGracePeriod: false };
  }

  const isActive = ACTIVE_STATUSES.has(latestSub.status);
  const isPastDue = PAST_DUE_STATUSES.has(latestSub.status);

  let inGracePeriod = false;
  if (isPastDue && latestSub.currentPeriodEnd) {
    const graceDays = await getEffectiveSettingValue<number>(tenantId, "billing.grace_period_days");
    const graceEnd = new Date(latestSub.currentPeriodEnd.getTime() + (graceDays ?? 7) * 86_400_000);
    inGracePeriod = new Date() < graceEnd;
  }

  return {
    status: latestSub.status,
    plan: latestSub.plan,
    currentPeriodEnd: latestSub.currentPeriodEnd,
    isActive,
    inGracePeriod,
  };
}
