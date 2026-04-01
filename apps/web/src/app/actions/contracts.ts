"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contracts, partners, products } from "db";
import { eq, and, asc, or, isNull } from "db";
import { contractSegments } from "db";
import { logActivity } from "./activity";

export type ContractRow = {
  id: string;
  contactId: string;
  segment: string;
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
  return rows;
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

    const segment = form.segment?.trim();
    if (!segment || !contractSegments.includes(segment as (typeof contractSegments)[number])) {
      return { ok: false, message: "Neplatný segment smlouvy. Vyberte segment z nabídky." };
    }

    let partnerName = form.partnerName?.trim() || null;
    let productName = form.productName?.trim() || null;
    if (form.partnerId && !partnerName) {
      const [p] = await db.select({ name: partners.name }).from(partners).where(eq(partners.id, form.partnerId)).limit(1);
      if (p) partnerName = p.name;
    }
    if (form.productId && !productName) {
      const [pr] = await db.select({ name: products.name }).from(products).where(eq(products.id, form.productId)).limit(1);
      if (pr) productName = pr.name;
    }

    const [row] = await db
      .insert(contracts)
      .values({
        tenantId: auth.tenantId,
        contactId,
        advisorId: auth.userId,
        segment,
        partnerId: form.partnerId || null,
        productId: form.productId || null,
        partnerName,
        productName,
        premiumAmount: form.premiumAmount || null,
        premiumAnnual: form.premiumAnnual || null,
        contractNumber: form.contractNumber?.trim() || null,
        startDate: form.startDate || null,
        anniversaryDate: form.anniversaryDate || null,
        note: form.note?.trim() || null,
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
      return {
        ok: false,
        message: "Uložení se nepovedlo: databáze odmítla záznam (chybí povinné pole). Zkontrolujte migrace.",
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
    let partnerName: string | null | undefined = form.partnerName != null ? (form.partnerName?.trim() || null) : undefined;
    let productName: string | null | undefined = form.productName != null ? (form.productName?.trim() || null) : undefined;
    if (form.partnerId != null && (partnerName === undefined || partnerName === null || partnerName === "")) {
      const [p] = await db.select({ name: partners.name }).from(partners).where(eq(partners.id, form.partnerId)).limit(1);
      if (p) partnerName = p.name;
    }
    if (form.productId != null && (productName === undefined || productName === null || productName === "")) {
      const [pr] = await db.select({ name: products.name }).from(products).where(eq(products.id, form.productId)).limit(1);
      if (pr) productName = pr.name;
    }
    await db
      .update(contracts)
      .set({
        ...(form.segment != null && { segment: form.segment }),
        ...(form.partnerId != null && { partnerId: form.partnerId || null }),
        ...(form.productId != null && { productId: form.productId || null }),
        ...(partnerName !== undefined && { partnerName }),
        ...(productName !== undefined && { productName }),
        ...(form.premiumAmount != null && { premiumAmount: form.premiumAmount || null }),
        ...(form.premiumAnnual != null && { premiumAnnual: form.premiumAnnual || null }),
        ...(form.contractNumber != null && { contractNumber: form.contractNumber?.trim() || null }),
        ...(form.startDate != null && { startDate: form.startDate || null }),
        ...(form.anniversaryDate != null && { anniversaryDate: form.anniversaryDate || null }),
        ...(form.note != null && { note: form.note?.trim() || null }),
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, id)));
    try { await logActivity("contract", id, "update", { fields: Object.keys(form) }); } catch {}
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
