import "server-only";

import { getEffectiveSettingValue } from "@/lib/admin/effective-settings-resolver";
import {
  getDefaultPlanCapabilities,
  tryParseInternalTierFromStoredPlan,
  type PlanCapabilities,
  type PlanSyncedTenantSettingKey,
} from "@/lib/billing/plan-catalog";
import { getSubscriptionState } from "@/lib/billing/subscription-state";
import { resolveEffectiveAccessContext } from "@/lib/billing/resolve-effective-access";
import { getEffectiveTenantSettingsForWorkspace } from "@/lib/billing/effective-workspace";
import type { EffectiveAccessContext } from "@/lib/billing/access-resolution";

export { getSubscriptionState } from "@/lib/billing/subscription-state";
export { resolveEffectiveAccessContext };
export { computeEffectiveAccessContext } from "@/lib/billing/access-resolution";
export {
  getEffectiveCapabilitiesForWorkspace,
  getEffectiveLimitsForWorkspace,
  getEffectiveTenantSettingsForWorkspace,
  getEffectiveTenantSettingsForWorkspaceResolved,
} from "@/lib/billing/effective-workspace";
export { syncPlanDefaultsToTenantSettings } from "@/lib/billing/sync-plan-defaults";
export {
  recordAssistantUsage,
  recordImageIntakeUsage,
  recordAiReviewUsage,
  getCurrentUsageForWorkspace,
  getRemainingQuotaForWorkspace,
  assertQuotaAvailable,
} from "@/lib/billing/subscription-usage";
export type {
  QuotaDimension,
  SubscriptionUsageMonthlySnapshot,
  UsageIncrementDelta,
} from "@/lib/billing/subscription-usage";
export { QuotaExceededError, type QuotaExceededDetail, type QuotaExceededCapabilityKind } from "@/lib/billing/quota-errors";
export { computeRemainingQuota } from "@/lib/billing/quota-math";
export {
  assertCapability,
  assertCapabilityEffective,
  getSessionEmailForUserId,
  isPlanCapabilityAllowed,
  getUpgradePublicPlanForCapability,
  CAPABILITY_PRIMARY_SETTING,
} from "@/lib/billing/plan-access-guards";
export { PlanAccessError, type PlanAccessErrorDetail } from "@/lib/billing/plan-access-errors";
export { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";
import type { PlanTier } from "@/lib/stripe/billing-types";

/**
 * Canonical entitlement check for a workspace.
 * Granular plan matrix × tenant overrides (narrow-only) via {@link getEffectiveTenantSettingsForWorkspace}.
 */

export type EntitlementKey =
  | "ai_assistant"
  | "ai_review"
  | "client_portal"
  | "client_portal_messaging"
  | "client_portal_service_requests"
  | "google_calendar"
  | "google_drive"
  | "google_gmail"
  | "team_overview"
  | "document_upload";

export type { SubscriptionState } from "@/lib/stripe/billing-types";

export type WorkspaceEntitlements = Record<EntitlementKey, boolean>;

const ENTITLEMENT_SETTING_KEY: Record<EntitlementKey, PlanSyncedTenantSettingKey> = {
  ai_assistant: "ai.assistant_enabled",
  ai_review: "ai.review_enabled",
  client_portal: "client_portal.enabled",
  client_portal_messaging: "client_portal.allow_messaging",
  client_portal_service_requests: "client_portal.allow_service_requests",
  google_calendar: "integrations.google_calendar_enabled",
  google_drive: "integrations.google_drive_enabled",
  google_gmail: "integrations.google_gmail_enabled",
  team_overview: "team.overview_enabled",
  document_upload: "client_portal.allow_document_upload",
};

export type EntitlementAuthContext = {
  userId: string;
  email: string | null | undefined;
};

async function resolveBillingAndSettings(params: {
  tenantId: string;
  auth?: EntitlementAuthContext;
}): Promise<{ billingOk: boolean; settings: Record<PlanSyncedTenantSettingKey, boolean> }> {
  const requireSub = await getEffectiveSettingValue<boolean>(params.tenantId, "billing.require_active_subscription");
  const subState = await getSubscriptionState(params.tenantId);

  const accessContext = await resolveEffectiveAccessContext({
    tenantId: params.tenantId,
    userId: params.auth?.userId ?? "",
    email: params.auth?.email,
  });

  const billingOk =
    accessContext.isBypassed ||
    (!requireSub || subState.isActive || subState.inGracePeriod);

  const settings = await getEffectiveTenantSettingsForWorkspace({
    tenantId: params.tenantId,
    accessContext,
  });

  return { billingOk, settings };
}

export async function resolveEntitlements(
  tenantId: string,
  auth?: EntitlementAuthContext,
): Promise<WorkspaceEntitlements> {
  const { billingOk, settings } = await resolveBillingAndSettings({ tenantId, auth });

  const results: Partial<WorkspaceEntitlements> = {};
  for (const key of Object.keys(ENTITLEMENT_SETTING_KEY) as EntitlementKey[]) {
    const sk = ENTITLEMENT_SETTING_KEY[key];
    results[key] = billingOk && (settings[sk] ?? false);
  }

  return results as WorkspaceEntitlements;
}

export async function checkEntitlement(
  tenantId: string,
  key: EntitlementKey,
  auth?: EntitlementAuthContext,
): Promise<boolean> {
  const { billingOk, settings } = await resolveBillingAndSettings({ tenantId, auth });
  if (!billingOk) return false;

  const sk = ENTITLEMENT_SETTING_KEY[key];
  return settings[sk] ?? false;
}

/** Re-export for callers that should align with billing plan-catalog types. */
export type { PlanCapabilities as PlanCatalogCapabilities } from "@/lib/billing/plan-catalog";

/**
 * Best-effort tier from persisted `subscriptions.plan` (free-form string). Not used for enforcement yet.
 */
export function getPlanCatalogTierForSubscriptionPlan(plan: string | null): PlanTier | null {
  return tryParseInternalTierFromStoredPlan(plan);
}

/**
 * Default granular capabilities for the tenant's current plan row — for Phase 2+ enforcement and UI hints.
 * Returns null if the plan string cannot be mapped to a known internal tier.
 */
export function getPlanCatalogCapabilitiesForSubscriptionPlan(plan: string | null): PlanCapabilities | null {
  const tier = tryParseInternalTierFromStoredPlan(plan);
  if (!tier) return null;
  return getDefaultPlanCapabilities(tier);
}

/**
 * Full effective access (admin bypass, subscription tier, workspace trial, restricted).
 * Phase 2: use {@link EffectiveAccessContext.capabilities} for granular enforcement.
 */
export async function getEffectiveAccessContextForTenant(params: {
  tenantId: string;
  userId: string;
  email: string | null | undefined;
}): Promise<EffectiveAccessContext> {
  return resolveEffectiveAccessContext(params);
}

/** Alias (Fáze 4 docs): same as {@link getEffectiveAccessContextForTenant}. */
export async function getEffectiveAccessContext(params: {
  tenantId: string;
  userId: string;
  email: string | null | undefined;
}): Promise<EffectiveAccessContext> {
  return resolveEffectiveAccessContext(params);
}

export type { EffectiveAccessContext } from "@/lib/billing/access-resolution";

/** True when plan limits should not apply (internal admin). Phase 2 quota layer. */
export async function shouldBypassPlanLimits(params: {
  tenantId: string;
  userId: string;
  email: string | null | undefined;
}): Promise<boolean> {
  const ctx = await resolveEffectiveAccessContext(params);
  return ctx.isBypassed;
}

export { isInternalAdminUser } from "@/lib/billing/internal-admin";
