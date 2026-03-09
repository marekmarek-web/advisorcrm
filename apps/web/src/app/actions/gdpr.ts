"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { contacts, contracts, documents } from "db";
import { eq, and } from "db";

/** Uložení souhlasu s GDPR (registrace / kontakt). */
export async function recordGdprConsent(contactId: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .update(contacts)
    .set({ gdprConsentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)));
}

/** Export dat kontaktu (pro GDPR – na žádost). Vrátí JSON. */
export async function exportContactData(contactId: string): Promise<Record<string, unknown>> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }
  return doExportContactData(auth.tenantId, contactId);
}

/** Pro Client Zone – export dat přihlášeného klienta (auth.contactId). */
export async function exportContactDataForClient(): Promise<Record<string, unknown>> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) throw new Error("Forbidden");
  return doExportContactData(auth.tenantId, auth.contactId);
}

async function doExportContactData(tenantId: string, contactId: string): Promise<Record<string, unknown>> {
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId))).limit(1);
  if (!contact) throw new Error("Kontakt nenalezen");
  const contractRows = await db.select().from(contracts).where(and(eq(contracts.tenantId, tenantId), eq(contracts.contactId, contactId)));
  const docRows = await db.select({ id: documents.id, name: documents.name, createdAt: documents.createdAt }).from(documents).where(and(eq(documents.tenantId, tenantId), eq(documents.contactId, contactId)));
  return {
    exportDate: new Date().toISOString(),
    contact: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      title: contact.title,
      gdprConsentAt: contact.gdprConsentAt?.toISOString() ?? null,
      notificationUnsubscribedAt: contact.notificationUnsubscribedAt?.toISOString() ?? null,
    },
    contracts: contractRows.map((c) => ({
      segment: c.segment,
      partnerName: c.partnerName,
      productName: c.productName,
      contractNumber: c.contractNumber,
      startDate: c.startDate,
      anniversaryDate: c.anniversaryDate,
    })),
    documents: docRows.map((d) => ({ name: d.name, createdAt: d.createdAt })),
  };
}
