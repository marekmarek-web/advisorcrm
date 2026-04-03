import "server-only";

import { db, subscriptions, tenants, eq, desc } from "db";
import { getEffectiveSettingValue } from "@/lib/admin/effective-settings-resolver";

/**
 * Canonical entitlement check for a workspace.
 * Single source of truth for "what can this tenant use".
 *
 * Resolution order:
 *  1. Subscription status (billing requirement)
 *  2. Tenant settings overrides (admin toggles)
 *  3. Registry defaults
 */

export type EntitlementKey =
  | "ai_assistant"
  | "ai_review"
  | "client_portal"
  | "google_calendar"
  | "google_drive"
  | "google_gmail"
  | "team_overview"
  | "document_upload";

export type SubscriptionState = {
  status: string | null;
  plan: string | null;
  currentPeriodEnd: Date | null;
  isActive: boolean;
  inGracePeriod: boolean;
};

export type WorkspaceEntitlements = Record<EntitlementKey, boolean>;

const SETTING_KEY_MAP: Record<EntitlementKey, string> = {
  ai_assistant: "ai.assistant_enabled",
  ai_review: "ai.assistant_enabled",
  client_portal: "client_portal.enabled",
  google_calendar: "integrations.google_calendar_enabled",
  google_drive: "integrations.google_drive_enabled",
  google_gmail: "integrations.google_gmail_enabled",
  team_overview: "ai.assistant_enabled",
  document_upload: "client_portal.allow_document_upload",
};

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

export async function resolveEntitlements(tenantId: string): Promise<WorkspaceEntitlements> {
  const requireSub = await getEffectiveSettingValue<boolean>(tenantId, "billing.require_active_subscription");
  const subState = await getSubscriptionState(tenantId);

  const billingOk = !requireSub || subState.isActive || subState.inGracePeriod;

  const results: Partial<WorkspaceEntitlements> = {};
  for (const key of Object.keys(SETTING_KEY_MAP) as EntitlementKey[]) {
    const settingEnabled = await getEffectiveSettingValue<boolean>(tenantId, SETTING_KEY_MAP[key]);
    results[key] = billingOk && (settingEnabled ?? true);
  }

  return results as WorkspaceEntitlements;
}

export async function checkEntitlement(tenantId: string, key: EntitlementKey): Promise<boolean> {
  const requireSub = await getEffectiveSettingValue<boolean>(tenantId, "billing.require_active_subscription");
  const subState = await getSubscriptionState(tenantId);

  const billingOk = !requireSub || subState.isActive || subState.inGracePeriod;
  if (!billingOk) return false;

  const settingEnabled = await getEffectiveSettingValue<boolean>(tenantId, SETTING_KEY_MAP[key]);
  return settingEnabled ?? true;
}
