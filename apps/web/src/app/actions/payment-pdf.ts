"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contracts, contacts, clientPaymentSetups, unsubscribeTokens } from "db";
import { eq, and, sql } from "db";
import { getPaymentAccountForContract } from "./payment-accounts";
import { loadAdvisorMailHeadersForCurrentUser } from "@/lib/email/advisor-mail-headers";
import { paymentPdfAttachmentClientTemplate } from "@/lib/email/templates";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  /** Linked contract ID from canonical artifact (nullable for legacy catalog-only entries). */
  contractId?: string | null;
};

type AiPaymentSetupInstructionRow = {
  paymentType: string;
  providerName: string | null;
  productName: string | null;
  contractNumber: string | null;
  accountNumber: string | null;
  bankCode: string | null;
  iban: string | null;
  variableSymbol: string | null;
  amount: string | null;
  frequency: string | null;
  paymentInstructionsText: string | null;
  /** Canonical segment z navázané smlouvy (preferováno před paymentType mapováním). */
  contractSegment?: string | null;
};

function normalizeInstructionKeyPart(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function paymentInstructionDedupKey(instruction: PaymentInstruction): string {
  return [
    normalizeInstructionKeyPart(instruction.partnerName),
    normalizeInstructionKeyPart(instruction.productName),
    normalizeInstructionKeyPart(instruction.contractNumber),
    normalizeInstructionKeyPart(instruction.accountNumber),
    normalizeInstructionKeyPart(instruction.variableSymbol),
  ].join("|");
}

/**
 * Resolve canonical segment for portal display.
 * Priority: contractSegment (canonical, from joined contract row) > paymentType fallback mapping.
 * This ensures AI Review payment setups are grouped correctly with the rest of the portfolio.
 */
function resolvePortalSegmentFromPaymentType(
  paymentType: string | null | undefined,
  contractSegment?: string | null,
): string {
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

  const bankCode = row.bankCode?.trim();
  return bankCode ? `${accountNumber}/${bankCode}` : accountNumber;
}

function mapAiPaymentSetupToInstruction(
  row: AiPaymentSetupInstructionRow
): PaymentInstruction | null {
  const accountNumber = buildPortalPaymentAccount(row);
  if (!accountNumber) return null;

  return {
    segment: resolvePortalSegmentFromPaymentType(row.paymentType, row.contractSegment),
    partnerName: row.providerName?.trim() || "—",
    productName: row.productName?.trim() || null,
    contractNumber: row.contractNumber?.trim() || null,
    accountNumber,
    bank: null,
    note: row.paymentInstructionsText?.trim() || null,
    amount: row.amount?.trim() || null,
    frequency: row.frequency?.trim() || null,
    variableSymbol: row.variableSymbol?.trim() || null,
  };
}

export async function getPaymentInstructionsForContact(contactId: string): Promise<PaymentInstruction[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId))).limit(1);
  if (!contact) return [];

  const aiReviewPaymentRows = await db
    .select({
      paymentType: clientPaymentSetups.paymentType,
      providerName: clientPaymentSetups.providerName,
      productName: clientPaymentSetups.productName,
      contractNumber: clientPaymentSetups.contractNumber,
      accountNumber: clientPaymentSetups.accountNumber,
      bankCode: clientPaymentSetups.bankCode,
      iban: clientPaymentSetups.iban,
      variableSymbol: clientPaymentSetups.variableSymbol,
      amount: clientPaymentSetups.amount,
      frequency: clientPaymentSetups.frequency,
      paymentInstructionsText: clientPaymentSetups.paymentInstructionsText,
      contractSegment: sql<string | null>`(
        SELECT c.segment FROM contracts c
        WHERE c.tenant_id = ${clientPaymentSetups.tenantId}
          AND c.contact_id = ${clientPaymentSetups.contactId}
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
        eq(clientPaymentSetups.needsHumanReview, false)
      )
    );

  const out = aiReviewPaymentRows
    .map(mapAiPaymentSetupToInstruction)
    .filter((instruction): instruction is PaymentInstruction => instruction !== null);
  const seen = new Set(out.map(paymentInstructionDedupKey));

  const isClient = auth.roleName === "Client";
  const contractRows = await db
    .select()
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
  const visibleContractRows = contractRows;

  for (const c of visibleContractRows) {
    try {
      const acc = await getPaymentAccountForContract(auth.tenantId, c.partnerId, c.partnerName, c.segment);
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
          contractId: c.id,
        };
        const dedupKey = paymentInstructionDedupKey(legacyInstruction);
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        out.push(legacyInstruction);
      }
    } catch {
      // Per-contract payment resolution must not crash the whole page
      continue;
    }
  }
  return out;
}

export async function generatePaymentPdfBuffer(contactId: string): Promise<Buffer> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const [contact] = await db.select({ firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId))).limit(1);
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
  const [contact] = await db.select({ email: contacts.email, firstName: contacts.firstName, lastName: contacts.lastName, notificationUnsubscribedAt: contacts.notificationUnsubscribedAt }).from(contacts).where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId))).limit(1);
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
    await db.insert(unsubscribeTokens).values({
      contactId,
      token: unsubToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
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
