"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db, insurerTerminationRegistry, or, eq, isNull, and, asc } from "db";

export type InsurerRegistryAdminRow = {
  id: string;
  tenantId: string | null;
  catalogKey: string;
  insurerName: string;
  registryNeedsVerification: boolean;
  officialFormNotes: string | null;
  webFormUrl: string | null;
  email: string | null;
  dataBox: string | null;
  mailingAddress: Record<string, unknown> | null;
  freeformLetterAllowed: boolean;
  requiresOfficialForm: boolean;
  active: boolean;
};

export type ListRegistryResponse = { ok: true; rows: InsurerRegistryAdminRow[] } | { ok: false; error: string };

export async function listInsurerTerminationRegistryAdmin(): Promise<ListRegistryResponse> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "settings:write")) {
    return { ok: false, error: "Vyžadováno oprávnění nastavení (Admin)." };
  }

  const rows = await db
    .select({
      id: insurerTerminationRegistry.id,
      tenantId: insurerTerminationRegistry.tenantId,
      catalogKey: insurerTerminationRegistry.catalogKey,
      insurerName: insurerTerminationRegistry.insurerName,
      registryNeedsVerification: insurerTerminationRegistry.registryNeedsVerification,
      officialFormNotes: insurerTerminationRegistry.officialFormNotes,
      webFormUrl: insurerTerminationRegistry.webFormUrl,
      email: insurerTerminationRegistry.email,
      dataBox: insurerTerminationRegistry.dataBox,
      mailingAddress: insurerTerminationRegistry.mailingAddress,
      freeformLetterAllowed: insurerTerminationRegistry.freeformLetterAllowed,
      requiresOfficialForm: insurerTerminationRegistry.requiresOfficialForm,
      active: insurerTerminationRegistry.active,
    })
    .from(insurerTerminationRegistry)
    .where(
      and(
        eq(insurerTerminationRegistry.active, true),
        or(isNull(insurerTerminationRegistry.tenantId), eq(insurerTerminationRegistry.tenantId, auth.tenantId))
      )
    )
    .orderBy(asc(insurerTerminationRegistry.insurerName));

  return {
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      mailingAddress: (r.mailingAddress as Record<string, unknown> | null) ?? null,
    })),
  };
}

export type UpdateRegistryPayload = {
  id: string;
  registryNeedsVerification?: boolean;
  officialFormNotes?: string | null;
  webFormUrl?: string | null;
  email?: string | null;
  dataBox?: string | null;
  /** JSON objekt adresy (name, street, city, zip, …) */
  mailingAddressJson?: string | null;
};

export type SimpleRegistryOk = { ok: true } | { ok: false; error: string };

export async function updateInsurerTerminationRegistryAdmin(payload: UpdateRegistryPayload): Promise<SimpleRegistryOk> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "settings:write")) {
    return { ok: false, error: "Vyžadováno oprávnění nastavení (Admin)." };
  }

  const [row] = await db
    .select({
      id: insurerTerminationRegistry.id,
      tenantId: insurerTerminationRegistry.tenantId,
    })
    .from(insurerTerminationRegistry)
    .where(eq(insurerTerminationRegistry.id, payload.id))
    .limit(1);
  if (!row) return { ok: false, error: "Záznam nenalezen." };

  if (row.tenantId === null && auth.roleName !== "Admin") {
    return { ok: false, error: "Globální katalog může upravovat jen role Admin." };
  }
  if (row.tenantId !== null && row.tenantId !== auth.tenantId) {
    return { ok: false, error: "Záznam nepatří k vašemu tenantovi." };
  }

  let mailingAddress: Record<string, unknown> | undefined;
  if (payload.mailingAddressJson !== undefined) {
    const raw = payload.mailingAddressJson?.trim();
    if (!raw) {
      mailingAddress = {};
    } else {
      try {
        mailingAddress = JSON.parse(raw) as Record<string, unknown>;
        if (!mailingAddress || typeof mailingAddress !== "object" || Array.isArray(mailingAddress)) {
          return { ok: false, error: "mailingAddress musí být JSON objekt." };
        }
      } catch {
        return { ok: false, error: "Neplatný JSON u adresy." };
      }
    }
  }

  await db
    .update(insurerTerminationRegistry)
    .set({
      ...(payload.registryNeedsVerification !== undefined
        ? { registryNeedsVerification: payload.registryNeedsVerification }
        : {}),
      ...(payload.officialFormNotes !== undefined ? { officialFormNotes: payload.officialFormNotes } : {}),
      ...(payload.webFormUrl !== undefined ? { webFormUrl: payload.webFormUrl } : {}),
      ...(payload.email !== undefined ? { email: payload.email } : {}),
      ...(payload.dataBox !== undefined ? { dataBox: payload.dataBox } : {}),
      ...(mailingAddress !== undefined ? { mailingAddress } : {}),
      updatedAt: new Date(),
    })
    .where(eq(insurerTerminationRegistry.id, payload.id));

  return { ok: true };
}
