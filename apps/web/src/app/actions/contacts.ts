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

function isRedirectError(e: unknown): boolean {
  const d = typeof e === "object" && e !== null ? (e as { digest?: string }).digest : undefined;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT");
}

/** Sloupce často chybějící na starších DB — bez nich zkusíme dotaz znovu. */
function isPgUndefinedColumn(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "42703";
}

const contactDetailCoreSelect = {
  id: contacts.id,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  email: contacts.email,
  phone: contacts.phone,
  title: contacts.title,
  referralSource: contacts.referralSource,
  referralContactId: contacts.referralContactId,
  birthDate: contacts.birthDate,
  street: contacts.street,
  city: contacts.city,
  zip: contacts.zip,
  tags: contacts.tags,
  lifecycleStage: contacts.lifecycleStage,
  avatarUrl: contacts.avatarUrl,
} as const;

const contactDetailExtendedSelect = {
  ...contactDetailCoreSelect,
  personalId: contacts.personalId,
  leadSource: contacts.leadSource,
  leadSourceUrl: contacts.leadSourceUrl,
  priority: contacts.priority,
  serviceCycleMonths: contacts.serviceCycleMonths,
  lastServiceDate: contacts.lastServiceDate,
  nextServiceDue: contacts.nextServiceDue,
  gdprConsentAt: contacts.gdprConsentAt,
} as const;

async function loadContact(id: string): Promise<ContactRow | null> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:read")) return null;

    let row: Record<string, unknown> | undefined;
    try {
      const rows = await db
        .select(contactDetailExtendedSelect)
        .from(contacts)
        .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)))
        .limit(1);
      row = rows[0] as Record<string, unknown> | undefined;
    } catch (e) {
      if (isRedirectError(e)) throw e;
      if (!isPgUndefinedColumn(e)) throw e;
      console.warn("[getContact] extended columns missing, using core select");
      const rows = await db
        .select(contactDetailCoreSelect)
        .from(contacts)
        .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)))
        .limit(1);
      row = rows[0] as Record<string, unknown> | undefined;
    }

    if (!row) return null;

    const referralContactId = row.referralContactId as string | null;
    let referralContactName: string | null = null;
    if (referralContactId) {
      try {
        const [refContact] = await db
          .select({ firstName: contacts.firstName, lastName: contacts.lastName })
          .from(contacts)
          .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, referralContactId)))
          .limit(1);
        referralContactName = refContact ? `${refContact.firstName} ${refContact.lastName}` : null;
      } catch (refErr) {
        if (isRedirectError(refErr)) throw refErr;
        console.warn("[getContact] referral name lookup failed", refErr);
      }
    }

    return {
      id: row.id as string,
      firstName: row.firstName as string,
      lastName: row.lastName as string,
      email: row.email as string | null,
      phone: row.phone as string | null,
      title: row.title as string | null,
      referralSource: row.referralSource as string | null,
      referralContactId,
      referralContactName,
      birthDate: dateLikeToOptionalYmd(row.birthDate),
      personalId: (row.personalId as string | null | undefined) ?? null,
      street: row.street as string | null,
      city: row.city as string | null,
      zip: row.zip as string | null,
      tags: normalizeTagsForRsc(row.tags),
      lifecycleStage: row.lifecycleStage as string | null,
      leadSource: (row.leadSource as string | null | undefined) ?? null,
      leadSourceUrl: (row.leadSourceUrl as string | null | undefined) ?? null,
      priority: (row.priority as string | null | undefined) ?? null,
      avatarUrl: row.avatarUrl as string | null,
      serviceCycleMonths: (row.serviceCycleMonths as string | null | undefined) ?? null,
      lastServiceDate: dateLikeToOptionalYmd(row.lastServiceDate),
      nextServiceDue: dateLikeToOptionalYmd(row.nextServiceDue),
      gdprConsentAt: gdprConsentToIsoOrNull(row.gdprConsentAt),
    };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("[getContact]", e);
    return null;
  }
}

/** Dedup v rámci jednoho requestu; vrací výhradně JSON-kompatibilní ContactRow pro RSC. */
export const getContact = cache(loadContact);

/** Stejný tvar jako u detailu kontaktu — platné UUID v1–v5 z DB. */
const CONTACT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeOptionalUuid(value: string | undefined): string | null {
  const t = value?.trim();
  if (!t) return null;
  return CONTACT_UUID_RE.test(t) ? t : null;
}

function isPgUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

function pgErrorCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null || !("code" in e)) return undefined;
  const c = (e as { code?: unknown }).code;
  return typeof c === "string" ? c : undefined;
}

/** Postgres: column "foo" of relation "contacts" does not exist */
function pgMissingColumnName(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /column\s+"([^"]+)"\s+of\s+relation\s+"([^"]+)"\s+does\s+not\s+exist/i.exec(msg);
  return m?.[1] ?? null;
}

/**
 * Vrací výsledek místo throw u očekávaných chyb — v produkci Next.js jinak skryje zprávu z Server Action
 * a klient uvidí jen obecný „Server Components render“ text.
 */
export type CreateContactResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

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
}): Promise<CreateContactResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) {
      return { ok: false, message: "Nemáte oprávnění vytvářet kontakty." };
    }
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
        referralContactId: sanitizeOptionalUuid(form.referralContactId),
        birthDate: form.birthDate?.trim() || null,
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
    const id = row?.id;
    if (!id) {
      return { ok: false, message: "Kontakt se nepodařilo vytvořit. Zkuste to znovu." };
    }
    return { ok: true, id };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("[createContact]", e);
    if (isPgUniqueViolation(e)) {
      return { ok: false, message: "V tomto workspace už existuje kontakt se stejným e-mailem." };
    }
    const code = pgErrorCode(e);
    if (code === "23503") {
      return {
        ok: false,
        message:
          "Neplatná vazba v databázi (např. doporučující kontakt). Zkuste odebrat „Doporučen od“ nebo zvolit jiný kontakt.",
      };
    }
    if (code === "42703") {
      const col = pgMissingColumnName(e);
      const hint =
        col != null
          ? `V tabulce contacts chybí sloupec „${col}“. V Supabase SQL Editoru spusťte soubor packages/db/migrations/contacts_columns_app_sync.sql (nebo aktuální packages/db/supabase-schema.sql).`
          : "Schéma databáze v Supabase neodpovídá aplikaci (chybí sloupec). V Supabase SQL Editoru spusťte packages/db/migrations/contacts_columns_app_sync.sql.";
      return { ok: false, message: hint };
    }
    if (code === "23502") {
      return {
        ok: false,
        message: "Uložení se nepovedlo: databáze odmítla záznam (chybí povinné pole). Zkontrolujte migrace.",
      };
    }
    if (e instanceof Error && e.message === "Unauthorized") {
      return { ok: false, message: "Nejste přihlášeni nebo vypršela relace. Obnovte stránku a přihlaste se znovu." };
    }
    if (e instanceof Error && e.message.startsWith("Unauthorized:")) {
      return { ok: false, message: "Tento účet nemůže zakládat kontakty v poradenském portálu." };
    }
    return { ok: false, message: "Kontakt se nepodařilo vytvořit. Zkuste to znovu." };
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
