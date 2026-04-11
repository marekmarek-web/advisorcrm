/**
 * Maps plan capabilities → tenant setting keys and merges plan defaults with tenant overrides.
 * Pure helpers — safe for tests without DB.
 */

import {
  ALL_PLAN_SYNCED_SETTING_KEYS,
  type EffectiveAccessContext,
  type PlanCapabilityKey,
  type PlanSyncedTenantSettingKey,
  getPlanDefaultTenantSettingsFromAccessContext,
} from "@/lib/billing/plan-catalog";

/** Each setting must have all listed capabilities true to stay enabled (after plan defaults). */
export const SETTING_REQUIRED_CAPABILITIES: Readonly<
  Record<PlanSyncedTenantSettingKey, readonly PlanCapabilityKey[]>
> = {
  "client_portal.enabled": ["client_portal_documents"],
  "client_portal.allow_document_upload": ["client_portal_documents"],
  "client_portal.allow_messaging": ["client_portal_messaging"],
  "client_portal.allow_service_requests": ["client_portal_service_requests"],
  "ai.assistant_enabled": ["ai_assistant_basic"],
  "ai.assistant_basic_enabled": ["ai_assistant_basic"],
  "ai.assistant_image_intake_enabled": ["ai_assistant_image_intake"],
  "ai.assistant_pdf_read_enabled": ["ai_assistant_pdf_read"],
  "ai.assistant_multi_step_enabled": ["ai_assistant_multi_step"],
  "ai.review_enabled": ["ai_review"],
  "ai.review_export_pdf_enabled": ["ai_review_export_pdf"],
  "integrations.google_calendar_enabled": ["google_calendar"],
  "integrations.google_gmail_enabled": ["google_gmail"],
  "integrations.google_drive_enabled": ["google_drive"],
  "team.overview_enabled": ["team_overview"],
  "team.production_enabled": ["team_production"],
  "team.goals_events_enabled": ["team_goals_events"],
  "manager.summary_enabled": ["manager_summary"],
  "reports.advanced_enabled": ["reports_advanced"],
};

/**
 * Plan defaults for the access context, then AND with capability flags (executable matrix).
 */
export function computeCapabilityGatedPlanDefaults(
  ctx: EffectiveAccessContext,
): Record<PlanSyncedTenantSettingKey, boolean> {
  const planDefaults = getPlanDefaultTenantSettingsFromAccessContext(ctx);
  const out = {} as Record<PlanSyncedTenantSettingKey, boolean>;
  for (const k of ALL_PLAN_SYNCED_SETTING_KEYS) {
    const req = SETTING_REQUIRED_CAPABILITIES[k];
    const capOk = req.every((c) => ctx.capabilities[c]);
    out[k] = planDefaults[k] && capOk;
  }
  return out;
}

/**
 * Tenant DB values can only narrow (turn off) relative to capability-gated plan defaults.
 * Missing override → use gated default.
 */
export function mergeTenantBooleanOverrides(
  capabilityGated: Record<PlanSyncedTenantSettingKey, boolean>,
  overrides: Partial<Record<PlanSyncedTenantSettingKey, boolean | null | undefined>>,
): Record<PlanSyncedTenantSettingKey, boolean> {
  const out = {} as Record<PlanSyncedTenantSettingKey, boolean>;
  for (const k of ALL_PLAN_SYNCED_SETTING_KEYS) {
    const o = overrides[k];
    const base = capabilityGated[k];
    if (o === undefined || o === null) {
      out[k] = base;
    } else {
      out[k] = base && o;
    }
  }
  return out;
}
