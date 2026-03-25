"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { paymentAccounts, partners } from "db";
import { eq, and, or, isNull, asc } from "db";

export type PaymentAccountRow = {
  id: string;
  tenantId: string | null;
  partnerId: string | null;
  partnerName: string | null;
  segment: string;
  accountNumber: string;
  bank: string | null;
  note: string | null;
};

/** Globální + tenant override: pro daný partner+segment vrátí tenant záznam nebo globální. */
export async function getPaymentAccountsForTenant(): Promise<PaymentAccountRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const globalRows = await db
    .select()
    .from(paymentAccounts)
    .where(isNull(paymentAccounts.tenantId))
    .orderBy(asc(paymentAccounts.segment), asc(paymentAccounts.partnerName));
  const tenantRows = await db
    .select()
    .from(paymentAccounts)
    .where(eq(paymentAccounts.tenantId, auth.tenantId))
    .orderBy(asc(paymentAccounts.segment), asc(paymentAccounts.partnerName));
  const byKey = new Map<string, PaymentAccountRow>();
  for (const r of globalRows) {
    byKey.set(`${r.partnerId ?? r.partnerName ?? ""}-${r.segment}`, { ...r, tenantId: null });
  }
  for (const r of tenantRows) {
    byKey.set(`${r.partnerId ?? r.partnerName ?? ""}-${r.segment}`, { ...r, tenantId: r.tenantId });
  }
  return Array.from(byKey.values());
}

/** Pro smlouvu najde platební údaj: nejdřív tenant override, pak globální. */
export async function getPaymentAccountForContract(
  tenantId: string,
  partnerId: string | null,
  partnerName: string | null,
  segment: string
): Promise<PaymentAccountRow | null> {
  const tenantRows = await db
    .select()
    .from(paymentAccounts)
    .where(
      and(
        eq(paymentAccounts.tenantId, tenantId),
        eq(paymentAccounts.segment, segment)
      )
    );
  const match = tenantRows.find(
    (r) => (partnerId && r.partnerId === partnerId) || (partnerName && r.partnerName === partnerName)
  );
  if (match) return { ...match, tenantId: match.tenantId };
  const globalRows = await db
    .select()
    .from(paymentAccounts)
    .where(and(isNull(paymentAccounts.tenantId), eq(paymentAccounts.segment, segment)));
  const globalMatch = globalRows.find(
    (r) => (partnerId && r.partnerId === partnerId) || (partnerName && r.partnerName === partnerName)
  );
  return globalMatch ? { ...globalMatch, tenantId: null } : null;
}

export async function createPaymentAccount(form: {
  partnerId?: string;
  partnerName?: string;
  segment: string;
  accountNumber: string;
  bank?: string;
  note?: string;
}) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const [row] = await db
    .insert(paymentAccounts)
    .values({
      tenantId: auth.tenantId,
      partnerId: form.partnerId || null,
      partnerName: form.partnerName?.trim() || null,
      segment: form.segment,
      accountNumber: form.accountNumber.trim(),
      bank: form.bank?.trim() || null,
      note: form.note?.trim() || null,
    })
    .returning({ id: paymentAccounts.id });
  return row?.id ?? null;
}

export async function updatePaymentAccount(
  id: string,
  form: { accountNumber?: string; bank?: string; note?: string }
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .update(paymentAccounts)
    .set({
      ...(form.accountNumber != null && { accountNumber: form.accountNumber.trim() }),
      ...(form.bank != null && { bank: form.bank?.trim() || null }),
      ...(form.note != null && { note: form.note?.trim() || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(paymentAccounts.tenantId, auth.tenantId), eq(paymentAccounts.id, id)));
}

export async function deletePaymentAccount(id: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .delete(paymentAccounts)
    .where(and(eq(paymentAccounts.tenantId, auth.tenantId), eq(paymentAccounts.id, id)));
}
