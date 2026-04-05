import "server-only";

import { db, tenantSettings, advisorPreferences, eq, and } from "db";
import { BASE_FUNDS } from "@/lib/analyses/financial/fund-library/base-funds";
import { BASE_FUND_KEYS, type BaseFundKey } from "@/lib/analyses/financial/fund-library/legacy-fund-key-map";
import type { RoleName } from "@/shared/rolePermissions";
import { isRoleAtLeast } from "@/shared/rolePermissions";
import {
  TENANT_ALLOWLIST_KEY,
  type TenantFundAllowlistValue,
  type AdvisorFundLibraryValue,
  type FundCatalogListItemDTO,
  type FundLibrarySetupSnapshot,
} from "@/lib/fund-library/fund-library-setup-types";

export type {
  TenantFundAllowlistValue,
  AdvisorFundLibraryValue,
  FundCatalogListItemDTO,
  FundLibrarySetupSnapshot,
} from "@/lib/fund-library/fund-library-setup-types";

const CATALOG_ORDER = [...BASE_FUND_KEYS] as string[];

function isValidBaseFundKey(k: string): k is BaseFundKey {
  return (BASE_FUND_KEYS as readonly string[]).includes(k);
}

function mergeAdvisorPrefs(
  raw: AdvisorFundLibraryValue | null | undefined,
  allowedKeys: string[],
): AdvisorFundLibraryValue {
  const allowedSet = new Set(allowedKeys);
  const storedOrder = (raw?.order ?? []).filter((k) => allowedSet.has(k));
  const missing = allowedKeys.filter((k) => !storedOrder.includes(k));
  const order = [...storedOrder, ...missing];
  const enabled: Record<string, boolean> = {};
  for (const k of order) {
    enabled[k] = raw?.enabled?.[k] !== false;
  }
  return { order, enabled };
}

/**
 * Snapshot pro FA + Nastavení. Chybějící řádek tenant allowlist = všechny fondy z katalogu.
 * Chybějící advisor řádek = default merge (všechna povolená, zapnuté).
 */
export async function getFundLibrarySetupSnapshot(
  tenantId: string,
  userId: string,
  roleName: RoleName,
): Promise<FundLibrarySetupSnapshot> {
  const canEditTenantAllowlist = isRoleAtLeast(roleName, "Director");

  const [tenantRow] = await db
    .select({ value: tenantSettings.value })
    .from(tenantSettings)
    .where(
      and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, TENANT_ALLOWLIST_KEY)),
    )
    .limit(1);

  const rawAllow = (tenantRow?.value ?? null) as TenantFundAllowlistValue | null;
  const rawList = rawAllow?.allowedBaseFundKeys;
  /** undefined / missing row = všechny; explicitní pole (i prázdné) = jen vyjmenované */
  const allowKeys: string[] | null = rawList === undefined || rawList === null ? null : rawList.filter(isValidBaseFundKey);

  const catalogKeys = BASE_FUNDS.filter((f) => f.isActive).map((f) => f.baseFundKey);
  const effectiveAllowedKeys =
    allowKeys === null ? catalogKeys : catalogKeys.filter((k) => allowKeys.includes(k));

  const [prefRow] = await db
    .select({ fundLibrary: advisorPreferences.fundLibrary })
    .from(advisorPreferences)
    .where(and(eq(advisorPreferences.tenantId, tenantId), eq(advisorPreferences.userId, userId)))
    .limit(1);

  const advisorPrefs = mergeAdvisorPrefs(prefRow?.fundLibrary ?? undefined, effectiveAllowedKeys);

  const catalog = BASE_FUNDS.filter((f) => f.isActive)
    .slice()
    .sort((a, b) => {
      const ia = CATALOG_ORDER.indexOf(a.baseFundKey);
      const ib = CATALOG_ORDER.indexOf(b.baseFundKey);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    })
    .map((f) => ({
      baseFundKey: f.baseFundKey,
      displayName: f.displayName,
      provider: f.provider,
      category: f.category,
      subcategory: f.subcategory,
      logoPath: f.assets.logoPath,
    })) satisfies FundCatalogListItemDTO[];

  return {
    canEditTenantAllowlist,
    tenantAllowlist: {
      allowedBaseFundKeys: allowKeys === null ? null : [...allowKeys],
    },
    advisorPrefs,
    effectiveAllowedKeys,
    catalog,
  };
}
