/**
 * Branding settings (Plan 8D.2).
 * Tenant-level branding configuration resolved from tenant_settings.
 */

import { db, tenantSettings, eq, and } from "db";

export type BrandingConfig = {
  logoUrl?: string;
  accentColor?: string;
  appNameVariant?: string;
  portalHeaderText?: string;
  assistantDisplayName?: string;
  emailSignature?: string;
  senderName?: string;
  defaultTone?: "professional" | "friendly" | "formal";
};

export const DEFAULT_BRANDING: BrandingConfig = {
  logoUrl: undefined,
  accentColor: "#3B82F6",
  appNameVariant: "WePlan",
  portalHeaderText: "Klientský portál",
  assistantDisplayName: "AI Asistent",
  emailSignature: undefined,
  senderName: undefined,
  defaultTone: "professional",
};

export async function getEffectiveBranding(tenantId: string): Promise<BrandingConfig> {
  const rows = await db
    .select({ key: tenantSettings.key, value: tenantSettings.value })
    .from(tenantSettings)
    .where(
      and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.domain, "branding"))
    );

  if (rows.length === 0) return { ...DEFAULT_BRANDING };

  const override: Record<string, unknown> = {};
  for (const row of rows) {
    const brandingKey = row.key.replace("branding.", "");
    override[brandingKey] = row.value;
  }

  return {
    ...DEFAULT_BRANDING,
    ...override,
  } as BrandingConfig;
}

export async function setBrandingField(
  tenantId: string,
  field: keyof BrandingConfig,
  value: unknown,
  updatedBy: string
): Promise<void> {
  const key = `branding.${field}`;
  const existing = await db
    .select({ id: tenantSettings.id, version: tenantSettings.version })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)));

  if (existing.length > 0) {
    await db
      .update(tenantSettings)
      .set({
        value: value as any,
        updatedBy,
        updatedAt: new Date(),
        version: (existing[0]!.version ?? 0) + 1,
      })
      .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)));
  } else {
    await db.insert(tenantSettings).values({
      tenantId,
      key,
      value: value as any,
      domain: "branding",
      updatedBy,
      version: 1,
    });
  }
}

export function mergeBranding(base: BrandingConfig, override: Partial<BrandingConfig>): BrandingConfig {
  const result: BrandingConfig = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v !== undefined && v !== null) {
      (result as any)[k] = v;
    }
  }
  return result;
}
