"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { contacts, contracts, opportunities, events } from "db";
import { eq, and, or, sql } from "db";

export type SearchResult = {
  contacts: Array<{ id: string; name: string; email: string | null }>;
  contracts: Array<{ id: string; label: string; contactId: string }>;
  opportunities: Array<{ id: string; title: string }>;
  events: Array<{ id: string; title: string; startAt: Date }>;
};

export async function globalSearch(query: string): Promise<SearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { contacts: [], contracts: [], opportunities: [], events: [] };
  }

  const auth = await requireAuthInAction();
  const pattern = `%${trimmed}%`;

  const [contactRows, contractRows, opportunityRows, eventRows] =
    await Promise.all([
      db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, auth.tenantId),
            or(
              sql`${contacts.firstName} ILIKE ${pattern}`,
              sql`${contacts.lastName} ILIKE ${pattern}`,
              sql`${contacts.email} ILIKE ${pattern}`,
              sql`${contacts.phone} ILIKE ${pattern}`,
            ),
          ),
        )
        .limit(5),

      db
        .select({
          id: contracts.id,
          contractNumber: contracts.contractNumber,
          partnerName: contracts.partnerName,
          productName: contracts.productName,
          contactId: contracts.contactId,
        })
        .from(contracts)
        .where(
          and(
            eq(contracts.tenantId, auth.tenantId),
            or(
              sql`${contracts.contractNumber} ILIKE ${pattern}`,
              sql`${contracts.partnerName} ILIKE ${pattern}`,
              sql`${contracts.productName} ILIKE ${pattern}`,
            ),
          ),
        )
        .limit(5),

      db
        .select({
          id: opportunities.id,
          title: opportunities.title,
        })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.tenantId, auth.tenantId),
            sql`${opportunities.title} ILIKE ${pattern}`,
          ),
        )
        .limit(5),

      db
        .select({
          id: events.id,
          title: events.title,
          startAt: events.startAt,
        })
        .from(events)
        .where(
          and(
            eq(events.tenantId, auth.tenantId),
            sql`${events.title} ILIKE ${pattern}`,
          ),
        )
        .limit(5),
    ]);

  return {
    contacts: contactRows.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
    })),
    contracts: contractRows.map((c) => ({
      id: c.id,
      label: [c.partnerName, c.productName, c.contractNumber]
        .filter(Boolean)
        .join(" – "),
      contactId: c.contactId,
    })),
    opportunities: opportunityRows,
    events: eventRows,
  };
}
