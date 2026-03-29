"use server";

import { cache } from "react";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contacts } from "db";
import { eq, and, asc, inArray, isNull, sql } from "db";
import { createAdminClient } from "@/lib/supabase/server";

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
  /** ISO 8601 — serializovatelné pro RSC a klienta (Server Actions vrací string) */
  gdprConsentAt?: string | null;
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
    .where(and(eq(contacts.tenantId, auth.tenantId), isNull(contacts.archivedAt)))
    .orderBy(asc(contacts.lastName), asc(contacts.firstName));
  return rows;
}

/** Počet nearchivovaných kontaktů v tenantovi (např. first-run onboarding). Dedup v rámci jednoho RSC requestu (layout + gate). */
async function loadContactsCount(): Promise<number> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), isNull(contacts.archivedAt)));
  return row?.count ?? 0;
}

export const getContactsCount = cache(loadContactsCount);

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
    .where(and(eq(contacts.tenantId, auth.tenantId), isNull(contacts.archivedAt)))
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

/** RSC-safe: never call toISOString on Invalid Date (RangeError). */
function gdprConsentToIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Drizzle `date` / string sloupce občas dorazí jako Date — sjednotit na YYYY-MM-DD nebo null. */
function dateLikeToOptionalYmd(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value);
  return s || null;
}

function normalizeTagsForRsc(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return null;
  return value.map((t) => String(t));
}

async function loadContact(id: string): Promise<ContactRow | null> {
  const auth = await requireAuthInAction();
  // Neházet — throw rozbije RSC v produkci (obecný digest). Stejně jako missing row → null.
  if (!hasPermission(auth.roleName, "contacts:read")) return null;
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

  let referralContactName: string | null = null;
  if (row.referralContactId) {
    const [refContact] = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, row.referralContactId)))
      .limit(1);
    referralContactName = refContact ? `${refContact.firstName} ${refContact.lastName}` : null;
  }

  // Explicitní plain object — žádný spread z driveru (Date / neočekávané typy) přes RSC.
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    title: row.title,
    referralSource: row.referralSource,
    referralContactId: row.referralContactId,
    referralContactName,
    birthDate: dateLikeToOptionalYmd(row.birthDate),
    personalId: row.personalId,
    street: row.street,
    city: row.city,
    zip: row.zip,
    tags: normalizeTagsForRsc(row.tags),
    lifecycleStage: row.lifecycleStage,
    leadSource: row.leadSource,
    leadSourceUrl: row.leadSourceUrl,
    priority: row.priority,
    avatarUrl: row.avatarUrl,
    serviceCycleMonths: row.serviceCycleMonths,
    lastServiceDate: dateLikeToOptionalYmd(row.lastServiceDate),
    nextServiceDue: dateLikeToOptionalYmd(row.nextServiceDue),
    gdprConsentAt: gdprConsentToIsoOrNull(row.gdprConsentAt),
  };
}

/** Dedup v rámci jednoho requestu; vrací výhradně JSON-kompatibilní ContactRow pro RSC. */
export const getContact = cache(loadContact);

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
  notes?: string;
}) {
  try {
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
        notes: form.notes?.trim() || null,
      })
      .returning({ id: contacts.id });
    return row?.id ?? null;
  } catch (e) {
    console.error("[createContact]", e);
    throw new Error(e instanceof Error ? e.message : "Kontakt se nepodařilo vytvořit.");
  }
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
    avatarUrl?: string | null;
  }
) {
  try {
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
        ...(form.avatarUrl !== undefined && { avatarUrl: form.avatarUrl || null }),
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)));
  } catch (e) {
    console.error("[updateContact]", e);
    throw new Error(e instanceof Error ? e.message : "Kontakt se nepodařilo upravit.");
  }
}

const AVATAR_MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Nahraje profilovou fotku kontaktu do Storage a uloží URL do contacts.avatar_url. */
export async function uploadContactAvatar(contactId: string, formData: FormData): Promise<string | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const file = formData.get("file") as File | null;
  if (!file?.size) throw new Error("Vyberte obrázek");
  if (file.size > AVATAR_MAX_SIZE) throw new Error("Soubor je příliš velký (max 3 MB)");
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("Povolené formáty: JPEG, PNG, WebP, GIF");
  const ext = file.name.replace(/^.*\./, "") || "jpg";
  const path = `${auth.tenantId}/avatars/${contactId}/${Date.now()}.${ext.replace(/[^a-zA-Z0-9]/g, "")}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) {
    const msg = uploadError.message?.toLowerCase().includes("bucket") || uploadError.message?.toLowerCase().includes("not found")
      ? "Úložiště není nastavené. V Supabase vytvořte bucket „documents“."
      : uploadError.message;
    throw new Error(msg);
  }
  const { data: signedData } = await admin.storage
    .from("documents")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  let url: string | null = null;
  if (signedData?.signedUrl) {
    url = signedData.signedUrl;
  } else {
    const { data: urlData } = admin.storage.from("documents").getPublicUrl(path);
    url = urlData?.publicUrl ?? null;
  }
  if (url) {
    await db
      .update(contacts)
      .set({ avatarUrl: url, updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)));
  }
  return url;
}

/** Smaže kontakt. Závislosti (household_members, dokumenty, atd.) řeší DB CASCADE / SET NULL. */
/** @deprecated Use archiveContact instead. Hard delete removed from UI. */
export async function deleteContact(id: string): Promise<void> {
  return archiveContact(id);
}

export async function archiveContact(id: string, reason?: string): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    await db
      .update(contacts)
      .set({
        archivedAt: new Date(),
        archivedReason: reason?.trim() || null,
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)));
  } catch (e) {
    console.error("[archiveContact]", e);
    throw new Error(e instanceof Error ? e.message : "Kontakt se nepodařilo archivovat.");
  }
}

export async function restoreContact(id: string): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    await db
      .update(contacts)
      .set({
        archivedAt: null,
        archivedReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)));
  } catch (e) {
    console.error("[restoreContact]", e);
    throw new Error(e instanceof Error ? e.message : "Kontakt se nepodařilo obnovit.");
  }
}

export async function getContactDependencyCounts(id: string): Promise<{
  contracts: number;
  opportunities: number;
  documents: number;
  tasks: number;
  analyses: number;
}> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const { contracts: contractsTable, opportunities, documents, tasks, financialAnalyses } = await import("db");
  const [c] = await db.select({ count: sql<number>`count(*)::int` }).from(contractsTable).where(and(eq(contractsTable.contactId, id), eq(contractsTable.tenantId, auth.tenantId)));
  const [o] = await db.select({ count: sql<number>`count(*)::int` }).from(opportunities).where(and(eq(opportunities.contactId, id), eq(opportunities.tenantId, auth.tenantId)));
  const [d] = await db.select({ count: sql<number>`count(*)::int` }).from(documents).where(and(eq(documents.contactId, id), eq(documents.tenantId, auth.tenantId)));
  const [t] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(and(eq(tasks.contactId, id), eq(tasks.tenantId, auth.tenantId)));
  const [a] = await db.select({ count: sql<number>`count(*)::int` }).from(financialAnalyses).where(and(eq(financialAnalyses.contactId, id), eq(financialAnalyses.tenantId, auth.tenantId)));
  return {
    contracts: c?.count ?? 0,
    opportunities: o?.count ?? 0,
    documents: d?.count ?? 0,
    tasks: t?.count ?? 0,
    analyses: a?.count ?? 0,
  };
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

/** Nastaví štítky kontaktu (pouze sloupec tags). Pro použití na kartě klienta. */
export async function setContactTags(contactId: string, tags: string[]): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const existing = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
    .limit(1);
  if (existing.length === 0) throw new Error("Kontakt nenalezen");
  const normalized = Array.from(
    new Set(tags.map((t) => t.trim()).filter(Boolean))
  );
  await db
    .update(contacts)
    .set({ tags: normalized.length ? normalized : null, updatedAt: new Date() })
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)));
}
