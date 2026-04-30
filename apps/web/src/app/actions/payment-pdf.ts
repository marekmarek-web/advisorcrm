"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { contracts, contacts, clientPaymentSetups, unsubscribeTokens } from "db";
import { eq, and, sql } from "db";
import { getPaymentAccountForContract } from "./payment-accounts";
import { loadAdvisorMailHeadersForCurrentUser } from "@/lib/email/advisor-mail-headers";
import { paymentPdfAttachmentClientTemplate } from "@/lib/email/templates";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDomesticAccountDisplayLine } from "@/lib/ai/payment-field-contract";
import {
  dedupePortalPaymentInstructions,
  portalPaymentInstructionDedupKey,
} from "@/lib/client-portal/portal-payment-instruction-dedup";

export type PaymentInstruction = {
  segment: string;
  partnerName: string;
  productName: string | null;
  contractNumber: string | null;
  accountNumber: string;
  bank: string | null;
  note: string | null;
  amount: string | null;
  frequency: string | null;
  variableSymbol: string | null;
  specificSymbol: string | null;
  constantSymbol: string | null;
  currency: string | null;
  /** First payment date ISO string — used for "První platba do" pill. */
  firstPaymentDate?: string | null;
  /** Řádek z aktivního platebního nastavení (AI Review / manual) — jinak null u katalogové šablony. */
  paymentSetupId: string | null;
  /** Linked contract ID from canonical artifact (nullable for legacy catalog-only entries). */
  contractId?: string | null;
  /** Stav navázané smlouvy v evidenci — pro štítek v portálu (aktivní vs. ukončené). */
  linkedContractPortfolioStatus?: string | null;
};

type AiPaymentSetupInstructionRow = {
  id: string;
  paymentType: string;
  providerName: string | null;
  productName: string | null;
  contractNumber: string | null;
  accountNumber: string | null;
  bankCode: string | null;
  iban: string | null;
  variableSymbol: string | null;
  specificSymbol: string | null;
  constantSymbol: string | null;
  currency: string | null;
  amount: string | null;
  frequency: string | null;
  firstPaymentDate: string | null;
  paymentInstructionsText: string | null;
  /** Canonical segment stored on the payment setup row (manual entry / AI). */
  rowSegment?: string | null;
  /** Canonical segment z navázané smlouvy (preferováno před paymentType mapováním). */
  contractId?: string | null;
  contractSegment?: string | null;
  contractPortfolioStatus?: string | null;
};

/**
 * Resolve canonical segment for portal display.
 * Priority: rowSegment (manual entry) > contractSegment (canonical, from joined contract row) > paymentType fallback mapping.
 */
function resolvePortalSegmentFromPaymentType(
  paymentType: string | null | undefined,
  contractSegment?: string | null,
  rowSegment?: string | null,
): string {
  if (rowSegment?.trim()) return rowSegment.trim();
  if (contractSegment?.trim()) return contractSegment.trim();
  switch ((paymentType ?? "").trim().toLowerCase()) {
    case "insurance":
      return "ZP";
    case "investment":
      return "INV";
    case "pension":
    case "dps":
      return "DPS";
    case "dip":
      return "DIP";
    case "loan":
    case "mortgage":
      return "UVER";
    default:
      return "ZP";
  }
}

function buildPortalPaymentAccount(row: AiPaymentSetupInstructionRow): string | null {
  const iban = row.iban?.trim();
  if (iban) return iban;

  const accountNumber = row.accountNumber?.trim();
  if (!accountNumber) return null;

  const display = formatDomesticAccountDisplayLine(accountNumber, row.bankCode?.trim() ?? "");
  return display || accountNumber;
}

function mapAiPaymentSetupToInstruction(
  row: AiPaymentSetupInstructionRow
): PaymentInstruction | null {
  const accountNumber = buildPortalPaymentAccount(row);
  if (!accountNumber) return null;

  return {
    segment: resolvePortalSegmentFromPaymentType(row.paymentType, row.contractSegment, row.rowSegment),
    partnerName: row.providerName?.trim() || "—",
    productName: row.productName?.trim() || null,
    contractNumber: row.contractNumber?.trim() || null,
    accountNumber,
    bank: null,
    note: row.paymentInstructionsText?.trim() || null,
    amount: row.amount?.trim() || null,
    frequency: row.frequency?.trim() || null,
    firstPaymentDate: row.firstPaymentDate?.trim() || null,
    variableSymbol: row.variableSymbol?.trim() || null,
    specificSymbol: row.specificSymbol?.trim() || null,
    constantSymbol: row.constantSymbol?.trim() || null,
    currency: row.currency?.trim() || null,
    paymentSetupId: row.id,
    contractId: row.contractId?.trim() || null,
    linkedContractPortfolioStatus: row.contractPortfolioStatus?.trim() || null,
  };
}

function normalizeContractNumberKey(value: string | null | undefined): string | null {
  const v = value?.replace(/\s+/g, " ").trim().toLowerCase();
  return v && v.length > 0 ? v : null;
}

export async function getPaymentInstructionsForContact(contactId: string): Promise<PaymentInstruction[]> {
  const auth = await requireAuthInAction();
  const isClient = auth.roleName === "Client";
  if (isClient) {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  const { contactFound, fromAi, visibleContractRows } = await withTenantContextFromAuth(auth, async (tx) => {
    // DŮLEŽITÉ: Nepoužívat `tx.select()` bez sloupců — rozbalí se na VŠECHNY sloupce
    // definované v `contacts` schématu. Pokud produkce nemá zmigrované pozdější sloupce
    // (PII enc/fingerprint, service-reminder cooldown…), query shoří a chyba se jen tiše
    // zachytí v page.tsx → klient uvidí "Platební údaje se nepodařilo načíst".
    // Explicitní seznam = odolné vůči schema drift.
    const [contact] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
      .limit(1);
    if (!contact) {
      return { contactFound: false, fromAi: [] as PaymentInstruction[], visibleContractRows: [] as Array<{
        id: string;
        segment: string;
        partnerId: string | null;
        partnerName: string | null;
        productName: string | null;
        contractNumber: string | null;
        premiumAmount: string | null;
        portfolioStatus: string | null;
      }> };
    }

    const aiReviewPaymentRows = await tx
      .select({
        id: clientPaymentSetups.id,
        paymentType: clientPaymentSetups.paymentType,
        providerName: clientPaymentSetups.providerName,
        productName: clientPaymentSetups.productName,
        contractNumber: clientPaymentSetups.contractNumber,
        accountNumber: clientPaymentSetups.accountNumber,
        bankCode: clientPaymentSetups.bankCode,
        iban: clientPaymentSetups.iban,
        variableSymbol: clientPaymentSetups.variableSymbol,
        specificSymbol: clientPaymentSetups.specificSymbol,
        constantSymbol: clientPaymentSetups.constantSymbol,
        currency: clientPaymentSetups.currency,
        amount: clientPaymentSetups.amount,
        frequency: clientPaymentSetups.frequency,
        firstPaymentDate: clientPaymentSetups.firstPaymentDate,
        paymentInstructionsText: clientPaymentSetups.paymentInstructionsText,
        rowSegment: clientPaymentSetups.segment,
        contractId: sql<string | null>`(
          SELECT c.id FROM contracts c
          WHERE c.tenant_id = ${clientPaymentSetups.tenantId}
            AND c.client_id = ${clientPaymentSetups.contactId}
            AND c.contract_number = ${clientPaymentSetups.contractNumber}
            AND c.archived_at IS NULL
          LIMIT 1
        )`,
        contractSegment: sql<string | null>`(
          SELECT c.segment FROM contracts c
          WHERE c.tenant_id = ${clientPaymentSetups.tenantId}
            AND c.client_id = ${clientPaymentSetups.contactId}
            AND c.contract_number = ${clientPaymentSetups.contractNumber}
            AND c.archived_at IS NULL
          LIMIT 1
        )`,
        contractPortfolioStatus: sql<string | null>`(
          SELECT c.portfolio_status FROM contracts c
          WHERE c.tenant_id = ${clientPaymentSetups.tenantId}
            AND c.client_id = ${clientPaymentSetups.contactId}
            AND c.contract_number = ${clientPaymentSetups.contractNumber}
            AND c.archived_at IS NULL
          LIMIT 1
        )`,
      })
      .from(clientPaymentSetups)
      .where(
        and(
          eq(clientPaymentSetups.tenantId, auth.tenantId),
          eq(clientPaymentSetups.contactId, contactId),
          eq(clientPaymentSetups.status, "active"),
          // Client portal: only show rows explicitly marked visible_to_client
          // Advisor view: show all active rows (including AI Review)
          ...(isClient
            ? [eq(clientPaymentSetups.visibleToClient, true)]
            : [eq(clientPaymentSetups.needsHumanReview, false)]
          )
        )
      );

    const fromAi = aiReviewPaymentRows
      .map(mapAiPaymentSetupToInstruction)
      .filter((instruction): instruction is PaymentInstruction => instruction !== null);

    // Explicitní sloupce (schema drift safety – viz komentář u `contacts` selectu výše).
    const contractRows = await tx
      .select({
        id: contracts.id,
        segment: contracts.segment,
        partnerId: contracts.partnerId,
        partnerName: contracts.partnerName,
        productName: contracts.productName,
        contractNumber: contracts.contractNumber,
        premiumAmount: contracts.premiumAmount,
        portfolioStatus: contracts.portfolioStatus,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, auth.tenantId),
          eq(contracts.contactId, contactId),
          ...(isClient
            ? [
                eq(contracts.visibleToClient, true),
                sql`${contracts.portfolioStatus} IN ('active', 'ended')`,
                sql`${contracts.archivedAt} IS NULL`,
              ]
            : []),
        ),
      );

    return { contactFound: true, fromAi, visibleContractRows: contractRows };
  });

  if (!contactFound) return [];

  const publishedContractNumberKeys = new Set<string>();
  for (const c of visibleContractRows) {
    const k = normalizeContractNumberKey(c.contractNumber != null ? String(c.contractNumber) : null);
    if (k) publishedContractNumberKeys.add(k);
  }

  // For client view: visible_to_client flag already filters in SQL; include all fromAi results.
  // Legacy contract-number check only applies when no paymentSetupId is present.
  let out = isClient
    ? fromAi.filter((instr) => {
        // Rows with a paymentSetupId already passed the visible_to_client=true filter in SQL
        if (instr.paymentSetupId) return true;
        const cn = normalizeContractNumberKey(instr.contractNumber);
        if (!cn) return false;
        return publishedContractNumberKeys.has(cn);
      })
    : fromAi;
  out = dedupePortalPaymentInstructions(out);

  const seen = new Set(out.map(portalPaymentInstructionDedupKey));

  for (const c of visibleContractRows) {
    try {
      const acc = await getPaymentAccountForContract(
        auth.tenantId,
        c.partnerId,
        c.partnerName,
        c.segment ?? "ZP",
      );
      if (acc) {
        const legacyInstruction: PaymentInstruction = {
          segment: c.segment ?? "ZP",
          partnerName: acc.partnerName || c.partnerName || "—",
          productName: c.productName ?? null,
          contractNumber: c.contractNumber ?? null,
          accountNumber: acc.accountNumber,
          bank: acc.bank,
          note: acc.note,
          amount: c.premiumAmount ?? null,
          frequency: c.premiumAmount ? "měsíčně" : null,
          variableSymbol: c.contractNumber ?? null,
          specificSymbol: null,
          constantSymbol: null,
          currency: null,
          paymentSetupId: null,
          contractId: c.id,
          linkedContractPortfolioStatus: c.portfolioStatus ?? null,
        };
        const dedupKey = portalPaymentInstructionDedupKey(legacyInstruction);
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        out.push(legacyInstruction);
      }
    } catch {
      // Per-contract payment resolution must not crash the whole page
      continue;
    }
  }
  return dedupePortalPaymentInstructions(out);
}

export async function generatePaymentPdfBuffer(contactId: string): Promise<Buffer> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const contact = await withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx
      .select({ firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
      .limit(1);
    return row;
  });
  if (!contact) throw new Error("Kontakt nenalezen");
  const instructions = await getPaymentInstructionsForContact(contactId);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([595, 842]);
  const margin = 50;
  let y = page.getHeight() - margin;
  page.drawText(`Platební instrukce – ${contact.firstName} ${contact.lastName}`, { x: margin, y, size: 14, font, color: rgb(0, 0, 0) });
  y -= 24;
  for (const i of instructions) {
    if (y < margin + 60) {
      page = doc.addPage([595, 842]);
      y = page.getHeight() - margin;
    }
    const lines = [
      `${i.segment} – ${i.partnerName}${i.productName ? ` / ${i.productName}` : ""}`,
      `Účet: ${i.accountNumber}${i.bank ? `, banka: ${i.bank}` : ""}`,
      i.contractNumber ? `Číslo smlouvy: ${i.contractNumber}` : null,
      i.note ? `Poznámka: ${i.note}` : null,
    ].filter(Boolean) as string[];
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 14;
    }
    y -= 8;
  }
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

export async function sendPaymentPdfToClient(contactId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) return { ok: false, error: "Forbidden" };
  const contact = await withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx
      .select({
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        notificationUnsubscribedAt: contacts.notificationUnsubscribedAt,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
      .limit(1);
    return row;
  });
  if (!contact) return { ok: false, error: "Kontakt nenalezen" };
  if (!contact.email) return { ok: false, error: "U kontaktu chybí e-mail" };
  if (contact.notificationUnsubscribedAt) return { ok: false, error: "Klient se odhlásil z notifikací" };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY není nastaven" };
  try {
    const pdfBuffer = await generatePaymentPdfBuffer(contactId);
    const Resend = (await import("resend")).Resend;
    const resend = new Resend(apiKey);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const unsubToken = crypto.randomUUID().replace(/-/g, "");
    await withTenantContextFromAuth(auth, (tx) =>
      tx.insert(unsubscribeTokens).values({
        contactId,
        token: unsubToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    );
    const unsubLink = `${baseUrl}/client/unsubscribe?token=${unsubToken}`;
    const mail = await loadAdvisorMailHeadersForCurrentUser();
    const { subject, html } = paymentPdfAttachmentClientTemplate({
      firstName: contact.firstName,
      lastName: contact.lastName,
      unsubscribeUrl: unsubLink,
    });
    const { error } = await resend.emails.send({
      from: mail.from,
      to: contact.email,
      subject,
      html,
      attachments: [{ filename: "platebni-instrukce.pdf", content: pdfBuffer }],
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Chyba odeslání" };
  }
}
