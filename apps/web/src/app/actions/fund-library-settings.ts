"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import {
  tenantSettings,
  advisorPreferences,
  fundAddRequests,
  eq,
  and,
  isFundAddRequestStatus,
} from "db";
import type { RoleName } from "@/shared/rolePermissions";
import { isRoleAtLeast } from "@/shared/rolePermissions";
import {
  TENANT_ALLOWLIST_DOMAIN,
  TENANT_ALLOWLIST_KEY,
  type TenantFundAllowlistValue,
  type AdvisorFundLibraryValue,
  type FundAddRequestQueueStatus,
} from "@/lib/fund-library/fund-library-setup-types";
import { BASE_FUND_KEYS, type BaseFundKey } from "@/lib/analyses/financial/fund-library/legacy-fund-key-map";
import { BASE_FUNDS } from "@/lib/analyses/financial/fund-library/base-funds";

function isValidBaseFundKey(k: string): k is BaseFundKey {
  return (BASE_FUND_KEYS as readonly string[]).includes(k);
}

function getCatalogKeys(): BaseFundKey[] {
  return BASE_FUNDS.filter((f) => f.isActive).map((f) => f.baseFundKey);
}

function resolveTenantAllowedKeys(allowlist: TenantFundAllowlistValue | null): string[] {
  const catalogKeys = getCatalogKeys();
  const raw = allowlist?.allowedBaseFundKeys;
  if (raw === undefined || raw === null) return catalogKeys;
  const set = new Set(raw.filter(isValidBaseFundKey));
  return catalogKeys.filter((k) => set.has(k));
}

export async function saveTenantFundAllowlist(allowedBaseFundKeys: string[] | null): Promise<void> {
  await withAuthContext(async (auth, tx) => {
    if (!isRoleAtLeast(auth.roleName as RoleName, "Director")) {
      throw new Error("Pouze Admin nebo Director může upravit seznam fondů na úrovni firmy.");
    }
    const value: TenantFundAllowlistValue =
      allowedBaseFundKeys === null
        ? { allowedBaseFundKeys: null }
        : { allowedBaseFundKeys: [...new Set(allowedBaseFundKeys)].filter(isValidBaseFundKey) };

    const [existing] = await tx
      .select({ id: tenantSettings.id, version: tenantSettings.version })
      .from(tenantSettings)
      .where(
        and(eq(tenantSettings.tenantId, auth.tenantId), eq(tenantSettings.key, TENANT_ALLOWLIST_KEY)),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(tenantSettings)
        .set({
          value: value as unknown as Record<string, unknown>,
          updatedBy: auth.userId,
          updatedAt: new Date(),
          version: (existing.version ?? 0) + 1,
        })
        .where(eq(tenantSettings.id, existing.id));
    } else {
      await tx.insert(tenantSettings).values({
        tenantId: auth.tenantId,
        key: TENANT_ALLOWLIST_KEY,
        value: value as unknown as Record<string, unknown>,
        domain: TENANT_ALLOWLIST_DOMAIN,
        updatedBy: auth.userId,
        version: 1,
      });
    }
  });
}

export async function saveAdvisorFundLibrary(prefs: AdvisorFundLibraryValue): Promise<void> {
  await withAuthContext(async (auth, tx) => {
    const [tenantRow] = await tx
      .select({ value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(eq(tenantSettings.tenantId, auth.tenantId), eq(tenantSettings.key, TENANT_ALLOWLIST_KEY)),
      )
      .limit(1);

    const rawAllow = (tenantRow?.value ?? null) as TenantFundAllowlistValue | null;
    const allowed = resolveTenantAllowedKeys(rawAllow);
    const allowedSet = new Set(allowed);

    const orderFiltered = prefs.order.filter((k) => allowedSet.has(k) && isValidBaseFundKey(k));
    const rest = allowed.filter((k) => !orderFiltered.includes(k));
    const order = [...orderFiltered, ...rest];
    const enabled: Record<string, boolean> = {};
    for (const k of allowed) {
      enabled[k] = prefs.enabled[k] !== false;
    }

    const payload: AdvisorFundLibraryValue = { order, enabled };

    const [existing] = await tx
      .select({ id: advisorPreferences.id })
      .from(advisorPreferences)
      .where(
        and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(advisorPreferences)
        .set({ fundLibrary: payload, updatedAt: new Date() })
        .where(eq(advisorPreferences.id, existing.id));
    } else {
      await tx.insert(advisorPreferences).values({
        userId: auth.userId,
        tenantId: auth.tenantId,
        fundLibrary: payload,
      });
    }
  });
}

export type SubmitFundAddRequestInput = {
  fundName: string;
  provider: string;
  isinOrTicker: string;
  factsheetUrl: string;
  category: string;
  note: string;
};

export async function submitFundAddRequest(input: SubmitFundAddRequestInput): Promise<{ ok: true } | { ok: false; error: string }> {
  return withAuthContext(async (auth, tx) => {
    const fundName = input.fundName?.trim() ?? "";
    if (fundName.length < 2) return { ok: false, error: "Vyplňte název fondu." };

    await tx.insert(fundAddRequests).values({
      tenantId: auth.tenantId,
      userId: auth.userId,
      fundName,
      provider: input.provider?.trim() || null,
      isinOrTicker: input.isinOrTicker?.trim() || null,
      factsheetUrl: input.factsheetUrl?.trim() || null,
      category: input.category?.trim() || null,
      note: input.note?.trim() || null,
      status: "new",
    });

    return { ok: true };
  });
}

export async function updateFundAddRequestStatus(
  requestId: string,
  status: FundAddRequestQueueStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withAuthContext(async (auth, tx) => {
    if (!isRoleAtLeast(auth.roleName as RoleName, "Director")) {
      return { ok: false, error: "Pouze Admin nebo Director může měnit stav požadavků." };
    }
    const id = requestId?.trim();
    if (!id) return { ok: false, error: "Chybí ID požadavku." };
    if (!isFundAddRequestStatus(status)) return { ok: false, error: "Neplatný stav." };

    const [row] = await tx
      .select({ id: fundAddRequests.id })
      .from(fundAddRequests)
      .where(and(eq(fundAddRequests.id, id), eq(fundAddRequests.tenantId, auth.tenantId)))
      .limit(1);

    if (!row) return { ok: false, error: "Požadavek nebyl nalezen." };

    await tx
      .update(fundAddRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(fundAddRequests.id, id));

    return { ok: true };
  });
}
