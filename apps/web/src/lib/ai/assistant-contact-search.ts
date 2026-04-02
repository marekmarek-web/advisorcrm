/**
 * Tenant-scoped contact search for the internal AI assistant (no server-action auth).
 */

import { db, contacts, eq, and, or, isNull, sql, desc } from "db";
import { maskPersonalId } from "./assistant-context-builder";

export type AssistantContactMatch = {
  id: string;
  displayName: string;
  hint: string;
};

function emailDomainHint(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  const at = email.indexOf("@");
  if (at <= 0) return null;
  return `…${email.slice(at)}`;
}

function phoneLast4Hint(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const d = phone.replace(/\s/g, "");
  if (d.length < 4) return null;
  return `tel. …${d.slice(-4)}`;
}

function buildHint(row: {
  email: string | null;
  phone: string | null;
  city: string | null;
  personalId: string | null;
}): string {
  const parts: string[] = [];
  const em = emailDomainHint(row.email);
  if (em) parts.push(em);
  if (row.city?.trim()) parts.push(row.city.trim());
  const ph = phoneLast4Hint(row.phone);
  if (ph) parts.push(ph);
  if (row.personalId?.trim()) {
    parts.push(`r.č. ${maskPersonalId(row.personalId)}`);
  }
  return parts.join(" · ") || "—";
}

const DEFAULT_LIMIT = 12;

/**
 * ILIKE search on name parts, full name, email, phone — scoped to tenant, non-archived only.
 */
export async function searchContactsForAssistant(
  tenantId: string,
  rawQuery: string,
  limit = DEFAULT_LIMIT,
): Promise<AssistantContactMatch[]> {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  const pattern = `%${trimmed}%`;

  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      city: contacts.city,
      personalId: contacts.personalId,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        isNull(contacts.archivedAt),
        or(
          sql`concat(${contacts.firstName}, ' ', ${contacts.lastName}) ILIKE ${pattern}`,
          sql`${contacts.firstName} ILIKE ${pattern}`,
          sql`${contacts.lastName} ILIKE ${pattern}`,
          sql`COALESCE(${contacts.email}, '') ILIKE ${pattern}`,
          sql`COALESCE(${contacts.phone}, '') ILIKE ${pattern}`,
        ),
      ),
    )
    .orderBy(desc(contacts.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 25));

  return rows.map((r) => ({
    id: r.id,
    displayName: `${r.firstName} ${r.lastName}`.trim(),
    hint: buildHint({
      email: r.email,
      phone: r.phone,
      city: r.city,
      personalId: r.personalId,
    }),
  }));
}
