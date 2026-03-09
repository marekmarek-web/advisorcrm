"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { contacts } from "db";
import { eq, and, asc, inArray } from "db";

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  referralSource: string | null;
  referralContactId: string | null;
  referralContactName?: string | null;
  birthDate?: string | null;
  personalId?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  tags?: string[] | null;
  lifecycleStage?: string | null;
  leadSource?: string | null;
  leadSourceUrl?: string | null;
  priority?: string | null;
  avatarUrl?: string | null;
  serviceCycleMonths?: string | null;
  lastServiceDate?: string | null;
  nextServiceDue?: string | null;
  gdprConsentAt?: Date | null;
};

export async function getContactsList(): Promise<ContactRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      title: contacts.title,
      referralSource: contacts.referralSource,
      referralContactId: contacts.referralContactId,
      tags: contacts.tags,
      lifecycleStage: contacts.lifecycleStage,
      leadSource: contacts.leadSource,
      leadSourceUrl: contacts.leadSourceUrl,
    })
    .from(contacts)
    .where(eq(contacts.tenantId, auth.tenantId))
    .orderBy(asc(contacts.lastName), asc(contacts.firstName));
  return rows;
}

function escapeCsvCell(s: string | null | undefined): string {
  if (s == null) return "";
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export async function exportContactsCsv(): Promise<string> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      city: contacts.city,
      lifecycleStage: contacts.lifecycleStage,
    })
    .from(contacts)
    .where(eq(contacts.tenantId, auth.tenantId))
    .orderBy(asc(contacts.lastName), asc(contacts.firstName));

  const header = "Jméno,Příjmení,E-mail,Telefon,Město,Fáze";
  const lines = rows.map(
    (r) =>
      [
        escapeCsvCell(r.firstName),
        escapeCsvCell(r.lastName),
        escapeCsvCell(r.email),
        escapeCsvCell(r.phone),
        escapeCsvCell(r.city),
        escapeCsvCell(r.lifecycleStage),
      ].join(",")
  );
  return [header, ...lines].join("\r\n");
}

export async function getContact(id: string): Promise<ContactRow | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      title: contacts.title,
      referralSource: contacts.referralSource,
      referralContactId: contacts.referralContactId,
      birthDate: contacts.birthDate,
      personalId: contacts.personalId,
      street: contacts.street,
      city: contacts.city,
      zip: contacts.zip,
      tags: contacts.tags,
      lifecycleStage: contacts.lifecycleStage,
      leadSource: contacts.leadSource,
      leadSourceUrl: contacts.leadSourceUrl,
      priority: contacts.priority,
      avatarUrl: contacts.avatarUrl,
      serviceCycleMonths: contacts.serviceCycleMonths,
      lastServiceDate: contacts.lastServiceDate,
      nextServiceDue: contacts.nextServiceDue,
      gdprConsentAt: contacts.gdprConsentAt,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.referralContactId) {
    const [refContact] = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, row.referralContactId!)))
      .limit(1);
    return {
      ...row,
      referralContactName: refContact ? `${refContact.firstName} ${refContact.lastName}` : null,
    };
  }
  return { ...row, referralContactName: null };
}

export async function createContact(form: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  referralSource?: string;
  referralContactId?: string;
  birthDate?: string;
  personalId?: string;
  street?: string;
  city?: string;
  zip?: string;
  tags?: string[];
  lifecycleStage?: string;
  leadSource?: string;
  leadSourceUrl?: string;
  priority?: string;
}) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const [row] = await db
    .insert(contacts)
    .values({
      tenantId: auth.tenantId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      title: form.title?.trim() || null,
      referralSource: form.referralSource?.trim() || null,
      referralContactId: form.referralContactId || null,
      birthDate: form.birthDate || null,
      personalId: form.personalId?.trim() || null,
      street: form.street?.trim() || null,
      city: form.city?.trim() || null,
      zip: form.zip?.trim() || null,
      tags: form.tags?.length ? form.tags : null,
      lifecycleStage: form.lifecycleStage || null,
      leadSource: form.leadSource?.trim() || null,
      leadSourceUrl: form.leadSourceUrl?.trim() || null,
      priority: form.priority?.trim() || null,
    })
    .returning({ id: contacts.id });
  return row?.id ?? null;
}

/** Client-only self-update: limited to phone, email, street, city, zip. */
export async function clientUpdateProfile(form: {
  phone?: string;
  email?: string;
  street?: string;
  city?: string;
  zip?: string;
}) {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) throw new Error("Forbidden");
  await db
    .update(contacts)
    .set({
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      street: form.street?.trim() || null,
      city: form.city?.trim() || null,
      zip: form.zip?.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, auth.contactId)));
}

export async function updateContact(
  id: string,
  form: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    title?: string;
    referralSource?: string;
    referralContactId?: string;
    birthDate?: string;
    personalId?: string;
    street?: string;
    city?: string;
    zip?: string;
    tags?: string[];
    lifecycleStage?: string;
    priority?: string;
    serviceCycleMonths?: string;
    lastServiceDate?: string;
    nextServiceDue?: string;
  }
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .update(contacts)
    .set({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      title: form.title?.trim() || null,
      referralSource: form.referralSource?.trim() || null,
      referralContactId: form.referralContactId || null,
      birthDate: form.birthDate || null,
      personalId: form.personalId?.trim() || null,
      street: form.street?.trim() || null,
      city: form.city?.trim() || null,
      zip: form.zip?.trim() || null,
      tags: form.tags?.length ? form.tags : null,
      lifecycleStage: form.lifecycleStage || null,
      ...(form.priority !== undefined && { priority: form.priority?.trim() || null }),
      ...(form.serviceCycleMonths != null && { serviceCycleMonths: form.serviceCycleMonths || null }),
      ...(form.lastServiceDate != null && { lastServiceDate: form.lastServiceDate || null }),
      ...(form.nextServiceDue != null && { nextServiceDue: form.nextServiceDue || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)));
}

export async function updateContactsLifecycle(ids: string[], lifecycleStage: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  if (ids.length === 0) return;
  await db
    .update(contacts)
    .set({ lifecycleStage: lifecycleStage || null, updatedAt: new Date() })
    .where(and(eq(contacts.tenantId, auth.tenantId), inArray(contacts.id, ids)));
}

export async function addTagToContacts(ids: string[], tag: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  if (ids.length === 0 || !tag.trim()) return;
  const trimmed = tag.trim();
  const rows = await db
    .select({ id: contacts.id, tags: contacts.tags })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), inArray(contacts.id, ids)));
  for (const r of rows) {
    const next = Array.from(new Set([...(r.tags ?? []), trimmed]));
    await db
      .update(contacts)
      .set({ tags: next, updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, r.id)));
  }
}
