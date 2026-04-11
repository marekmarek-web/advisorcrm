/**
 * Pure plan × tenant-setting allow checks (no DB, no server-only).
 * Used by {@link assertCapability} and unit tests.
 */

import type {
  EffectiveAccessContext,
  PlanCapabilityKey,
  PlanSyncedTenantSettingKey,
  PublicPlanKey,
} from "@/lib/billing/plan-catalog";

/**
 * When set, enforcement also requires this tenant setting to be true (tenant can narrow plan).
 * Capabilities without a setting (e.g. crm_core) use only {@link EffectiveAccessContext.capabilities}.
 */
export const CAPABILITY_PRIMARY_SETTING: Partial<Record<PlanCapabilityKey, PlanSyncedTenantSettingKey>> = {
  google_calendar: "integrations.google_calendar_enabled",
  google_gmail: "integrations.google_gmail_enabled",
  google_drive: "integrations.google_drive_enabled",
  client_portal_documents: "client_portal.enabled",
  client_portal_messaging: "client_portal.allow_messaging",
  client_portal_service_requests: "client_portal.allow_service_requests",
  ai_assistant_basic: "ai.assistant_enabled",
  ai_assistant_image_intake: "ai.assistant_image_intake_enabled",
  ai_assistant_pdf_read: "ai.assistant_pdf_read_enabled",
  ai_assistant_multi_step: "ai.assistant_multi_step_enabled",
  ai_review: "ai.review_enabled",
  ai_review_export_pdf: "ai.review_export_pdf_enabled",
  team_overview: "team.overview_enabled",
  team_production: "team.production_enabled",
  team_goals_events: "team.goals_events_enabled",
  manager_summary: "manager.summary_enabled",
  reports_advanced: "reports.advanced_enabled",
};

const MANAGEMENT_TIER_CAPABILITIES: ReadonlySet<PlanCapabilityKey> = new Set([
  "team_overview",
  "team_production",
  "team_goals_events",
  "manager_summary",
  "reports_advanced",
]);

export function getUpgradePublicPlanForCapability(capability: PlanCapabilityKey): PublicPlanKey {
  return MANAGEMENT_TIER_CAPABILITIES.has(capability) ? "management" : "pro";
}

export function isPlanCapabilityAllowed(
  capability: PlanCapabilityKey,
  ctx: EffectiveAccessContext,
  settings: Record<PlanSyncedTenantSettingKey, boolean>,
): boolean {
  if (!ctx.capabilities[capability]) return false;
  const sk = CAPABILITY_PRIMARY_SETTING[capability];
  if (!sk) return true;
  return settings[sk] === true;
}
