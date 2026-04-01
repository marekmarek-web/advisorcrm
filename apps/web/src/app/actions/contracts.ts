"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contracts, partners, products } from "db";
import { eq, and, asc, or, isNull } from "db";
import { contractSegments } from "db";
import { logActivity } from "./activity";
import {
  normalizeContractFormForSave,
  validateContractFormForSubmit,
  type ContractFormState,
} from "@/lib/contracts/contract-form-payload";

export type ContractRow = {
  id: string;
  contactId: string;
  segment: string;
  /** Kanonický kód shodný se segmentem (DB sloupec `type`). */
  type: string;
  partnerId: string | null;
  productId: string | null;
  partnerName: string | null;
  productName: string | null;
  premiumAmount: string | null;
  premiumAnnual: string | null;
  contractNumber: string | null;
  startDate: string | null;
  anniversaryDate: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getContractsByContact(contactId: string): Promise<ContractRow[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }
  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.contactId, contactId)))
    .orderBy(asc(contracts.startDate));
  return rows.map((r) => ({
    ...r,
    type: r.type ?? r.segment,
  }));
}

export async function getPartnersForTenant(): Promise<{ id: string; name: string; segment: string }[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({ id: partners.id, name: partners.name, segment: partners.segment })
    .from(partners)
    .where(or(eq(partners.tenantId, auth.tenantId), isNull(partners.tenantId)))
    .orderBy(partners.name);
  return rows;
}

export type ProductOption = { id: string; name: string; category?: string | null; isTbd?: boolean | null };

export async function getProductsForPartner(partnerId: string): Promise<ProductOption[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({ id: products.id, name: products.name, category: products.category, isTbd: products.isTbd })
    .from(products)
    .where(eq(products.partnerId, partnerId))
    .orderBy(asc(products.category), asc(products.name));
  return rows;
}

export async function getContractSegments(): Promise<string[]> {
  return [...contractSegments];
}

function isRedirectError(e: unknown): boolean {
  const d = typeof e === "object" && e !== null ? (e as { digest?: string }).digest : undefined;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT");
}

function pgErrorCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null || !("code" in e)) return undefined;
  const c = (e as { code?: unknown }).code;
  return typeof c === "string" ? c : undefined;
}

function pgMissingColumnName(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /column\s+"([^"]+)"\s+of\s+relation\s+"([^"]+)"\s+does\s+not\s+exist/i.exec(msg);
  return m?.[1] ?? null;
}

/** Postgres 23502: sloupec s NOT NULL (postgres driver často přidává .column). */
function pgNotNullViolationColumn(e: unknown): string | null {
  if (typeof e === "object" && e !== null) {
    const col = (e as { column?: string }).column;
    if (typeof col === "string" && col.length > 0) return col;
  }
  const msg = e instanceof Error ? e.message : String(e);
  const m = /null value in column "([^"]+)"/i.exec(msg);
  return m?.[1] ?? null;
}

/**
 * Vrací výsledek místo throw u očekávaných chyb — v produkci Next.js jinak skryje zprávu z Server Action
 * a klient uvidí jen obecný „Server Components render“ text.
 */
export type CreateContractResult = { ok: true; id: string } | { ok: false; message: string };

export async function createContract(
  contactId: string,
  form: {
    segment: string;
    partnerId?: string;
    productId?: string;
    partnerName?: string;
    productName?: string;
    premiumAmount?: string;
    premiumAnnual?: string;
    contractNumber?: string;
    startDate?: string;
    anniversaryDate?: string;
    note?: string;
  }
): Promise<CreateContractResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) {
      return { ok: false, message: "Nemáte oprávnění přidávat smlouvy." };
    }

    if (!contactId || typeof contactId !== "string" || !contactId.trim()) {
      return {
        ok: false,
        message: "Chybí identifikátor kontaktu. Smlouvu nelze uložit bez přiřazení ke klientovi.",
      };
    }

    const validation = validateContractFormForSubmit(form as ContractFormState);
    if (!validation.ok) {
      return { ok: false, message: validation.message };
    }

    const normalized = normalizeContractFormForSave(form as ContractFormState);
    const segment = normalized.segment;
    if (!segment || !contractSegments.includes(segment as (typeof contractSegments)[number])) {
      return { ok: false, message: "Neplatný segment smlouvy. Vyberte segment z nabídky." };
    }

    let partnerName = normalized.partnerName?.trim() || null;
    let productName = normalized.productName?.trim() || null;
    if (normalized.partnerId && !partnerName) {
      const [p] = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, normalized.partnerId))
        .limit(1);
      if (p) partnerName = p.name;
    }
    if (normalized.productId && !productName) {
      const [pr] = await db
        .select({ name: products.name })
        .from(products)
        .where(eq(products.id, normalized.productId))
        .limit(1);
      if (pr) productName = pr.name;
    }

    if (!auth.tenantId?.trim()) {
      return {
        ok: false,
        message: "Chybí workspace (tenant). Obnovte stránku nebo dokončete registraci.",
      };
    }

    const [row] = await db
      .insert(contracts)
      .values({
        tenantId: auth.tenantId,
        contactId,
        advisorId: auth.userId,
        segment,
        type: segment,
        partnerId: normalized.partnerId || null,
        productId: normalized.productId || null,
        partnerName,
        productName,
        premiumAmount: normalized.premiumAmount || null,
        premiumAnnual: normalized.premiumAnnual || null,
        contractNumber: normalized.contractNumber?.trim() || null,
        startDate: normalized.startDate || null,
        anniversaryDate: normalized.anniversaryDate || null,
        note: normalized.note?.trim() || null,
      })
      .returning({ id: contracts.id });
    const newId = row?.id ?? null;
    if (!newId) {
      return { ok: false, message: "Smlouvu se nepodařilo uložit. Zkuste to znovu." };
    }
    try {
      await logActivity("contract", newId, "create", { segment, contactId });
    } catch {}
    return { ok: true, id: newId };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("[createContract]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
      return { ok: false, message: "Kontakt nebo vybraný partner/produkt neexistuje. Zkontrolujte údaje." };
    }
    const code = pgErrorCode(e);
    if (code === "42703") {
      const col = pgMissingColumnName(e);
      const hint =
        col != null
          ? `V tabulce contracts chybí sloupec „${col}“. V Supabase SQL Editoru spusťte packages/db/migrations/contracts-contact-id-to-client-id.sql (sloupce client_id, advisor_id).`
          : "Schéma databáze v Supabase neodpovídá aplikaci. Spusťte packages/db/migrations/contracts-contact-id-to-client-id.sql.";
      return { ok: false, message: hint };
    }
    if (code === "23503") {
      return {
        ok: false,
        message: "Neplatná vazba v databázi (klient nebo partner/produkt). Zkontrolujte výběr v CRM.",
      };
    }
    if (code === "23502") {
      const col = pgNotNullViolationColumn(e);
      if (col === "contact_id") {
        return {
          ok: false,
          message:
            "Tabulka contracts má ještě starý sloupec contact_id vedle client_id — INSERT ho nevyplní a Postgres ho odmítne. V Supabase SQL Editoru spusťte packages/db/migrations/contracts-contact-id-to-client-id.sql (sloučí a odstraní contact_id). Případně: ALTER TABLE contracts DROP COLUMN contact_id CASCADE;",
        };
      }
      if (col === "advisor_id") {
        return {
          ok: false,
          message:
            "Sloupec advisor_id je v databázi stále povinný. Spusťte: ALTER TABLE contracts ALTER COLUMN advisor_id DROP NOT NULL;",
        };
      }
      if (col === "type") {
        return {
          ok: false,
          message:
            "Tabulka contracts vyžaduje sloupec type. V Supabase SQL Editoru spusťte packages/db/migrations/contracts-add-type-column.sql (nebo sync supabase-schema.sql).",
        };
      }
      return {
        ok: false,
        message:
          col != null
            ? `Uložení se nepovedlo: povinný sloupec v databázi („${col}“) nemá hodnotu. Zkontrolujte migrace nebo kontaktujte správce.`
            : "Uložení se nepovedlo: databáze odmítla záznam (chybí povinné pole). Zkontrolujte migrace.",
      };
    }
    if (e instanceof Error && e.message === "Unauthorized") {
      return { ok: false, message: "Nejste přihlášeni nebo vypršela relace. Obnovte stránku a přihlaste se znovu." };
    }
    if (e instanceof Error && e.message.startsWith("Unauthorized:")) {
      return { ok: false, message: "Tento účet nemůže přidávat smlouvy." };
    }
    return { ok: false, message: "Smlouvu se nepodařilo uložit. Zkuste to znovu." };
  }
}

export async function updateContract(
  id: string,
  form: {
    segment?: string;
    partnerId?: string;
    productId?: string;
    partnerName?: string;
    productName?: string;
    premiumAmount?: string;
    premiumAnnual?: string;
    contractNumber?: string;
    startDate?: string;
    anniversaryDate?: string;
    note?: string;
  }
) {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    const full: ContractFormState = {
      segment: form.segment ?? "",
      partnerId: form.partnerId ?? "",
      productId: form.productId ?? "",
      partnerName: form.partnerName ?? "",
      productName: form.productName ?? "",
      premiumAmount: form.premiumAmount ?? "",
      premiumAnnual: form.premiumAnnual ?? "",
      contractNumber: form.contractNumber ?? "",
      startDate: form.startDate ?? "",
      anniversaryDate: form.anniversaryDate ?? "",
      note: form.note ?? "",
    };

    const validation = validateContractFormForSubmit(full);
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const normalized = normalizeContractFormForSave(full);
    const segment = normalized.segment;

    let partnerName: string | null = normalized.partnerName?.trim() || null;
    let productName: string | null = normalized.productName?.trim() || null;
    if (normalized.partnerId && !partnerName) {
      const [p] = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, normalized.partnerId))
        .limit(1);
      if (p) partnerName = p.name;
    }
    if (normalized.productId && !productName) {
      const [pr] = await db
        .select({ name: products.name })
        .from(products)
        .where(eq(products.id, normalized.productId))
        .limit(1);
      if (pr) productName = pr.name;
    }

    await db
      .update(contracts)
      .set({
        segment,
        type: segment,
        partnerId: normalized.partnerId || null,
        productId: normalized.productId || null,
        partnerName,
        productName,
        premiumAmount: normalized.premiumAmount || null,
        premiumAnnual: normalized.premiumAnnual || null,
        contractNumber: normalized.contractNumber?.trim() || null,
        startDate: normalized.startDate || null,
        anniversaryDate: normalized.anniversaryDate || null,
        note: normalized.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, id)));
    try {
      await logActivity("contract", id, "update", { fields: Object.keys(form) });
    } catch {}
  } catch (e) {
    console.error("[updateContract]", e);
    throw new Error(e instanceof Error ? e.message : "Smlouvu se nepodařilo upravit.");
  }
}

export async function deleteContract(id: string) {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    await db
      .delete(contracts)
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, id)));
    try { await logActivity("contract", id, "delete"); } catch {}
  } catch (e) {
    console.error("[deleteContract]", e);
    throw new Error(e instanceof Error ? e.message : "Smlouvu se nepodařilo smazat.");
  }
}
