"use server";

import { cache } from "react";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contracts, partners, products, documents, contacts, contractUploadReviews, tenants, clientPaymentSetups } from "db";
import { eq, and, asc, or, isNull, inArray, desc, sql } from "db";
import { contractSegments } from "db";
import { logActivity } from "./activity";
import { createPortalNotification } from "./portal-notifications";
import {
  normalizeContractFormForSave,
  validateContractFormForSubmit,
  type ContractFormState,
} from "@/lib/contracts/contract-form-payload";
import { breadcrumbContractAiReviewMissingSourceReview } from "@/lib/observability/contract-review-sentry";

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
  visibleToClient: boolean;
  portfolioStatus: string;
  sourceKind: string;
  sourceDocumentId: string | null;
  sourceContractReviewId: string | null;
  advisorConfirmedAt: Date | null;
  confirmedByUserId: string | null;
  portfolioAttributes: Record<string, unknown>;
  extractionConfidence: string | null;
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
    .select({
      id: contracts.id,
      contactId: contracts.contactId,
      segment: contracts.segment,
      type: contracts.type,
      partnerId: contracts.partnerId,
      productId: contracts.productId,
      partnerName: contracts.partnerName,
      productName: contracts.productName,
      premiumAmount: contracts.premiumAmount,
      premiumAnnual: contracts.premiumAnnual,
      contractNumber: contracts.contractNumber,
      startDate: contracts.startDate,
      anniversaryDate: contracts.anniversaryDate,
      note: contracts.note,
      visibleToClient: contracts.visibleToClient,
      portfolioStatus: contracts.portfolioStatus,
      sourceKind: contracts.sourceKind,
      sourceDocumentId: contracts.sourceDocumentId,
      sourceContractReviewId: contracts.sourceContractReviewId,
      advisorConfirmedAt: contracts.advisorConfirmedAt,
      confirmedByUserId: contracts.confirmedByUserId,
      portfolioAttributes: contracts.portfolioAttributes,
      extractionConfidence: contracts.extractionConfidence,
      createdAt: contracts.createdAt,
      updatedAt: contracts.updatedAt,
    })
    .from(contracts)
    .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.contactId, contactId)))
    .orderBy(asc(contracts.startDate));
  const mapped: ContractRow[] = rows.map((r) => ({
    ...r,
    type: r.type ?? r.segment,
    portfolioAttributes: (r.portfolioAttributes ?? {}) as Record<string, unknown>,
    extractionConfidence:
      r.extractionConfidence != null ? String(r.extractionConfidence) : null,
  }));
  const orphanAiReviewCount = mapped.filter(
    (r) => r.sourceKind === "ai_review" && !r.sourceContractReviewId,
  ).length;
  if (orphanAiReviewCount > 0) {
    breadcrumbContractAiReviewMissingSourceReview({
      contactId,
      orphanCount: orphanAiReviewCount,
    });
  }
  return mapped;
}

/**
 * Read model for client portal: only contracts published to the client and in a displayable state.
 * Does not expose extraction confidence to the UI layer — strip if serializing to client components.
 */
export async function getClientPortfolioForContact(contactId: string): Promise<ContractRow[]> {
  const auth = await requireAuthInAction();
  const isClient = auth.roleName === "Client";
  if (isClient) {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  const rows = await db
    .select({
      id: contracts.id,
      contactId: contracts.contactId,
      segment: contracts.segment,
      type: contracts.type,
      partnerId: contracts.partnerId,
      productId: contracts.productId,
      partnerName: contracts.partnerName,
      productName: contracts.productName,
      premiumAmount: contracts.premiumAmount,
      premiumAnnual: contracts.premiumAnnual,
      contractNumber: contracts.contractNumber,
      startDate: contracts.startDate,
      anniversaryDate: contracts.anniversaryDate,
      note: contracts.note,
      visibleToClient: contracts.visibleToClient,
      portfolioStatus: contracts.portfolioStatus,
      sourceKind: contracts.sourceKind,
      sourceDocumentId: contracts.sourceDocumentId,
      sourceContractReviewId: contracts.sourceContractReviewId,
      advisorConfirmedAt: contracts.advisorConfirmedAt,
      confirmedByUserId: contracts.confirmedByUserId,
      portfolioAttributes: contracts.portfolioAttributes,
      extractionConfidence: contracts.extractionConfidence,
      createdAt: contracts.createdAt,
      updatedAt: contracts.updatedAt,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, auth.tenantId),
        eq(contracts.contactId, contactId),
        eq(contracts.visibleToClient, true),
        inArray(contracts.portfolioStatus, ["active", "ended"]),
        isNull(contracts.archivedAt)
      )
    )
    .orderBy(asc(contracts.startDate));

  const mapped: ContractRow[] = rows.map((r) => ({
    ...r,
    type: r.type ?? r.segment,
    portfolioAttributes: (r.portfolioAttributes ?? {}) as Record<string, unknown>,
    extractionConfidence:
      isClient || r.extractionConfidence == null
        ? null
        : String(r.extractionConfidence),
    advisorConfirmedAt: isClient ? null : r.advisorConfirmedAt,
    confirmedByUserId: isClient ? null : r.confirmedByUserId,
    sourceContractReviewId: isClient ? null : r.sourceContractReviewId,
  }));

  // Enrich premiumAmount from canonical payment setup where contract has no stored amount.
  // This ensures AI Review applied contracts show correct amounts even when the contract
  // row was written without premiumAmount (e.g. when payment was only in payment setup).
  const missingAmountIds = mapped
    .filter((c) => !c.premiumAmount && !c.premiumAnnual && c.contractNumber)
    .map((c) => c.id);

  if (missingAmountIds.length > 0) {
    const paymentRows = await db
      .select({
        contractNumber: clientPaymentSetups.contractNumber,
        amount: clientPaymentSetups.amount,
        frequency: clientPaymentSetups.frequency,
        paymentType: clientPaymentSetups.paymentType,
      })
      .from(clientPaymentSetups)
      .where(
        and(
          eq(clientPaymentSetups.tenantId, auth.tenantId),
          eq(clientPaymentSetups.contactId, contactId),
          eq(clientPaymentSetups.status, "active"),
          eq(clientPaymentSetups.needsHumanReview, false)
        )
      );

    if (paymentRows.length > 0) {
      const paymentByContractNumber = new Map(
        paymentRows
          .filter((p) => p.contractNumber && p.amount)
          .map((p) => [p.contractNumber!.trim(), p])
      );
      for (const contract of mapped) {
        if (contract.contractNumber && !contract.premiumAmount && !contract.premiumAnnual) {
          const ps = paymentByContractNumber.get(contract.contractNumber.trim());
          if (ps?.amount) {
            const freq = (ps.frequency ?? "").toLowerCase();
            if (freq === "annually" || freq === "yearly" || freq === "ročně") {
              contract.premiumAnnual = String(ps.amount);
            } else {
              contract.premiumAmount = String(ps.amount);
            }
          }
        }
      }
    }
  }

  return mapped;
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

function pgErrorMeta(e: unknown): { code?: string; detail?: string; constraint?: string } {
  if (typeof e !== "object" || e === null) return {};
  const o = e as Record<string, unknown>;
  return {
    code: typeof o.code === "string" ? o.code : undefined,
    detail: typeof o.detail === "string" ? o.detail : undefined,
    constraint: typeof o.constraint === "string" ? o.constraint : undefined,
  };
}

/** Když Postgres FK detail nerozpoznáme — neutrální text (ne jen „kontakt/partner“). */
const FK_VIOLATION_FALLBACK_MESSAGE =
  "Neplatná vazba v databázi. Zkontrolujte klienta, workspace a výběr partnera či produktu z katalogu.";

/** Čitelná hláška z Postgres FK detailu (klient / tenant / partner / produkt). */
function fkViolationUserMessage(detail: string | undefined): string | null {
  if (!detail) return null;
  const d = detail.toLowerCase();
  if (d.includes("client_id") || d.includes("contact_id")) {
    return "Klient není v databázi nebo neodpovídá workspace. Obnovte stránku a zkuste znovu.";
  }
  if (d.includes("tenant_id")) {
    return "Workspace není v databázi nebo neodpovídá vašemu účtu. Obnovte stránku nebo se znovu přihlaste.";
  }
  if (d.includes("partner_id")) {
    return "Partner není v databázi. Vyberte partnera z katalogu znovu.";
  }
  if (d.includes("product_id")) {
    return "Produkt není v databázi. Vyberte produkt z katalogu znovu.";
  }
  if (d.includes("advisor_id")) {
    return "Účet poradce neodpovídá databázi. Obnovte stránku nebo kontaktujte správce.";
  }
  return null;
}

type RefCheck = { ok: true } | { ok: false; message: string };

/** Před INSERT/UPDATE smlouvy: klient v tenantovi, partner a produkt z globálního nebo tenant katalogu, produkt patří k partnerovi. */
async function assertContractPartnerProductRefs(opts: {
  tenantId: string;
  contactId?: string;
  partnerId?: string | null;
  productId?: string | null;
}): Promise<RefCheck> {
  if (opts.contactId?.trim()) {
    const [c] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, opts.contactId.trim()), eq(contacts.tenantId, opts.tenantId)))
      .limit(1);
    if (!c) {
      return {
        ok: false,
        message:
          "Klient neexistuje nebo nepatří do tohoto workspace. Obnovte stránku a zkuste znovu.",
      };
    }
  }

  const pid = opts.partnerId?.trim() || "";
  const prid = opts.productId?.trim() || "";

  if (pid) {
    const [p] = await db
      .select({ id: partners.id })
      .from(partners)
      .where(
        and(eq(partners.id, pid), or(isNull(partners.tenantId), eq(partners.tenantId, opts.tenantId)))
      )
      .limit(1);
    if (!p) {
      return {
        ok: false,
        message:
          "Vybraný partner není v katalogu nebo nepatří do tohoto workspace. Vyberte partnera znovu.",
      };
    }
  }

  if (prid) {
    const rows = await db
      .select({ partnerId: products.partnerId })
      .from(products)
      .innerJoin(partners, eq(products.partnerId, partners.id))
      .where(
        and(
          eq(products.id, prid),
          or(isNull(partners.tenantId), eq(partners.tenantId, opts.tenantId))
        )
      )
      .limit(1);
    if (!rows.length) {
      return {
        ok: false,
        message:
          "Vybraný produkt neexistuje nebo nepatří do tohoto workspace. Vyberte produkt znovu.",
      };
    }
    if (pid && rows[0].partnerId !== pid) {
      return {
        ok: false,
        message:
          "Produkt neodpovídá vybranému partnerovi. Zvolte produkt znovu v seznamu u partnera.",
      };
    }
  }

  return { ok: true };
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

    const [tenantRow] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, auth.tenantId))
      .limit(1);
    if (!tenantRow) {
      return {
        ok: false,
        message:
          "Workspace v databázi neexistuje nebo neodpovídá vašemu účtu. Obnovte stránku nebo se znovu přihlaste.",
      };
    }

    const refCheck = await assertContractPartnerProductRefs({
      tenantId: auth.tenantId,
      contactId,
      partnerId: normalized.partnerId ?? null,
      productId: normalized.productId ?? null,
    });
    if (!refCheck.ok) {
      return { ok: false, message: refCheck.message };
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
        visibleToClient: true,
        portfolioStatus: "active",
        sourceKind: "manual",
        advisorConfirmedAt: new Date(),
        confirmedByUserId: auth.userId,
        portfolioAttributes: {},
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
    const msg = e instanceof Error ? e.message : String(e);
    const meta = pgErrorMeta(e);
    console.error("[createContract]", { ...meta, message: msg, err: e });
    if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
      const fkMsg = fkViolationUserMessage(meta.detail);
      return {
        ok: false,
        message: fkMsg ?? FK_VIOLATION_FALLBACK_MESSAGE,
      };
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
      const fkMsg = fkViolationUserMessage(meta.detail);
      return {
        ok: false,
        message: fkMsg ?? FK_VIOLATION_FALLBACK_MESSAGE,
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
    /** Klientský portál – sekce Moje portfolio */
    visibleToClient?: boolean;
    portfolioStatus?: string;
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

    if (!auth.tenantId?.trim()) {
      throw new Error("Chybí workspace (tenant). Obnovte stránku nebo dokončete registraci.");
    }

    const updateRef = await assertContractPartnerProductRefs({
      tenantId: auth.tenantId,
      partnerId: normalized.partnerId ?? null,
      productId: normalized.productId ?? null,
    });
    if (!updateRef.ok) {
      throw new Error(updateRef.message);
    }

    const portfolioPatch: Record<string, unknown> = {};
    if (form.visibleToClient !== undefined) portfolioPatch.visibleToClient = form.visibleToClient;
    if (form.portfolioStatus !== undefined) {
      const ps = form.portfolioStatus.trim();
      if (["draft", "pending_review", "active", "ended"].includes(ps)) {
        portfolioPatch.portfolioStatus = ps;
      }
    }
    const touchPortfolioMeta =
      form.visibleToClient !== undefined || form.portfolioStatus !== undefined;

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
        ...portfolioPatch,
        ...(touchPortfolioMeta
          ? { advisorConfirmedAt: new Date(), confirmedByUserId: auth.userId }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, id)));
    try {
      await logActivity("contract", id, "update", { fields: Object.keys(form) });
    } catch {}
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[updateContract]", { ...pgErrorMeta(e), message: msg, err: e });
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

/** Zveřejní smlouvu v klientském portfoliu po kontrole (čekající návrh z dokumentu / AI). */
export async function approveContractForClientPortal(contractId: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const [row] = await db
    .select({
      sourceDocumentId: contracts.sourceDocumentId,
      contactId: contracts.contactId,
      productName: contracts.productName,
      partnerName: contracts.partnerName,
    })
    .from(contracts)
    .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, contractId)))
    .limit(1);
  await db
    .update(contracts)
    .set({
      visibleToClient: true,
      portfolioStatus: "active",
      advisorConfirmedAt: new Date(),
      confirmedByUserId: auth.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, contractId)));
  if (row?.sourceDocumentId) {
    await db
      .update(documents)
      .set({
        businessStatus: "applied_to_client_portal",
        updatedAt: new Date(),
      })
      .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.id, row.sourceDocumentId)));
  }
  if (row?.contactId) {
    try {
      const label = [row.productName, row.partnerName].filter(Boolean).join(" – ") || "Nová smlouva";
      await createPortalNotification({
        tenantId: auth.tenantId,
        contactId: row.contactId,
        type: "important_date",
        title: `Smlouva přidána do portfolia: ${label}`,
        relatedEntityType: "contract",
        relatedEntityId: contractId,
      });
    } catch {
      /* best-effort */
    }
  }
  try {
    await logActivity("contract", contractId, "publish_portfolio", {});
  } catch {}
}

// ─── Fáze 16: Contract-level AI provenance ────────────────────────────────────

/**
 * Fáze 16: Contract-level AI provenance.
 * Najde applied review, které vytvořilo daný contract (createdContractId).
 * Vrací per-field provenance pro contract a payment scope.
 */
export type ContractAiProvenanceResult = {
  reviewId: string;
  appliedAt: string | null;
  /** Pole potvrzená poradcem (scope="contract") */
  confirmedContractFields: string[];
  /** Pole auto-aplikovaná z AI Review (contractEnforcement.autoAppliedFields) */
  autoAppliedContractFields: string[];
  /** Contract pole čekající na potvrzení (prefill_confirm policy) */
  pendingContractFields: string[];
  /** Contract pole vyžadující ruční doplnění */
  manualRequiredContractFields: string[];
  /** Pole potvrzená poradcem (scope="payment") */
  confirmedPaymentFields: string[];
  /** Payment pole čekající na potvrzení */
  pendingPaymentFields: string[];
  /** Payment pole vyžadující ruční doplnění */
  manualRequiredPaymentFields: string[];
  /** True pokud review pochází z supporting dokumentu (výplatní lístek apod.) */
  supportingDocumentGuard: boolean;
} | null;

async function loadContractAiProvenance(contractId: string): Promise<ContractAiProvenanceResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:read")) return null;

    const rows = await db
      .select({
        id: contractUploadReviews.id,
        appliedAt: contractUploadReviews.appliedAt,
        applyResultPayload: contractUploadReviews.applyResultPayload,
      })
      .from(contractUploadReviews)
      .where(
        and(
          eq(contractUploadReviews.tenantId, auth.tenantId),
          eq(contractUploadReviews.reviewStatus, "applied"),
          sql`${contractUploadReviews.applyResultPayload}->>'createdContractId' = ${contractId}`,
        )
      )
      .orderBy(desc(contractUploadReviews.appliedAt))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const payload = row.applyResultPayload as Record<string, unknown> | null | undefined;
    const confirmedFieldsTrace = payload?.confirmedFieldsTrace as
      | Record<string, { scope?: string }>
      | null
      | undefined;

    const confirmedContractFields: string[] = [];
    const confirmedPaymentFields: string[] = [];
    if (confirmedFieldsTrace) {
      for (const [fieldKey, meta] of Object.entries(confirmedFieldsTrace)) {
        if (meta?.scope === "contract") confirmedContractFields.push(fieldKey);
        if (meta?.scope === "payment") confirmedPaymentFields.push(fieldKey);
      }
    }

    const policyTrace = payload?.policyEnforcementTrace as Record<string, unknown> | null | undefined;
    const contractEnf = policyTrace?.contractEnforcement as {
      autoAppliedFields?: string[];
      pendingConfirmationFields?: string[];
      manualRequiredFields?: string[];
    } | null | undefined;
    const paymentEnf = policyTrace?.paymentEnforcement as {
      pendingConfirmationFields?: string[];
      manualRequiredFields?: string[];
    } | null | undefined;

    return {
      reviewId: row.id,
      appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
      confirmedContractFields,
      autoAppliedContractFields: contractEnf?.autoAppliedFields ?? [],
      pendingContractFields: contractEnf?.pendingConfirmationFields ?? [],
      manualRequiredContractFields: contractEnf?.manualRequiredFields ?? [],
      confirmedPaymentFields,
      pendingPaymentFields: paymentEnf?.pendingConfirmationFields ?? [],
      manualRequiredPaymentFields: paymentEnf?.manualRequiredFields ?? [],
      supportingDocumentGuard: Boolean((policyTrace as Record<string, unknown> | null | undefined)?.supportingDocumentGuard),
    };
  } catch {
    return null;
  }
}

export const getContractAiProvenance = cache(loadContractAiProvenance);

// ─── Fáze 16: Inline Pending Confirm z contract detailu ───────────────────────

export type ConfirmContractPendingFieldResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Fáze 16: Thin wrapper přes confirmPendingField pro inline potvrzení
 * pending AI polí přímo z detailu smlouvy.
 *
 * scope musí být "contract" nebo "payment" — nikdy "contact".
 * Supporting document guard zůstává tvrdý.
 * Idempotentní: druhé potvrzení je bezpečně ignorováno.
 */
export async function confirmContractPendingFieldAction(
  reviewId: string,
  fieldKey: string,
  scope: "contract" | "payment",
): Promise<ConfirmContractPendingFieldResult> {
  const { confirmPendingField } = await import("./contract-review");
  const result = await confirmPendingField(reviewId, fieldKey, scope);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}
