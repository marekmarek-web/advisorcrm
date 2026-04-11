import "server-only";

import { db, tenantSettings, eq, and, inArray } from "db";
import {
  ALL_PLAN_SYNCED_SETTING_KEYS,
  type EffectiveAccessContext,
  type PlanSyncedTenantSettingKey,
  getPlanDefaultTenantSettingsFromAccessContext,
} from "@/lib/billing/plan-catalog";
import { getSettingDefinition } from "@/lib/admin/settings-registry";

export type SettingRowOrigin = "plan" | "manual" | null;

function boolEquals(a: unknown, b: boolean): boolean {
  return typeof a === "boolean" && a === b;
}

/**
 * Writes plan defaults into `tenant_settings` for keys that are missing or were provisioned as `plan`.
 * Does not overwrite `manual` rows or legacy rows (`setting_origin` null).
 */
export async function syncPlanDefaultsToTenantSettings(params: {
  tenantId: string;
  accessContext: EffectiveAccessContext;
  updatedBy: string;
}): Promise<{ inserted: number; updated: number; skipped: number }> {
  const desired = getPlanDefaultTenantSettingsFromAccessContext(params.accessContext);
  const keys = [...ALL_PLAN_SYNCED_SETTING_KEYS] as string[];

  const existing = await db
    .select({
      key: tenantSettings.key,
      value: tenantSettings.value,
      settingOrigin: tenantSettings.settingOrigin,
      version: tenantSettings.version,
    })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, params.tenantId), inArray(tenantSettings.key, keys)));

  const byKey = new Map(existing.map((r) => [r.key, r]));
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const k of ALL_PLAN_SYNCED_SETTING_KEYS) {
    const row = byKey.get(k);
    const def = getSettingDefinition(k);
    if (!def) {
      skipped += 1;
      continue;
    }
    const next = desired[k];

    if (!row) {
      await db.insert(tenantSettings).values({
        tenantId: params.tenantId,
        key: k,
        value: next,
        domain: def.domain,
        updatedBy: params.updatedBy,
        version: 1,
        settingOrigin: "plan",
      });
      inserted += 1;
      continue;
    }

    const origin = row.settingOrigin as SettingRowOrigin;
    if (origin === "manual" || origin === null) {
      skipped += 1;
      continue;
    }

    if (origin === "plan" && !boolEquals(row.value, next)) {
      await db
        .update(tenantSettings)
        .set({
          value: next,
          updatedBy: params.updatedBy,
          updatedAt: new Date(),
          version: (row.version ?? 0) + 1,
          settingOrigin: "plan",
        })
        .where(and(eq(tenantSettings.tenantId, params.tenantId), eq(tenantSettings.key, k)));
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  return { inserted, updated, skipped };
}
