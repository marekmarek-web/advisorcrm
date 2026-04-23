import "server-only";

import {
  referralRequests,
  contacts,
  tenants,
  eq,
  and,
  sql,
} from "db";
import { dbService, withServiceTenantContext } from "@/lib/db/service-db";

export type ReferralTokenContext = {
  tenantId: string;
  tenantName: string;
  advisorFirstName: string | null;
  advisorLastName: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  isExpired: boolean;
  isSubmitted: boolean;
  referralId: string;
};

export async function resolveReferralByToken(token: string): Promise<ReferralTokenContext | null> {
  const cleaned = token.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(cleaned)) return null;

  // Používáme service DB bez RLS — token je uniq a public.
  const rows = (await dbService.execute(sql`
    SELECT
      r.id, r.tenant_id AS "tenantId",
      r.submitted_at AS "submittedAt",
      r.expires_at AS "expiresAt",
      c.first_name AS "contactFirstName",
      c.last_name AS "contactLastName",
      t.name AS "tenantName"
    FROM referral_requests r
    JOIN contacts c ON c.id = r.contact_id
    JOIN tenants t ON t.id = r.tenant_id
    WHERE r.token = ${cleaned}
    LIMIT 1
  `)) as unknown as Array<{
    id: string;
    tenantId: string;
    submittedAt: Date | null;
    expiresAt: Date;
    contactFirstName: string | null;
    contactLastName: string | null;
    tenantName: string;
  }>;
  const row = rows[0];
  if (!row) return null;

  return {
    referralId: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    advisorFirstName: null,
    advisorLastName: null,
    contactFirstName: row.contactFirstName,
    contactLastName: row.contactLastName,
    isExpired: row.expiresAt.getTime() < Date.now(),
    isSubmitted: !!row.submittedAt,
  };
}

export async function markReferralOpened(token: string): Promise<void> {
  const cleaned = token.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(cleaned)) return;
  await dbService.execute(sql`
    UPDATE referral_requests
    SET opened_at = coalesce(opened_at, now()),
        status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END,
        updated_at = now()
    WHERE token = ${cleaned}
  `);
}

export async function submitReferral(
  token: string,
  payload: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    note: string | null;
    consent: boolean;
  },
): Promise<{ ok: true }> {
  const cleaned = token.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(cleaned)) throw new Error("Neplatný odkaz.");
  if (!payload.consent) throw new Error("Pro odeslání je nutný souhlas.");
  if (!payload.firstName.trim() || !payload.lastName.trim()) {
    throw new Error("Zadejte jméno a příjmení.");
  }
  if (!payload.email && !payload.phone) {
    throw new Error("Zadejte alespoň e-mail nebo telefon.");
  }

  // Najdi request
  const rows = (await dbService.execute(sql`
    SELECT id, tenant_id AS "tenantId", submitted_at AS "submittedAt", expires_at AS "expiresAt"
    FROM referral_requests
    WHERE token = ${cleaned}
    LIMIT 1
  `)) as unknown as Array<{
    id: string;
    tenantId: string;
    submittedAt: Date | null;
    expiresAt: Date;
  }>;
  const row = rows[0];
  if (!row) throw new Error("Odkaz nebyl nalezen.");
  if (row.submittedAt) throw new Error("Doporučení již bylo odesláno.");
  if (row.expiresAt.getTime() < Date.now()) throw new Error("Odkaz vypršel.");

  await withServiceTenantContext({ tenantId: row.tenantId }, async (tx) => {
    const [newContact] = await tx
      .insert(contacts)
      .values({
        tenantId: row.tenantId,
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        email: payload.email?.trim() || null,
        phone: payload.phone?.trim() || null,
        notes: payload.note?.trim() || null,
        tags: ["lead", "referral"],
        leadSource: "referral",
        sourceKind: "manual",
      })
      .returning({ id: contacts.id });

    await tx
      .update(referralRequests)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        submittedContactId: newContact!.id,
        updatedAt: new Date(),
      })
      .where(and(eq(referralRequests.token, cleaned)));
  });

  return { ok: true };
}
