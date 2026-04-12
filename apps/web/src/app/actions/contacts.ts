"use server";

import { cache } from "react";
import { requireAuthInAction, type AuthContext } from "@/lib/auth/require-auth";
import { getHouseholdIdForContactWithAuth, getHouseholdsListWithAuth } from "@/app/actions/households";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contacts, contractUploadReviews } from "db";
import { eq, and, asc, inArray, isNull, sql, desc, or } from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { parseContractWizardPrefillFromReviewData } from "@/lib/contracts/contact-wizard-prefill-from-ai-review";
import type { ContractFormState } from "@/lib/contracts/contract-form-payload";

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
  /** Číslo občanského průkazu */
  idCardNumber?: string | null;
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
  preferredSalutation?: string | null;
  preferredGreetingName?: string | null;
  greetingStyle?: string | null;
  birthGreetingOptOut?: boolean;
  /** Preferovaný čas kontaktu (volný text z CRM). */
  bestContactTime?: string | null;
  /** Kanál kontaktu (např. email, phone). */
  preferredChannel?: string | null;
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
  idCardNumber: contacts.idCardNumber,
  leadSource: contacts.leadSource,
  leadSourceUrl: contacts.leadSourceUrl,
  priority: contacts.priority,
  serviceCycleMonths: contacts.serviceCycleMonths,
  lastServiceDate: contacts.lastServiceDate,
  nextServiceDue: contacts.nextServiceDue,
  gdprConsentAt: contacts.gdprConsentAt,
  preferredSalutation: contacts.preferredSalutation,
  preferredGreetingName: contacts.preferredGreetingName,
  greetingStyle: contacts.greetingStyle,
  birthGreetingOptOut: contacts.birthGreetingOptOut,
  bestContactTime: contacts.bestContactTime,
  preferredChannel: contacts.preferredChannel,
} as const;

async function loadContactWithAuth(auth: AuthContext, id: string): Promise<ContactRow | null> {
  try {
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
      idCardNumber: (row.idCardNumber as string | null | undefined) ?? null,
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
      preferredSalutation: (row.preferredSalutation as string | null | undefined) ?? null,
      preferredGreetingName: (row.preferredGreetingName as string | null | undefined) ?? null,
      greetingStyle: (row.greetingStyle as string | null | undefined) ?? null,
      birthGreetingOptOut: Boolean(row.birthGreetingOptOut),
      bestContactTime: (row.bestContactTime as string | null | undefined)?.trim() || null,
      preferredChannel: (row.preferredChannel as string | null | undefined)?.trim() || null,
    };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("[getContact]", e);
    return null;
  }
}

async function loadContact(id: string): Promise<ContactRow | null> {
  const auth = await requireAuthInAction();
  return loadContactWithAuth(auth, id);
}

/** Dedup v rámci jednoho requestu; vrací výhradně JSON-kompatibilní ContactRow pro RSC. */
export const getContact = cache(loadContact);

export type ContactNamePickerRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
};

/** Úzký výběr pro dropdown „Doporučen od“ / picker kontaktů (edit stránka, zápisky). */
export async function getContactNamePickerRows(): Promise<ContactNamePickerRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  return db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), isNull(contacts.archivedAt)))
    .orderBy(asc(contacts.lastName), asc(contacts.firstName));
}

export type ContactEditPageBundle = {
  contact: ContactRow | null;
  householdId: string | null;
  referralPicker: { id: string; label: string }[];
  householdOptions: { id: string; name: string }[];
};

/** Jeden round-trip pro portal edit kontaktu (kontakt + domácnost + pickery). */
export async function getContactEditPageData(contactId: string): Promise<ContactEditPageBundle> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const [contact, householdId, pickerRows, householdRows] = await Promise.all([
    loadContactWithAuth(auth, contactId),
    getHouseholdIdForContactWithAuth(auth, contactId),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), isNull(contacts.archivedAt)))
      .orderBy(asc(contacts.lastName), asc(contacts.firstName)),
    getHouseholdsListWithAuth(auth),
  ]);
  return {
    contact,
    householdId,
    referralPicker: pickerRows
      .filter((r) => r.id !== contactId)
      .map((r) => ({ id: r.id, label: `${r.firstName} ${r.lastName}` })),
    householdOptions: householdRows.map((h) => ({ id: h.id, name: h.name })),
  };
}

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
  idCardNumber?: string;
  street?: string;
  city?: string;
  zip?: string;
  tags?: string[];
  lifecycleStage?: string;
  leadSource?: string;
  leadSourceUrl?: string;
  priority?: string;
  notes?: string;
  preferredSalutation?: string;
  preferredGreetingName?: string;
  greetingStyle?: string;
  birthGreetingOptOut?: boolean;
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
        idCardNumber: form.idCardNumber?.trim() || null,
        street: form.street?.trim() || null,
        city: form.city?.trim() || null,
        zip: form.zip?.trim() || null,
        tags: form.tags?.length ? form.tags : null,
        lifecycleStage: form.lifecycleStage || null,
        leadSource: form.leadSource?.trim() || null,
        leadSourceUrl: form.leadSourceUrl?.trim() || null,
        priority: form.priority?.trim() || null,
        notes: form.notes?.trim() || null,
        preferredSalutation: form.preferredSalutation?.trim() || null,
        preferredGreetingName: form.preferredGreetingName?.trim() || null,
        greetingStyle: form.greetingStyle?.trim() || null,
        birthGreetingOptOut: form.birthGreetingOptOut === true,
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
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    title?: string;
    referralSource?: string;
    referralContactId?: string;
    birthDate?: string;
    personalId?: string;
    idCardNumber?: string;
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
    preferredSalutation?: string | null;
    preferredGreetingName?: string | null;
    greetingStyle?: string | null;
    birthGreetingOptOut?: boolean;
  }
) {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(form, key);
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (hasOwn("firstName")) {
      const value = form.firstName?.trim();
      if (!value) throw new Error("Jméno nesmí být prázdné.");
      patch.firstName = value;
    }
    if (hasOwn("lastName")) {
      const value = form.lastName?.trim();
      if (!value) throw new Error("Příjmení nesmí být prázdné.");
      patch.lastName = value;
    }
    if (hasOwn("email")) patch.email = form.email?.trim() || null;
    if (hasOwn("phone")) patch.phone = form.phone?.trim() || null;
    if (hasOwn("title")) patch.title = form.title?.trim() || null;
    if (hasOwn("referralSource")) patch.referralSource = form.referralSource?.trim() || null;
    if (hasOwn("referralContactId")) patch.referralContactId = form.referralContactId || null;
    if (hasOwn("birthDate")) patch.birthDate = form.birthDate || null;
    if (hasOwn("personalId")) patch.personalId = form.personalId?.trim() || null;
    if (hasOwn("idCardNumber")) patch.idCardNumber = form.idCardNumber?.trim() || null;
    if (hasOwn("street")) patch.street = form.street?.trim() || null;
    if (hasOwn("city")) patch.city = form.city?.trim() || null;
    if (hasOwn("zip")) patch.zip = form.zip?.trim() || null;
    if (hasOwn("tags")) patch.tags = form.tags?.length ? form.tags : null;
    if (hasOwn("lifecycleStage")) patch.lifecycleStage = form.lifecycleStage || null;
    if (hasOwn("priority")) patch.priority = form.priority?.trim() || null;
    if (hasOwn("serviceCycleMonths")) patch.serviceCycleMonths = form.serviceCycleMonths || null;
    if (hasOwn("lastServiceDate")) patch.lastServiceDate = form.lastServiceDate || null;
    if (hasOwn("nextServiceDue")) patch.nextServiceDue = form.nextServiceDue || null;
    if (hasOwn("avatarUrl")) patch.avatarUrl = form.avatarUrl || null;
    if (hasOwn("preferredSalutation")) patch.preferredSalutation = form.preferredSalutation?.trim() || null;
    if (hasOwn("preferredGreetingName")) patch.preferredGreetingName = form.preferredGreetingName?.trim() || null;
    if (hasOwn("greetingStyle")) patch.greetingStyle = form.greetingStyle?.trim() || null;
    if (hasOwn("birthGreetingOptOut")) patch.birthGreetingOptOut = form.birthGreetingOptOut;

    if (Object.keys(patch).length === 1) {
      throw new Error("Nebylo předáno žádné pole k aktualizaci kontaktu.");
    }

    await db
      .update(contacts)
      .set(patch)
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

/** Trvalé smazání řádků kontaktu (CASCADE / SET NULL v DB). Vyžaduje `contacts:delete`. */
export async function permanentlyDeleteContacts(ids: string[]): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:delete")) throw new Error("Forbidden");
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), inArray(contacts.id, unique)));
  if (rows.length !== unique.length) {
    throw new Error("Některé kontakty neexistují nebo k nim nemáte přístup.");
  }

  const admin = createAdminClient();
  const prefix = `${auth.tenantId}/avatars/`;
  for (const row of rows) {
    try {
      const folder = `${prefix}${row.id}`;
      const { data: files } = await admin.storage.from("documents").list(folder);
      if (files?.length) {
        const paths = files.map((f) => `${folder}/${f.name}`);
        await admin.storage.from("documents").remove(paths);
      }
    } catch (e) {
      console.warn("[permanentlyDeleteContacts] avatar storage cleanup", row.id, e);
    }
  }

  try {
    await db.delete(contacts).where(and(eq(contacts.tenantId, auth.tenantId), inArray(contacts.id, unique)));
  } catch (e) {
    console.error("[permanentlyDeleteContacts]", e);
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
    if (code === "23503") {
      throw new Error("Kontakt nelze smazat kvůli vazbám v databázi. Zkuste nejdřív odstranit související záznamy.");
    }
    throw new Error(e instanceof Error ? e.message : "Kontakty se nepodařilo smazat.");
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
  const [[c], [o], [d], [t], [a]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contractsTable)
      .where(and(eq(contractsTable.contactId, id), eq(contractsTable.tenantId, auth.tenantId))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(and(eq(opportunities.contactId, id), eq(opportunities.tenantId, auth.tenantId))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(and(eq(documents.contactId, id), eq(documents.tenantId, auth.tenantId))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.contactId, id), eq(tasks.tenantId, auth.tenantId))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(financialAnalyses)
      .where(and(eq(financialAnalyses.contactId, id), eq(financialAnalyses.tenantId, auth.tenantId))),
  ]);
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
  await Promise.all(
    rows.map((r) => {
      const next = Array.from(new Set([...(r.tags ?? []), trimmed]));
      return db
        .update(contacts)
        .set({ tags: next, updatedAt: new Date() })
        .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, r.id)));
    })
  );
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

/**
 * Fáze 13: Contact-level AI provenance.
 * Najde poslední applied review, které vytvořilo nebo linkovalo daný kontakt.
 * Vrací per-field provenance pro contact identity pole.
 */
export type ContactAiProvenanceResult = {
  reviewId: string;
  appliedAt: string | null;
  /** Pole potvrzená poradcem (z confirmedFieldsTrace, scope="contact") */
  confirmedFields: string[];
  /** Pole auto-aplikovaná z AI Review (z policyEnforcementTrace.contactEnforcement.autoAppliedFields) */
  autoAppliedFields: string[];
  /** Pole čekající na potvrzení poradcem (prefill_confirm policy) */
  pendingFields: string[];
  /** Pole vyžadující ruční doplnění (manual_required policy) */
  manualRequiredFields: string[];
} | null;

async function loadContactAiProvenance(contactId: string): Promise<ContactAiProvenanceResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:read")) return null;

    const rows = await db
      .select({
        id: contractUploadReviews.id,
        appliedAt: contractUploadReviews.appliedAt,
        matchedClientId: contractUploadReviews.matchedClientId,
        applyResultPayload: contractUploadReviews.applyResultPayload,
      })
      .from(contractUploadReviews)
      .where(
        and(
          eq(contractUploadReviews.tenantId, auth.tenantId),
          eq(contractUploadReviews.reviewStatus, "applied"),
          or(
            eq(contractUploadReviews.matchedClientId, contactId),
            sql`${contractUploadReviews.applyResultPayload}->>'createdClientId' = ${contactId}`,
            sql`${contractUploadReviews.applyResultPayload}->>'linkedClientId' = ${contactId}`,
          ),
        )
      )
      .orderBy(desc(contractUploadReviews.appliedAt))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const payload = row.applyResultPayload as Record<string, unknown> | null | undefined;

    // Confirmed fields: z confirmedFieldsTrace se scope = "contact"
    const confirmedFieldsTrace = payload?.confirmedFieldsTrace as Record<string, { scope?: string }> | null | undefined;
    const confirmedFields: string[] = [];
    if (confirmedFieldsTrace) {
      for (const [fieldKey, meta] of Object.entries(confirmedFieldsTrace)) {
        if (meta?.scope === "contact") {
          confirmedFields.push(fieldKey);
        }
      }
    }

    // Auto-applied, pending, manualRequired fields: z policyEnforcementTrace.contactEnforcement
    const policyTrace = payload?.policyEnforcementTrace as Record<string, unknown> | null | undefined;
    const contactEnforcement = policyTrace?.contactEnforcement as {
      autoAppliedFields?: string[];
      pendingConfirmationFields?: string[];
      manualRequiredFields?: string[];
    } | null | undefined;
    const autoAppliedFields: string[] = contactEnforcement?.autoAppliedFields ?? [];
    const pendingFields: string[] = contactEnforcement?.pendingConfirmationFields ?? [];
    const manualRequiredFields: string[] = contactEnforcement?.manualRequiredFields ?? [];

    // Pokud pro tento kontakt nenajdeme žádná concrete pole, ale review ho vytvořilo/linkovalo,
    // označíme základní identity pole jako auto_applied (kontakt byl vytvořen z AI Review).
    const createdClientId = (payload?.createdClientId as string | undefined) ?? null;
    const effectiveAutoApplied =
      autoAppliedFields.length > 0
        ? autoAppliedFields
        : createdClientId === contactId
        ? ["firstName", "lastName", "email", "phone", "birthDate", "personalId", "idCardNumber", "address"]
        : autoAppliedFields;

    return {
      reviewId: row.id,
      appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
      confirmedFields,
      autoAppliedFields: effectiveAutoApplied,
      pendingFields,
      manualRequiredFields,
    };
  } catch {
    return null;
  }
}

export const getContactAiProvenance = cache(loadContactAiProvenance);

/**
 * F5: Poslední aplikovaná AI kontrola dokumentu pro kontakt → částečný stav wizardu „Nová smlouva“.
 * Katalogová partnerId/productId záměrně nenastavujeme (viz parseContractWizardPrefillFromReviewData).
 */
export type ContactContractWizardPrefillResult = {
  form: Partial<ContractFormState>;
  sourceReviewId: string;
} | null;

async function loadContactContractWizardPrefill(contactId: string): Promise<ContactContractWizardPrefillResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:read")) return null;

    const rows = await db
      .select({
        id: contractUploadReviews.id,
        extractedPayload: contractUploadReviews.extractedPayload,
        draftActions: contractUploadReviews.draftActions,
      })
      .from(contractUploadReviews)
      .where(
        and(
          eq(contractUploadReviews.tenantId, auth.tenantId),
          eq(contractUploadReviews.reviewStatus, "applied"),
          or(
            eq(contractUploadReviews.matchedClientId, contactId),
            sql`${contractUploadReviews.applyResultPayload}->>'createdClientId' = ${contactId}`,
            sql`${contractUploadReviews.applyResultPayload}->>'linkedClientId' = ${contactId}`,
          ),
        ),
      )
      .orderBy(desc(contractUploadReviews.appliedAt))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const parsed = parseContractWizardPrefillFromReviewData(row.extractedPayload, row.draftActions);
    if (Object.keys(parsed).length === 0) return null;
    return { form: parsed, sourceReviewId: row.id };
  } catch {
    return null;
  }
}

export const getContactContractWizardPrefill = cache(loadContactContractWizardPrefill);

// ─── Fáze 15: Inline Pending Confirm z contact detailu ────────────────────────

export type ConfirmContactPendingFieldResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Fáze 15: Thin wrapper přes confirmPendingField pro inline potvrzení
 * pending AI identity pole přímo z klientského detailu.
 *
 * Bezpečnostní guardy (z confirmPendingField):
 * - Pole musí být v pendingConfirmationFields (prefill_confirm policy)
 * - manual_required a do_not_apply pole nelze potvrdit
 * - Supporting document guard zůstává tvrdý
 * - Idempotentní: druhé potvrzení je bezpečně ignorováno
 */
export async function confirmContactPendingFieldAction(
  reviewId: string,
  fieldKey: string,
): Promise<ConfirmContactPendingFieldResult> {
  const { confirmPendingField } = await import("./contract-review");
  const result = await confirmPendingField(reviewId, fieldKey, "contact");
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}
