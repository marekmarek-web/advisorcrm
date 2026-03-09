"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { contacts, unsubscribeTokens } from "db";
import { eq, and, gt } from "db";

/** Klient se odhlásí z e-mailových notifikací (využije auth.contactId). */
export async function unsubscribeFromNotifications(): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) return { ok: false, error: "Pouze pro přihlášené klienty" };
  await db
    .update(contacts)
    .set({ notificationUnsubscribedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, auth.contactId)));
  return { ok: true };
}

/** Odhlášení pomocí tokenu z e-mailu (bez přihlášení). */
export async function unsubscribeByToken(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(unsubscribeTokens)
    .where(and(eq(unsubscribeTokens.token, token), gt(unsubscribeTokens.expiresAt, new Date())))
    .limit(1);
  if (!row || row.usedAt) return { ok: false, error: "Neplatný nebo již použitý odkaz" };
  await db
    .update(contacts)
    .set({ notificationUnsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, row.contactId));
  await db.update(unsubscribeTokens).set({ usedAt: new Date() }).where(eq(unsubscribeTokens.id, row.id));
  return { ok: true };
}
