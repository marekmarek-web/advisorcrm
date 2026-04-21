"use server";

import { cache } from "react";
import { requireAuthInAction, type AuthContext } from "@/lib/auth/require-auth";
import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { getHouseholdIdForContactWithAuth, getHouseholdsListWithAuth } from "@/app/actions/households";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contacts, contractUploadReviews } from "db";
import { eq, and, asc, inArray, isNull, isNotNull, sql, desc, or } from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { logAuditAction } from "@/lib/audit";
import { requireRecentAuth } from "@/lib/auth/require-recent-auth";
import { buildContactsPiiPatch } from "@/lib/pii/contacts-write-through";
import { decryptContactPiiPair } from "@/lib/pii/contacts-read-through";
import { buildAvatarProxyUrl } from "@/lib/storage/avatar-proxy";
import {
  parseContractWizardPrefillFromReviewData,
  shouldSuppressContractWizardPrefillAfterApply,
} from "@/lib/contracts/contact-wizard-prefill-from-ai-review";
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
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    return tx
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
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          isNull(contacts.archivedAt),
          isNull(contacts.deletedAt),
        ),
      )
      .orderBy(asc(contacts.lastName), asc(contacts.firstName));
  });
}

/** Počet nearchivovaných kontaktů v tenantovi (např. first-run onboarding). Dedup v rámci jednoho RSC requestu (layout + gate). */
async function loadContactsCount(): Promise<number> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) return 0;
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          isNull(contacts.archivedAt),
          isNull(contacts.deletedAt),
        ),
      );
    return row?.count ?? 0;
  });
}

export const getContactsCount = cache(loadContactsCount);

function escapeCsvCell(s: string | null | undefined): string {
  if (s == null) return "";
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export async function exportContactsCsv(): Promise<string> {
  const rows = await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    return tx
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        city: contacts.city,
        lifecycleStage: contacts.lifecycleStage,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          isNull(contacts.archivedAt),
          isNull(contacts.deletedAt),
        ),
      )
      .orderBy(asc(contacts.lastName), asc(contacts.firstName));
  });

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
  personalIdEnc: contacts.personalIdEnc,
  idCardNumber: contacts.idCardNumber,
  idCardNumberEnc: contacts.idCardNumberEnc,
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

/** `db` nebo tx z `withTenantContext` — strukturálně kompatibilní `select` API. */
type ContactReader = Pick<typeof db, "select">;

async function loadContactWithAuth(
  auth: AuthContext,
  id: string,
  reader: ContactReader = db,
): Promise<ContactRow | null> {
  try {
    if (!hasPermission(auth.roleName, "contacts:read")) return null;

    let row: Record<string, unknown> | undefined;
    try {
      const rows = await reader
        .select(contactDetailExtendedSelect)
        .from(contacts)
        .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)))
        .limit(1);
      row = rows[0] as Record<string, unknown> | undefined;
    } catch (e) {
      if (isRedirectError(e)) throw e;
      if (!isPgUndefinedColumn(e)) throw e;
      console.warn("[getContact] extended columns missing, using core select");
      const rows = await reader
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
        const [refContact] = await reader
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
      // WS-2 Batch 5 — read-through: pokud existuje envelope, vrať plaintext z něj.
      // Fallback na legacy plaintext pouze během dual-column fáze (do drop migrace).
      ...decryptContactPiiPair({
        personalId: (row.personalId as string | null | undefined) ?? null,
        personalIdEnc: (row.personalIdEnc as string | null | undefined) ?? null,
        idCardNumber: (row.idCardNumber as string | null | undefined) ?? null,
        idCardNumberEnc: (row.idCardNumberEnc as string | null | undefined) ?? null,
      }),
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
  return withAuthContext((auth, tx) => loadContactWithAuth(auth, id, tx));
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
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    return tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          isNull(contacts.archivedAt),
          isNull(contacts.deletedAt),
        ),
      )
      .orderBy(asc(contacts.lastName), asc(contacts.firstName));
  });
}

export type ContactEditPageBundle = {
  contact: ContactRow | null;
  householdId: string | null;
  referralPicker: { id: string; label: string }[];
  householdOptions: { id: string; name: string }[];
  /** Oprávnění `contacts:delete` — trvalé smazání v UI. */
  canPermanentlyDelete: boolean;
};

/** Jeden round-trip pro portal edit kontaktu (kontakt + domácnost + pickery). */
export async function getContactEditPageData(contactId: string): Promise<ContactEditPageBundle> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    const [contact, householdId, pickerRows, householdRows] = await Promise.all([
      loadContactWithAuth(auth, contactId, tx),
      getHouseholdIdForContactWithAuth(auth, contactId, tx),
      tx
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, auth.tenantId),
            isNull(contacts.archivedAt),
            isNull(contacts.deletedAt),
          ),
        )
        .orderBy(asc(contacts.lastName), asc(contacts.firstName)),
      getHouseholdsListWithAuth(auth, tx),
    ]);
    return {
      contact,
      householdId,
      referralPicker: pickerRows
        .filter((r) => r.id !== contactId)
        .map((r) => ({ id: r.id, label: `${r.firstName} ${r.lastName}` })),
      householdOptions: householdRows.map((h) => ({ id: h.id, name: h.name })),
      canPermanentlyDelete: hasPermission(auth.roleName, "contacts:delete"),
    };
  });
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
    return await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      return { ok: false, message: "Nemáte oprávnění vytvářet kontakty." };
    }
    // WS-2 Batch 5 — PII write-through: plaintext + AES-GCM envelope + fingerprint
    // v jediném patchi. Helper respektuje dual-column fázi (plaintext zůstává).
    const piiPatch = buildContactsPiiPatch({
      personalId: form.personalId?.trim() || null,
      idCardNumber: form.idCardNumber?.trim() || null,
    });
    const [row] = await tx
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
        ...piiPatch,
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
    });
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
  return withAuthContext(async (auth, tx) => {
    if (auth.roleName !== "Client" || !auth.contactId) throw new Error("Forbidden");
    await tx
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
  });
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
    await withAuthContext(async (auth, tx) => {
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
    // WS-2 Batch 5 — PII update se provádí přes write-through helper, aby se
    // plaintext + envelope + fingerprint vždy držely v sync. `hasOwn` kontrola
    // zajistí, že se nepřepisují hodnoty, které uživatel neposlal.
    {
      const piiInput: { personalId?: string | null; idCardNumber?: string | null } = {};
      if (hasOwn("personalId")) piiInput.personalId = form.personalId?.trim() || null;
      if (hasOwn("idCardNumber")) piiInput.idCardNumber = form.idCardNumber?.trim() || null;
      if (Object.keys(piiInput).length > 0) {
        Object.assign(patch, buildContactsPiiPatch(piiInput));
      }
    }
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

    const updated = await tx
      .update(contacts)
      .set(patch)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)))
      .returning({ id: contacts.id });

    if (updated.length === 0) {
      throw new Error("Kontakt nebyl nalezen nebo nepatří do vašeho workspace.");
    }

    // WS-2 Batch 2 / minimal audit coverage — client profile update.
    // Meta cíleně neobsahuje hodnoty polí (PII), jen seznam změněných klíčů.
    const changedKeys = Object.keys(patch).filter((k) => k !== "updatedAt");
    logAuditAction({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "contact.update",
      entityType: "contact",
      entityId: id,
      meta: { changedFields: changedKeys, roleName: auth.roleName },
    });
    });
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
  // Storage operations sit outside DB transaction on purpose (Supabase admin client). DB writes below run under tenant GUC.
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
  // WS-2 Batch 5 / W4: ukládáme storage path (ne 365-denní signed URL). UI renderuje
  // přes `/api/storage/avatar?path=...` s krátkodobou signed URL (1 h).
  await withTenantContextFromAuth(auth, (tx) =>
    tx
      .update(contacts)
      .set({ avatarUrl: path, updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId))),
  );
  return buildAvatarProxyUrl(path);
}

/** Smaže kontakt. Závislosti (household_members, dokumenty, atd.) řeší DB CASCADE / SET NULL. */
/** @deprecated Use archiveContact instead. Hard delete removed from UI. */
export async function deleteContact(id: string): Promise<void> {
  return archiveContact(id);
}

export async function archiveContact(id: string, reason?: string): Promise<void> {
  try {
    await withAuthContext(async (auth, tx) => {
      if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
      await tx
        .update(contacts)
        .set({
          archivedAt: new Date(),
          archivedReason: reason?.trim() || null,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)));

      // WS-2 Batch 2 / minimal audit coverage — contact archive (soft delete).
      logAuditAction({
        tenantId: auth.tenantId,
        userId: auth.userId,
        action: "contact.archive",
        entityType: "contact",
        entityId: id,
        meta: { reason: reason?.trim() || null, roleName: auth.roleName },
      });
    });
  } catch (e) {
    console.error("[archiveContact]", e);
    throw new Error(e instanceof Error ? e.message : "Kontakt se nepodařilo archivovat.");
  }
}

export async function restoreContact(id: string): Promise<void> {
  try {
    await withAuthContext(async (auth, tx) => {
      if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
      await tx
        .update(contacts)
        .set({
          archivedAt: null,
          archivedReason: null,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, id)));
    });
  } catch (e) {
    console.error("[restoreContact]", e);
    throw new Error(e instanceof Error ? e.message : "Kontakt se nepodařilo obnovit.");
  }
}

/**
 * Delta A21 — soft-delete buffer 30 dní.
 *
 * `permanentlyDeleteContacts` přestává okamžitě mazat; místo toho přesunuje kontakty
 * do trashe (`deleted_at = now()`). Skutečné hard-delete provádí cron
 * `/api/cron/trash-purge-contacts` po 30 dnech.
 *
 * Obnova do 30 dnů přes `restoreContactFromTrash` (a UI v `/portal/admin/trash`).
 *
 * Vyžaduje `contacts:delete` a recent auth (≤ 15 min).
 */
export async function permanentlyDeleteContacts(ids: string[]): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:delete")) throw new Error("Forbidden");
  await requireRecentAuth({ action: "contact.soft_delete", maxAgeSeconds: 900 });
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const rows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), inArray(contacts.id, unique))),
  );
  if (rows.length !== unique.length) {
    throw new Error("Některé kontakty neexistují nebo k nim nemáte přístup.");
  }

  try {
    const now = new Date();
    await withTenantContextFromAuth(auth, (tx) =>
      tx
        .update(contacts)
        .set({
          deletedAt: now,
          deletedBy: auth.userId,
          updatedAt: now,
        })
        .where(and(eq(contacts.tenantId, auth.tenantId), inArray(contacts.id, unique))),
    );
    for (const contactId of unique) {
      logAuditAction({
        tenantId: auth.tenantId,
        userId: auth.userId,
        action: "contact.soft_delete",
        entityType: "contact",
        entityId: contactId,
        meta: {
          roleName: auth.roleName,
          batchSize: unique.length,
          purgeAfterDays: 30,
        },
      });
    }
  } catch (e) {
    console.error("[permanentlyDeleteContacts]", e);
    throw new Error(e instanceof Error ? e.message : "Kontakty se nepodařilo přesunout do koše.");
  }
}

/**
 * Delta A21 — obnova z trashe. Admin-only: `contacts:delete` (stejný permission jako
 * přesun do trashe), aby nemohl kdokoli v kanceláři omylem resuscitovat klienta,
 * u kterého byl požádán o GDPR výmaz.
 */
export async function restoreContactFromTrash(id: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:delete")) throw new Error("Forbidden");
  await requireRecentAuth({ action: "contact.restore_from_trash", maxAgeSeconds: 900 });

  await withAuthContext(async (a, tx) => {
    await tx
      .update(contacts)
      .set({ deletedAt: null, deletedBy: null, deletedReason: null, updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, a.tenantId), eq(contacts.id, id)));

    logAuditAction({
      tenantId: a.tenantId,
      userId: a.userId,
      action: "contact.restore_from_trash",
      entityType: "contact",
      entityId: id,
      meta: { roleName: a.roleName },
    });
  });
}

/**
 * Delta A21 — list of contacts currently in trash (deleted < 30 days ago).
 * Starší než 30 dnů jsou v průběhu každého cron runu čištěny hard-deletem, takže
 * v listě se nikdy neobjeví.
 */
export async function listTrashContacts(): Promise<
  Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    deletedAt: string;
    deletedBy: string | null;
    purgeScheduledAt: string;
  }>
> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:delete")) throw new Error("Forbidden");

  const rows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        deletedAt: contacts.deletedAt,
        deletedBy: contacts.deletedBy,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), isNotNull(contacts.deletedAt))),
  );

  const PURGE_DAYS = 30;
  return rows
    .filter((r) => r.deletedAt !== null)
    .map((r) => {
      const deleted = r.deletedAt as Date;
      const purge = new Date(deleted.getTime() + PURGE_DAYS * 86400_000);
      return {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        deletedAt: deleted.toISOString(),
        deletedBy: r.deletedBy,
        purgeScheduledAt: purge.toISOString(),
      };
    });
}

export async function getContactDependencyCounts(id: string): Promise<{
  contracts: number;
  opportunities: number;
  documents: number;
  tasks: number;
  analyses: number;
}> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    const { contracts: contractsTable, opportunities, documents, tasks, financialAnalyses } = await import("db");
    const [[c], [o], [d], [t], [a]] = await Promise.all([
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(contractsTable)
        .where(and(eq(contractsTable.contactId, id), eq(contractsTable.tenantId, auth.tenantId))),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(opportunities)
        .where(and(eq(opportunities.contactId, id), eq(opportunities.tenantId, auth.tenantId))),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(and(eq(documents.contactId, id), eq(documents.tenantId, auth.tenantId))),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.contactId, id), eq(tasks.tenantId, auth.tenantId))),
      tx
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
  });
}

export async function updateContactsLifecycle(ids: string[], lifecycleStage: string): Promise<void> {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    if (ids.length === 0) return;
    await tx
      .update(contacts)
      .set({ lifecycleStage: lifecycleStage || null, updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, auth.tenantId), inArray(contacts.id, ids)));
  });
}

export async function addTagToContacts(ids: string[], tag: string): Promise<void> {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    if (ids.length === 0 || !tag.trim()) return;
    const trimmed = tag.trim();
    const rows = await tx
      .select({ id: contacts.id, tags: contacts.tags })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), inArray(contacts.id, ids)));
    await Promise.all(
      rows.map((r) => {
        const next = Array.from(new Set([...(r.tags ?? []), trimmed]));
        return tx
          .update(contacts)
          .set({ tags: next, updatedAt: new Date() })
          .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, r.id)));
      })
    );
  });
}

/** Nastaví štítky kontaktu (pouze sloupec tags). Pro použití na kartě klienta. */
export async function setContactTags(contactId: string, tags: string[]): Promise<void> {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    const existing = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
      .limit(1);
    if (existing.length === 0) throw new Error("Kontakt nenalezen");
    const normalized = Array.from(
      new Set(tags.map((t) => t.trim()).filter(Boolean))
    );
    await tx
      .update(contacts)
      .set({ tags: normalized.length ? normalized : null, updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)));
  });
}

/**
 * Fáze 13: Contact-level AI provenance.
 * Najde poslední applied review, které vytvořilo nebo linkovalo daný kontakt.
 * Vrací per-field provenance pro contact identity pole.
 */
export type ContactMergeConflictField = {
  fieldKey: string;
  incomingValue: string | null;
  reason: "manual_protected" | "conflict";
};

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
  /**
   * Merge konflikty z apply: pole kde AI přinesla jinou hodnotu než existující manuální data.
   * Stávající hodnota zůstala, AI hodnota čeká na rozhodnutí poradce.
   */
  mergeConflictFields: ContactMergeConflictField[];
} | null;

async function loadContactAiProvenance(contactId: string): Promise<ContactAiProvenanceResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:read")) return null;

    const rows = await withTenantContextFromAuth(auth, (tx) =>
      tx
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
        .limit(1),
    );

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
    // Odebrat z pending ta pole, která již byla potvrzena přes confirmPendingField (confirmedFieldsTrace)
    const allPendingFromTrace: string[] = contactEnforcement?.pendingConfirmationFields ?? [];
    const confirmedFieldKeys = new Set(confirmedFields);
    const pendingFields: string[] = allPendingFromTrace.filter((f) => !confirmedFieldKeys.has(f));
    const manualRequiredFields: string[] = contactEnforcement?.manualRequiredFields ?? [];

    // Merge konflikty: pole kde AI přinesla jinou hodnotu než existující manuální data
    // Odebrat konflikty pro pole, která byla mezitím potvrzena přes confirmPendingField
    const rawMergeConflicts = payload?.pendingFields as
      | Array<{ fieldKey?: string; incomingValue?: string | null; reason?: string }>
      | null
      | undefined;
    const mergeAckTrace = payload?.mergeConflictAcknowledgedTrace as Record<string, unknown> | null | undefined;
    const mergeAcknowledgedKeys = mergeAckTrace ? new Set(Object.keys(mergeAckTrace)) : new Set<string>();
    const mergeConflictFields: ContactMergeConflictField[] = (rawMergeConflicts ?? [])
      .filter(
        (f) =>
          f?.fieldKey &&
          !confirmedFieldKeys.has(f.fieldKey!) &&
          !mergeAcknowledgedKeys.has(f.fieldKey!),
      )
      .map((f) => ({
        fieldKey: f.fieldKey!,
        incomingValue: f.incomingValue ?? null,
        reason: (f.reason === "manual_protected" || f.reason === "conflict") ? f.reason : "conflict",
      }));

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
      mergeConflictFields,
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

    const rows = await withTenantContextFromAuth(auth, (tx) =>
      tx
        .select({
          id: contractUploadReviews.id,
          extractedPayload: contractUploadReviews.extractedPayload,
          draftActions: contractUploadReviews.draftActions,
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
          ),
        )
        .orderBy(desc(contractUploadReviews.appliedAt))
        .limit(1),
    );

    const row = rows[0];
    if (!row) return null;

    if (shouldSuppressContractWizardPrefillAfterApply(row.applyResultPayload)) {
      return null;
    }

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
