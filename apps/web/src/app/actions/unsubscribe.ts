"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { db } from "db";
import { contacts } from "db";
import { eq, and, sql } from "db";

/** Klient se odhlásí z e-mailových notifikací (využije auth.contactId). */
export async function unsubscribeFromNotifications(): Promise<{ ok: true } | { ok: false; error: string }> {
  return withAuthContext(async (auth, tx) => {
    if (auth.roleName !== "Client" || !auth.contactId) return { ok: false, error: "Pouze pro přihlášené klienty" };
    await tx
      .update(contacts)
      .set({ notificationUnsubscribedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, auth.contactId)));
    return { ok: true };
  });
}

/**
 * Odhlášení pomocí tokenu z e-mailu (bez přihlášení).
 *
 * Pre-auth flow: token přijde z footeru public e-mailu, neznáme user ani tenant.
 * Po cutoveru runtime na `aidvisora_app` (NOBYPASSRLS, FORCE RLS) by raw `db.*`
 * volání proti `unsubscribe_tokens` / `contacts` bez GUC vrátil 0 řádků. Proto
 * používáme SECURITY DEFINER funkci `public.process_unsubscribe_by_token_v1`
 * (viz rls-m9-bootstrap-sd-functions), která atomicky ověří token + expiraci +
 * not-used, stampne `contact.notification_unsubscribed_at` i `token.used_at`
 * a vrátí strukturovaný výsledek.
 */
export async function unsubscribeByToken(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  type ProcessRow = {
    ok: boolean;
    error_code: string | null;
    contact_id: string | null;
    tenant_id: string | null;
  };
  const rows = (await db.execute(
    sql`select ok, error_code, contact_id, tenant_id
        from public.process_unsubscribe_by_token_v1(${token}::text)`,
  )) as unknown as ProcessRow[];
  const row = rows[0];
  if (!row) return { ok: false, error: "Neplatný nebo již použitý odkaz" };
  if (row.ok) return { ok: true };
  const code = row.error_code ?? "unknown";
  switch (code) {
    case "invalid_token":
    case "not_found":
    case "expired":
    case "already_used":
      return { ok: false, error: "Neplatný nebo již použitý odkaz" };
    default:
      return { ok: false, error: "Odhlášení se nezdařilo" };
  }
}
