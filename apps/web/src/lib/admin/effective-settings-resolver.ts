/**
 * Effective settings resolver (Plan 8A.3).
 * Resolves active setting values for a tenant using hierarchy: tenant override > global default.
 */

import { db, tenantSettings, eq, and } from "db";
import {
  getSettingDefinition,
  getSettingsForDomain,
  SETTINGS_REGISTRY,
  type SettingDomain,
  type SettingDefinition,
} from "./settings-registry";

export type SettingOrigin = "default" | "tenant_override";

export type EffectiveSetting = {
  key: string;
  value: unknown;
  origin: SettingOrigin;
  domain: SettingDomain;
  lockedByHigherScope: boolean;
};

async function getTenantOverride(tenantId: string, key: string): Promise<unknown | undefined> {
  const rows = await db
    .select({ value: tenantSettings.value })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)));
  return rows.length > 0 ? rows[0].value : undefined;
}

export async function resolveEffectiveSetting(tenantId: string, key: string): Promise<EffectiveSetting | null> {
  const def = getSettingDefinition(key);
  if (!def) return null;

  const override = await getTenantOverride(tenantId, key);
  const value = override !== undefined ? override : def.defaultValue;
  const origin: SettingOrigin = override !== undefined ? "tenant_override" : "default";

  return {
    key,
    value,
    origin,
    domain: def.domain,
    lockedByHigherScope: def.locked ?? false,
  };
}

export async function resolveEffectiveSettings(tenantId: string, domain?: SettingDomain): Promise<EffectiveSetting[]> {
  const defs: SettingDefinition[] = domain ? getSettingsForDomain(domain) : SETTINGS_REGISTRY;

  const rows = await db
    .select({ key: tenantSettings.key, value: tenantSettings.value })
    .from(tenantSettings)
    .where(
      domain
        ? and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.domain, domain))
        : eq(tenantSettings.tenantId, tenantId)
    );

  const overridesMap = new Map(rows.map((r) => [r.key, r.value]));

  return defs.map((def) => {
    const override = overridesMap.get(def.key);
    const value = override !== undefined ? override : def.defaultValue;
    return {
      key: def.key,
      value,
      origin: (override !== undefined ? "tenant_override" : "default") as SettingOrigin,
      domain: def.domain,
      lockedByHigherScope: def.locked ?? false,
    };
  });
}

export async function getSettingOrigin(tenantId: string, key: string): Promise<SettingOrigin> {
  const override = await getTenantOverride(tenantId, key);
  return override !== undefined ? "tenant_override" : "default";
}

export async function getEffectiveSettingValue<T = unknown>(tenantId: string, key: string): Promise<T> {
  const effective = await resolveEffectiveSetting(tenantId, key);
  if (!effective) {
    const def = getSettingDefinition(key);
    return (def?.defaultValue as T) ?? (undefined as T);
  }
  return effective.value as T;
}
