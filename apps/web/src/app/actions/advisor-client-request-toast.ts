"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { contacts } from "db";
import { and, eq } from "db";

/** Jméno klienta pro toast po novém požadavku z klientské zóny (jen členové tenanta). */
export async function getContactDisplayNameForAdvisorToast(
  contactId: string
): Promise<{ name: string } | { error: string }> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") return { error: "Forbidden" };

  const [row] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
    .limit(1);

  if (!row) return { error: "Nenalezeno" };
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "Klient";
  return { name };
}
