"use server";

import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { contacts, households, householdMembers, financialAnalyses, faSyncLog, eq, and, isNull } from "db";
import { createContact } from "./contacts";
import { buildSyncPreview, type ExistingContactForDedup, type FaSyncPersonPreview, type FaSyncPreview } from "@/lib/analyses/financial/contactSync";
import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";

export async function getFaSyncPreview(analysisId: string): Promise<FaSyncPreview | null> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    const [fa] = await tx
      .select({ payload: financialAnalyses.payload, contactId: financialAnalyses.contactId, householdId: financialAnalyses.householdId })
      .from(financialAnalyses)
      .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, analysisId)))
      .limit(1);
    if (!fa) return null;

    const data = (fa.payload as { data?: FinancialAnalysisData })?.data;
    if (!data) return null;

    const existingContacts = await tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        birthDate: contacts.birthDate,
        personalId: contacts.personalId,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), isNull(contacts.archivedAt)));

    return buildSyncPreview(
      data,
      existingContacts as ExistingContactForDedup[],
      fa.householdId ?? undefined,
    );
  });
}

type SyncFaToContactsParams = {
  analysisId: string;
  selectedPersonIndices: number[];
  createHousehold: boolean;
  householdName?: string;
  /** Pokud je zadáno, místo vytvoření nové domácnosti přidáme členy do této existující. */
  existingHouseholdId?: string;
};

type SyncFaToContactsResult = {
  contactIds: { faRole: string; contactId: string; created: boolean }[];
  householdId: string | null;
};

export async function syncFaToContacts(params: SyncFaToContactsParams): Promise<SyncFaToContactsResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const prep = await withTenantContextFromAuth(auth, async (tx) => {
    const [fa] = await tx
      .select({
        id: financialAnalyses.id,
        tenantId: financialAnalyses.tenantId,
        payload: financialAnalyses.payload,
        contactId: financialAnalyses.contactId,
        householdId: financialAnalyses.householdId,
      })
      .from(financialAnalyses)
      .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, params.analysisId)))
      .limit(1);
    if (!fa) throw new Error("Analýza nenalezena.");

    const data = (fa.payload as { data?: FinancialAnalysisData })?.data;
    if (!data) throw new Error("Payload analýzy je prázdný.");

    const existingContacts = await tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        birthDate: contacts.birthDate,
        personalId: contacts.personalId,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), isNull(contacts.archivedAt)));

    const preview = buildSyncPreview(data, existingContacts as ExistingContactForDedup[], fa.householdId ?? undefined);
    return { fa, preview };
  });

  const { fa, preview } = prep;

  type PersonAction =
    | { kind: "update"; person: FaSyncPersonPreview; contactId: string }
    | { kind: "created"; person: FaSyncPersonPreview; contactId: string };

  const actions: PersonAction[] = [];
  const results: SyncFaToContactsResult["contactIds"] = [];
  let primaryContactId: string | null = null;

  for (let i = 0; i < preview.persons.length; i++) {
    if (!params.selectedPersonIndices.includes(i)) continue;
    const person = preview.persons[i];

    let contactId: string | null = person.matchedContactId ?? null;
    let created = false;

    if (contactId) {
      actions.push({ kind: "update", person, contactId });
    } else {
      const notes: string[] = [];
      if (person.sports) notes.push(`Sporty: ${person.sports}`);

      const createdResult = await createContact({
        firstName: person.firstName || "Kontakt",
        lastName: person.lastName || (person.faRole === "child" ? `Dítě ${(person.faIndex ?? 0) + 1}` : "."),
        email: person.email,
        phone: person.phone,
        birthDate: person.birthDate,
        personalId: person.personalId,
        title: person.occupation,
        notes: notes.length ? notes.join("\n") : undefined,
        lifecycleStage: person.faRole === "primary" ? "client" : undefined,
      });
      if (!createdResult.ok) {
        throw new Error(createdResult.message);
      }
      contactId = createdResult.id;
      created = true;
      actions.push({ kind: "created", person, contactId });
    }

    if (contactId) {
      results.push({ faRole: person.faRole, contactId, created });
      if (person.faRole === "primary") primaryContactId = contactId;
    }
  }

  const householdId = await withTenantContextFromAuth(auth, async (tx) => {
    for (const action of actions) {
      if (action.kind !== "update") continue;
      const person = action.person;
      await tx
        .update(contacts)
        .set({
          ...(person.email && { email: person.email }),
          ...(person.phone && { phone: person.phone }),
          ...(person.birthDate && { birthDate: person.birthDate }),
          ...(person.personalId && { personalId: person.personalId }),
          ...(person.occupation && { title: person.occupation }),
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, action.contactId)));
    }

    let householdId: string | null = fa.householdId;

    if (params.existingHouseholdId) {
      const [h] = await tx
        .select({ id: households.id })
        .from(households)
        .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, params.existingHouseholdId)))
        .limit(1);
      if (!h) throw new Error("Vybraná domácnost nebyla nalezena.");
      householdId = h.id;
      for (const r of results) {
        const existing = await tx
          .select({ id: householdMembers.id })
          .from(householdMembers)
          .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.contactId, r.contactId)))
          .limit(1);
        if (!existing.length) {
          const role = r.faRole === "primary" ? "primary" : r.faRole;
          await tx.insert(householdMembers).values({ householdId, contactId: r.contactId, role });
        }
      }
    } else if (params.createHousehold && results.length > 1) {
      const [row] = await tx
        .insert(households)
        .values({ tenantId: auth.tenantId, name: params.householdName?.trim() || "Domácnost" })
        .returning({ id: households.id });
      householdId = row?.id ?? null;

      if (householdId) {
        for (const r of results) {
          const role = r.faRole === "primary" ? "primary" : r.faRole;
          const existing = await tx
            .select({ id: householdMembers.id })
            .from(householdMembers)
            .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.contactId, r.contactId)))
            .limit(1);
          if (!existing.length) {
            await tx.insert(householdMembers).values({ householdId, contactId: r.contactId, role });
          }
        }
      }
    } else if (householdId && results.length > 0) {
      for (const r of results) {
        const existing = await tx
          .select({ id: householdMembers.id })
          .from(householdMembers)
          .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.contactId, r.contactId)))
          .limit(1);
        if (!existing.length) {
          const role = r.faRole === "primary" ? "primary" : r.faRole;
          await tx.insert(householdMembers).values({ householdId, contactId: r.contactId, role });
        }
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (primaryContactId) {
      updatePayload.contactId = primaryContactId;
      updatePayload.primaryContactId = primaryContactId;
    }
    if (householdId) updatePayload.householdId = householdId;
    if (Object.keys(updatePayload).length) {
      await tx
        .update(financialAnalyses)
        .set({ ...updatePayload, updatedAt: new Date(), updatedBy: auth.userId } as typeof financialAnalyses.$inferInsert)
        .where(eq(financialAnalyses.id, params.analysisId));
    }

    await tx.insert(faSyncLog).values({
      tenantId: auth.tenantId,
      analysisId: params.analysisId,
      syncedBy: auth.userId,
      contactsCreated: results as unknown as typeof faSyncLog.$inferInsert.contactsCreated,
      householdId,
    });

    return householdId;
  });

  return { contactIds: results, householdId };
}
