"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db, contacts, households, householdMembers, financialAnalyses, faSyncLog, eq, and, isNull } from "db";
import { createContact } from "./contacts";
import { buildSyncPreview, type ExistingContactForDedup, type FaSyncPersonPreview, type FaSyncPreview } from "@/lib/analyses/financial/contactSync";
import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";

export async function getFaSyncPreview(analysisId: string): Promise<FaSyncPreview | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const [fa] = await db
    .select({ payload: financialAnalyses.payload, contactId: financialAnalyses.contactId, householdId: financialAnalyses.householdId })
    .from(financialAnalyses)
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, analysisId)))
    .limit(1);
  if (!fa) return null;

  const data = (fa.payload as { data?: FinancialAnalysisData })?.data;
  if (!data) return null;

  const existingContacts = await db
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
}

type SyncFaToContactsParams = {
  analysisId: string;
  selectedPersonIndices: number[];
  createHousehold: boolean;
  householdName?: string;
};

type SyncFaToContactsResult = {
  contactIds: { faRole: string; contactId: string; created: boolean }[];
  householdId: string | null;
};

export async function syncFaToContacts(params: SyncFaToContactsParams): Promise<SyncFaToContactsResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const [fa] = await db
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

  const existingContacts = await db
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

  const results: SyncFaToContactsResult["contactIds"] = [];
  let primaryContactId: string | null = null;

  for (let i = 0; i < preview.persons.length; i++) {
    if (!params.selectedPersonIndices.includes(i)) continue;
    const person = preview.persons[i];

    let contactId: string | null = person.matchedContactId ?? null;
    let created = false;

    if (contactId) {
      await db
        .update(contacts)
        .set({
          ...(person.email && { email: person.email }),
          ...(person.phone && { phone: person.phone }),
          ...(person.birthDate && { birthDate: person.birthDate }),
          ...(person.personalId && { personalId: person.personalId }),
          ...(person.occupation && { title: person.occupation }),
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)));
    } else {
      const notes: string[] = [];
      if (person.sports) notes.push(`Sporty: ${person.sports}`);

      contactId = await createContact({
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
      created = true;
    }

    if (contactId) {
      results.push({ faRole: person.faRole, contactId, created });
      if (person.faRole === "primary") primaryContactId = contactId;
    }
  }

  let householdId: string | null = fa.householdId;

  if (params.createHousehold && results.length > 1) {
    const [row] = await db
      .insert(households)
      .values({ tenantId: auth.tenantId, name: params.householdName?.trim() || "Domácnost" })
      .returning({ id: households.id });
    householdId = row?.id ?? null;

    if (householdId) {
      for (const r of results) {
        const role = r.faRole === "primary" ? "primary" : r.faRole;
        const existing = await db
          .select({ id: householdMembers.id })
          .from(householdMembers)
          .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.contactId, r.contactId)))
          .limit(1);
        if (!existing.length) {
          await db.insert(householdMembers).values({ householdId, contactId: r.contactId, role });
        }
      }
    }
  } else if (householdId && results.length > 0) {
    for (const r of results) {
      const existing = await db
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.contactId, r.contactId)))
        .limit(1);
      if (!existing.length) {
        const role = r.faRole === "primary" ? "primary" : r.faRole;
        await db.insert(householdMembers).values({ householdId, contactId: r.contactId, role });
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
    await db
      .update(financialAnalyses)
      .set({ ...updatePayload, updatedAt: new Date(), updatedBy: auth.userId } as typeof financialAnalyses.$inferInsert)
      .where(eq(financialAnalyses.id, params.analysisId));
  }

  await db.insert(faSyncLog).values({
    tenantId: auth.tenantId,
    analysisId: params.analysisId,
    syncedBy: auth.userId,
    contactsCreated: results as unknown as typeof faSyncLog.$inferInsert.contactsCreated,
    householdId,
  });

  return { contactIds: results, householdId };
}
