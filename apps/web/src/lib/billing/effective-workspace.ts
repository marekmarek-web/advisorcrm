import "server-only";

import { db, tenantSettings, eq, and, inArray } from "db";
import {
  ALL_PLAN_SYNCED_SETTING_KEYS,
  type EffectiveAccessContext,
  type PlanSyncedTenantSettingKey,
} from "@/lib/billing/plan-catalog";
import {
  computeCapabilityGatedPlanDefaults,
  mergeTenantBooleanOverrides,
} from "@/lib/billing/plan-capability-settings";
import { resolveEffectiveAccessContext } from "@/lib/billing/resolve-effective-access";

export type { EffectiveAccessContext } from "@/lib/billing/plan-catalog";

/** Granular capabilities from the already-resolved access context (single source: plan matrix). */
export function getEffectiveCapabilitiesForWorkspace(ctx: EffectiveAccessContext) {
  return ctx.capabilities;
}

export function getEffectiveLimitsForWorkspace(ctx: EffectiveAccessContext) {
  return ctx.limits;
}

const PLAN_SYNCED_KEY_SET = new Set<string>(ALL_PLAN_SYNCED_SETTING_KEYS as unknown as string[]);

async function loadPlanSyncedBooleanOverrides(
  tenantId: string,
): Promise<Partial<Record<PlanSyncedTenantSettingKey, boolean>>> {
  const keys = ALL_PLAN_SYNCED_SETTING_KEYS as unknown as string[];
  const rows = await db
    .select({ key: tenantSettings.key, value: tenantSettings.value })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, tenantId), inArray(tenantSettings.key, keys)));

  const out: Partial<Record<PlanSyncedTenantSettingKey, boolean>> = {};
  for (const r of rows) {
    if (PLAN_SYNCED_KEY_SET.has(r.key)) {
      const v = r.value;
      if (typeof v === "boolean") {
        out[r.key as PlanSyncedTenantSettingKey] = v;
      }
    }
  }
  return out;
}

/**
 * Effective tenant settings: plan defaults × capability matrix × optional tenant overrides (narrow-only).
 */
export async function getEffectiveTenantSettingsForWorkspace(params: {
  tenantId: string;
  accessContext: EffectiveAccessContext;
}): Promise<Record<PlanSyncedTenantSettingKey, boolean>> {
  const gated = computeCapabilityGatedPlanDefaults(params.accessContext);
  const overrides = await loadPlanSyncedBooleanOverrides(params.tenantId);
  return mergeTenantBooleanOverrides(gated, overrides);
}

/**
 * Loads subscription + trial + internal admin and returns effective settings in one call.
 */
export async function getEffectiveTenantSettingsForWorkspaceResolved(params: {
  tenantId: string;
  userId: string;
  email: string | null | undefined;
  now?: Date;
}): Promise<{
  accessContext: EffectiveAccessContext;
  settings: Record<PlanSyncedTenantSettingKey, boolean>;
}> {
  const accessContext = await resolveEffectiveAccessContext({
    tenantId: params.tenantId,
    userId: params.userId,
    email: params.email,
    now: params.now,
  });
  const settings = await getEffectiveTenantSettingsForWorkspace({
    tenantId: params.tenantId,
    accessContext,
  });
  return { accessContext, settings };
}
