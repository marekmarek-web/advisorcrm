"use server";

import { cache } from "react";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import type { TenantContextDb } from "@/lib/db/with-tenant-context";
import { hasPermission } from "@/lib/auth/permissions";
import {
  contracts,
  partners,
  products,
  documents,
  contacts,
  contractUploadReviews,
  tenants,
  clientPaymentSetups,
  auditLog,
} from "db";
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
import { ensureUserProfileRowForAdvisor } from "@/lib/db/ensure-user-profile-for-contract-fk";
import { recomputeBjForContract } from "@/lib/bj/recompute-bj-for-contract";
import { classifyProduct, type ProductCategory } from "@/lib/ai/product-categories";
import { contractRowFromPaymentSetup } from "@/lib/client-portfolio/payment-setup-portfolio-synth";
import { selectStandalonePaymentSetupsForClientContact } from "@/lib/client-portfolio/standalone-payment-setups-query";

export type ContractRow = {
  id: string;
  contactId: string;
  segment: string;
  /** Syntetický řádek z `client_payment_setups` — není z tabulky `contracts`. */
  portfolioRowKind?: "contract" | "payment_setup";
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
  const rows = await withAuthContext(async (auth, tx) => {
    if (auth.roleName === "Client") {
      if (auth.contactId !== contactId) throw new Error("Forbidden");
    } else if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Forbidden");
    }
    return tx
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
  });
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
  return withAuthContext(async (auth, tx) => {
    const isClient = auth.roleName === "Client";
    if (isClient) {
      if (auth.contactId !== contactId) throw new Error("Forbidden");
    } else if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Forbidden");
    }

    const rows = await tx
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
      // B1.2 — `contracts.note` is advisor-only (free-form internal note);
      // never surface it through the client portal read-model.
      note: isClient ? null : r.note,
    }));

    const missingAmountIds = mapped
      .filter((c) => !c.premiumAmount && !c.premiumAnnual && c.contractNumber)
      .map((c) => c.id);

    if (missingAmountIds.length > 0) {
      const paymentRows = await tx
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

    /**
     * Platební instrukce bez záznamu ve `contracts` (nebo s číslem, které v portfoliu žádná
     * publikovaná smlouva neeviduje) se zobrazí jako samostatné položky. Jen doplňujeme read model.
     */
    const contractNumbersCovered = new Set(
      mapped.map((c) => c.contractNumber?.trim()).filter((n): n is string => !!n)
    );
    const standalonePaymentSetups = await selectStandalonePaymentSetupsForClientContact(tx, {
      tenantId: auth.tenantId,
      contactIds: [contactId],
      contractNumbersWithPublishedRows: contractNumbersCovered,
    });
    const syntheticRows = standalonePaymentSetups.map((ps) => contractRowFromPaymentSetup(contactId, ps));

    const sortKey = (c: ContractRow) => {
      const s = c.startDate?.trim();
      if (s) return s;
      return c.createdAt ? c.createdAt.toISOString().slice(0, 10) : "0000-00-00";
    };
    return [...mapped, ...syntheticRows].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  });
}

export async function getPartnersForTenant(): Promise<{ id: string; name: string; segment: string }[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    return tx
      .select({ id: partners.id, name: partners.name, segment: partners.segment })
      .from(partners)
      .where(or(eq(partners.tenantId, auth.tenantId), isNull(partners.tenantId)))
      .orderBy(partners.name);
  });
}

export type ProductOption = { id: string; name: string; category?: string | null; isTbd?: boolean | null };

export async function getProductsForPartner(partnerId: string): Promise<ProductOption[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    return tx
      .select({ id: products.id, name: products.name, category: products.category, isTbd: products.isTbd })
      .from(products)
      .where(eq(products.partnerId, partnerId))
      .orderBy(asc(products.category), asc(products.name));
  });
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
function fkViolationUserMessage(detail: string | undefined, constraint?: string): string | null {
  const combined = `${detail ?? ""} ${constraint ?? ""}`.toLowerCase();
  if (!combined.trim()) return null;
  const d = combined;
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
  if (d.includes("advisor_id") || d.includes("confirmed_by_user_id")) {
    return "Účet poradce neodpovídá databázi. Obnovte stránku nebo kontaktujte správce.";
  }
  return null;
}

type RefCheck = { ok: true } | { ok: false; message: string };

/** Před INSERT/UPDATE smlouvy: klient v tenantovi, partner a produkt z globálního nebo tenant katalogu, produkt patří k partnerovi. */
async function assertContractPartnerProductRefs(
  tx: TenantContextDb,
  opts: {
    tenantId: string;
    contactId?: string;
    partnerId?: string | null;
    productId?: string | null;
  },
): Promise<RefCheck> {
  if (opts.contactId?.trim()) {
    const [c] = await tx
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
    const [p] = await tx
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
    const rows = await tx
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
    /** "one_time" = jednorázová, "regular" = pravidelná, null = neznámo */
    paymentType?: "one_time" | "regular" | null;
    /** Explicitní frekvence platby ze segmented controlu (F2). */
    paymentFrequency?: "monthly" | "annual" | "quarterly" | "semiannual" | "one_time";
    // ── BJ vstupy ────────────────────────────────────────────────────────
    entryFee?: string;
    loanPrincipal?: string;
    participantContribution?: string;
    hasPpi?: boolean | null;
    productCategory?: ProductCategory | null;
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

    if (!auth.tenantId?.trim()) {
      return {
        ok: false,
        message: "Chybí workspace (tenant). Obnovte stránku nebo dokončete registraci.",
      };
    }

    const advisorUid = auth.userId.trim();
    await ensureUserProfileRowForAdvisor(advisorUid, auth.tenantId);

    const outcome = await withTenantContextFromAuth(auth, async (tx): Promise<CreateContractResult> => {
      let partnerName = normalized.partnerName?.trim() || null;
      let productName = normalized.productName?.trim() || null;
      if (normalized.partnerId && !partnerName) {
        const [p] = await tx
          .select({ name: partners.name })
          .from(partners)
          .where(eq(partners.id, normalized.partnerId))
          .limit(1);
        if (p) partnerName = p.name;
      }
      if (normalized.productId && !productName) {
        const [pr] = await tx
          .select({ name: products.name })
          .from(products)
          .where(eq(products.id, normalized.productId))
          .limit(1);
        if (pr) productName = pr.name;
      }

      const [tenantRow] = await tx
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

      const refCheck = await assertContractPartnerProductRefs(tx, {
        tenantId: auth.tenantId,
        contactId,
        partnerId: normalized.partnerId ?? null,
        productId: normalized.productId ?? null,
      });
      if (!refCheck.ok) {
        return { ok: false, message: refCheck.message };
      }

      const initialPortfolioAttributes: Record<string, unknown> = {};
      if (normalized.paymentType) {
        initialPortfolioAttributes.paymentType = normalized.paymentType;
      }
      if (normalized.paymentFrequencyLabel) {
        initialPortfolioAttributes.paymentFrequencyLabel = normalized.paymentFrequencyLabel;
      }
      if (normalized.entryFee) initialPortfolioAttributes.entryFee = normalized.entryFee;
      if (normalized.loanPrincipal) initialPortfolioAttributes.loanPrincipal = normalized.loanPrincipal;
      if (normalized.participantContribution) {
        initialPortfolioAttributes.participantContribution = normalized.participantContribution;
      }
      if (typeof normalized.hasPpi === "boolean") initialPortfolioAttributes.hasPpi = normalized.hasPpi;

      // ── Klasifikace produktu pro BJ přepočet ────────────────────────────
      // Auto-detect z partnera/produktu/segmentu; override z formuláře má přednost.
      const hasEntryFee =
        normalized.entryFee != null &&
        normalized.entryFee !== "" &&
        Number(normalized.entryFee.replace(",", ".")) > 0;
      const classification = classifyProduct({
        providerName: partnerName,
        productName,
        segment,
        paymentType: normalized.paymentType,
        hasEntryFee,
        hasPpi: normalized.hasPpi,
      });
      const resolvedCategory = normalized.productCategory ?? classification.category;
      const resolvedSubtypes = classification.subtypes.length > 0 ? classification.subtypes : null;

      const [row] = await tx
        .insert(contracts)
        .values({
          tenantId: auth.tenantId,
          contactId,
          advisorId: advisorUid,
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
          confirmedByUserId: advisorUid,
          portfolioAttributes: initialPortfolioAttributes,
          productCategory: resolvedCategory,
          productSubtype: resolvedSubtypes,
        })
        .returning({ id: contracts.id });
      const newId = row?.id ?? null;
      if (!newId) {
        return { ok: false, message: "Smlouvu se nepodařilo uložit. Zkuste to znovu." };
      }
      return { ok: true, id: newId };
    });
    if (outcome.ok) {
      try {
        await logActivity("contract", outcome.id, "create", { segment, contactId });
      } catch {}
      // createContract nyní plní productCategory (auto-detect + user override),
      // takže recompute BJ spočítá BJ jednotky pokud jsou vstupní částky k dispozici.
      try {
        await recomputeBjForContract({ tenantId: auth.tenantId, contractId: outcome.id });
      } catch {}
    }
    return outcome;
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    const meta = pgErrorMeta(e);
    console.error("[createContract]", { ...meta, message: msg, err: e });
    if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
      const fkMsg = fkViolationUserMessage(meta.detail, meta.constraint);
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
      const fkMsg = fkViolationUserMessage(meta.detail, meta.constraint);
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
    /** "one_time" = jednorázová, "regular" = pravidelná, null = neznámo */
    paymentType?: "one_time" | "regular" | null;
    /** Explicitní frekvence platby ze segmented controlu (F2). */
    paymentFrequency?: "monthly" | "annual" | "quarterly" | "semiannual" | "one_time";
    // ── BJ vstupy ────────────────────────────────────────────────────────
    entryFee?: string;
    loanPrincipal?: string;
    participantContribution?: string;
    hasPpi?: boolean | null;
    productCategory?: ProductCategory | null;
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
      paymentType: form.paymentType ?? null,
      // Pokud volající neposlal frequency, derivuj z paymentType.
      paymentFrequency:
        form.paymentFrequency ??
        (form.paymentType === "one_time" ? "one_time" : "monthly"),
      entryFee: form.entryFee ?? "",
      loanPrincipal: form.loanPrincipal ?? "",
      participantContribution: form.participantContribution ?? "",
      hasPpi: form.hasPpi ?? null,
      productCategory: form.productCategory ?? null,
    };

    const validation = validateContractFormForSubmit(full);
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const normalized = normalizeContractFormForSave(full);
    const segment = normalized.segment;

    if (!auth.tenantId?.trim()) {
      throw new Error("Chybí workspace (tenant). Obnovte stránku nebo dokončete registraci.");
    }

    const portfolioPatch: Record<string, unknown> = {};
    if (form.visibleToClient !== undefined) portfolioPatch.visibleToClient = form.visibleToClient;
    if (form.portfolioStatus !== undefined) {
      const ps = form.portfolioStatus.trim();
      if (["draft", "pending_review", "active", "ended"].includes(ps)) {
        portfolioPatch.portfolioStatus = ps;
      }
    }
    // Při změně typu platby / frekvence / BJ vstupů slijeme hodnoty do
    // existujícího portfolio_attributes JSONB (`||` operátor), abychom
    // nepřepisovali ostatní klíče.
    {
      const patch: Record<string, unknown> = {};
      if (normalized.paymentType) patch.paymentType = normalized.paymentType;
      if (normalized.paymentFrequencyLabel) patch.paymentFrequencyLabel = normalized.paymentFrequencyLabel;
      if (normalized.entryFee) patch.entryFee = normalized.entryFee;
      if (normalized.loanPrincipal) patch.loanPrincipal = normalized.loanPrincipal;
      if (normalized.participantContribution) {
        patch.participantContribution = normalized.participantContribution;
      }
      if (typeof normalized.hasPpi === "boolean") patch.hasPpi = normalized.hasPpi;
      if (Object.keys(patch).length > 0) {
        const patchJson = JSON.stringify(patch);
        portfolioPatch.portfolioAttributes = sql`COALESCE(${contracts.portfolioAttributes}, '{}'::jsonb) || ${patchJson}::jsonb`;
      }
    }
    // B2.4 — whitelist finančních / smluvních polí, které opravdu znamenají
    // "advisor confirmnul obsah smlouvy". Visibility/portfolio-status toggly
    // nemají smysl promítat do `advisorConfirmedAt`, protože původní potvrzení
    // obsahu platí dál; jinak by každý klik "zobrazit klientovi" vyresetoval
    // datum konfirmace a rozbíjel AI Review reconciliation (trust signal,
    // že smlouva je ručně odsouhlasená vs čerstvě AI-imported).
    const financialFieldChanged =
      form.premiumAmount !== undefined ||
      form.premiumAnnual !== undefined ||
      form.contractNumber !== undefined ||
      form.startDate !== undefined ||
      form.anniversaryDate !== undefined ||
      form.segment !== undefined ||
      form.partnerId !== undefined ||
      form.partnerName !== undefined ||
      form.productId !== undefined ||
      form.productName !== undefined ||
      form.note !== undefined ||
      form.paymentType !== undefined ||
      form.paymentFrequency !== undefined ||
      form.entryFee !== undefined ||
      form.loanPrincipal !== undefined ||
      form.participantContribution !== undefined ||
      form.hasPpi !== undefined ||
      form.productCategory !== undefined;
    const touchPortfolioMeta = financialFieldChanged;

    await withTenantContextFromAuth(auth, async (tx) => {
      let partnerName: string | null = normalized.partnerName?.trim() || null;
      let productName: string | null = normalized.productName?.trim() || null;
      if (normalized.partnerId && !partnerName) {
        const [p] = await tx
          .select({ name: partners.name })
          .from(partners)
          .where(eq(partners.id, normalized.partnerId))
          .limit(1);
        if (p) partnerName = p.name;
      }
      if (normalized.productId && !productName) {
        const [pr] = await tx
          .select({ name: products.name })
          .from(products)
          .where(eq(products.id, normalized.productId))
          .limit(1);
        if (pr) productName = pr.name;
      }

      const updateRef = await assertContractPartnerProductRefs(tx, {
        tenantId: auth.tenantId,
        partnerId: normalized.partnerId ?? null,
        productId: normalized.productId ?? null,
      });
      if (!updateRef.ok) {
        throw new Error(updateRef.message);
      }

      // Klasifikace — auto-detect + user override (jako v createContract).
      const hasEntryFeeUpd =
        normalized.entryFee != null &&
        normalized.entryFee !== "" &&
        Number(normalized.entryFee.replace(",", ".")) > 0;
      const classificationUpd = classifyProduct({
        providerName: partnerName,
        productName,
        segment,
        paymentType: normalized.paymentType,
        hasEntryFee: hasEntryFeeUpd,
        hasPpi: normalized.hasPpi,
      });
      const resolvedCategoryUpd = normalized.productCategory ?? classificationUpd.category;
      const resolvedSubtypesUpd =
        classificationUpd.subtypes.length > 0 ? classificationUpd.subtypes : null;

      await tx
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
          productCategory: resolvedCategoryUpd,
          productSubtype: resolvedSubtypesUpd,
          ...portfolioPatch,
          ...(touchPortfolioMeta
            ? { advisorConfirmedAt: new Date(), confirmedByUserId: auth.userId }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, id)));
    });
    try {
      await logActivity("contract", id, "update", { fields: Object.keys(form) });
    } catch {}
    // Po editaci premium/loanPrincipal/paymentType se mohla změnit BJ hodnota.
    // Repo-level reload + recompute je sync s UI, proto to pouštíme hned.
    try {
      await recomputeBjForContract({ tenantId: auth.tenantId, contractId: id });
    } catch {}
    // B1.8: Invalidace RSC cache klientské zóny — bez tohoto klient po refreshi
    // vidí stale smlouvy/portfolio. Paths + tag aby chytlo i bundle cache.
    try {
      revalidatePath("/client", "layout");
      revalidatePath("/client/portfolio");
      revalidatePath("/client/contracts");
      revalidatePath("/client/payments");
      revalidatePath("/client/documents");
      // Najdeme contactId pro cílenou tag invalidaci (bez ní by byl tag bez efektu).
      const [row] = await withTenantContextFromAuth(auth, (tx) =>
        tx
          .select({ contactId: contracts.contactId })
          .from(contracts)
          .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, id)))
          .limit(1),
      );
      if (row?.contactId) {
        revalidateTag(`contact:${row.contactId}`, "default");
      }
    } catch (rev) {
      // eslint-disable-next-line no-console
      console.warn("[updateContract] revalidate failed", rev);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[updateContract]", { ...pgErrorMeta(e), message: msg, err: e });
    throw new Error(e instanceof Error ? e.message : "Smlouvu se nepodařilo upravit.");
  }
}

export type ManualProductionBjOverrideResult =
  | { ok: true; id: string; productionBj: number }
  | { ok: false; message: string };

/**
 * Ruční override produkce v BJ. Nemění žádné klientské částky (`premium_*`
 * ani `portfolio_attributes`); zapisuje pouze derived BJ + auditní snapshot.
 */
export async function setManualProductionBjOverride(
  contractId: string,
  productionBj: number,
  reason: string,
): Promise<ManualProductionBjOverrideResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { ok: false, message: "Nemáte oprávnění upravovat produkci." };
  }
  const normalizedReason = reason.trim();
  if (!contractId.trim()) return { ok: false, message: "Chybí identifikátor smlouvy." };
  if (!Number.isFinite(productionBj) || productionBj < 0) {
    return { ok: false, message: "Produkce BJ musí být nezáporné číslo." };
  }
  if (normalizedReason.length < 5) {
    return { ok: false, message: "U ruční úpravy produkce je potřeba uvést důvod." };
  }

  const roundedBj = Math.round(productionBj * 10000) / 10000;
  const snapshot = {
    formula: "manual_override" as const,
    amountCzk: 0,
    coefficient: null,
    divisor: null,
    matchedRule: {
      productCategory: "MANUAL_OVERRIDE",
      partnerPattern: null,
      subtype: null,
      tenantScope: "tenant" as const,
    },
    notes: ["Produkce BJ byla ručně upravena oprávněným uživatelem."],
    manualOverrideReason: normalizedReason,
    manualOverrideByUserId: auth.userId,
    computedAt: new Date().toISOString(),
  };

  const updated = await withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx
      .update(contracts)
      .set({
        bjUnits: String(roundedBj),
        bjCalculation: snapshot,
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, contractId)))
      .returning({ id: contracts.id });

    if (row?.id) {
      await tx.insert(auditLog).values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        action: "manual_production_bj_override",
        entityType: "contract",
        entityId: contractId,
        meta: {
          productionBj: roundedBj,
          reason: normalizedReason,
        },
      });
    }
    return row;
  });

  if (!updated?.id) return { ok: false, message: "Smlouva nebyla nalezena." };
  try {
    await logActivity("contract", contractId, "manual_production_bj_override", {
      productionBj: roundedBj,
      reason: normalizedReason,
    });
  } catch {}
  return { ok: true, id: updated.id, productionBj: roundedBj };
}

export async function deleteContract(id: string) {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    await withTenantContextFromAuth(auth, (tx) =>
      tx.delete(contracts).where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, id))),
    );
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
  const row = await withTenantContextFromAuth(auth, async (tx) => {
    const [r] = await tx
      .select({
        sourceDocumentId: contracts.sourceDocumentId,
        contactId: contracts.contactId,
        productName: contracts.productName,
        partnerName: contracts.partnerName,
      })
      .from(contracts)
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, contractId)))
      .limit(1);
    await tx
      .update(contracts)
      .set({
        visibleToClient: true,
        portfolioStatus: "active",
        advisorConfirmedAt: new Date(),
        confirmedByUserId: auth.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, contractId)));
    if (r?.sourceDocumentId) {
      await tx
        .update(documents)
        .set({
          businessStatus: "applied_to_client_portal",
          updatedAt: new Date(),
        })
        .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.id, r.sourceDocumentId)));
    }
    return r;
  });
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

    const rows = await withTenantContextFromAuth(auth, (tx) =>
      tx
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
        .limit(1),
    );

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
