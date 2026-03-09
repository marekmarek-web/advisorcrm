"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { contracts, contacts, unsubscribeTokens } from "db";
import { eq, and } from "db";
import { getPaymentAccountForContract } from "./payment-accounts";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PaymentInstruction = {
  segment: string;
  partnerName: string;
  productName: string | null;
  contractNumber: string | null;
  accountNumber: string;
  bank: string | null;
  note: string | null;
};

export async function getPaymentInstructionsForContact(contactId: string): Promise<PaymentInstruction[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId))).limit(1);
  if (!contact) return [];
  const contractRows = await db.select().from(contracts).where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.contactId, contactId)));
  const out: PaymentInstruction[] = [];
  for (const c of contractRows) {
    const acc = await getPaymentAccountForContract(auth.tenantId, c.partnerId, c.partnerName, c.segment);
    if (acc) {
      out.push({
        segment: c.segment,
        partnerName: acc.partnerName || c.partnerName || "—",
        productName: c.productName,
        contractNumber: c.contractNumber,
        accountNumber: acc.accountNumber,
        bank: acc.bank,
        note: acc.note,
      });
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
    const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const unsubToken = crypto.randomUUID().replace(/-/g, "");
    await db.insert(unsubscribeTokens).values({
      contactId,
      token: unsubToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    const unsubLink = `${baseUrl}/client/unsubscribe?token=${unsubToken}`;
    const { error } = await resend.emails.send({
      from,
      to: contact.email,
      subject: "Platební instrukce – WePlan",
      html: `<p>Dobrý den, ${contact.firstName} ${contact.lastName},</p><p>v příloze naleznete platební instrukce.</p><p><a href="${unsubLink}">Odhlásit se z notifikací</a></p>`,
      attachments: [{ filename: "platebni-instrukce.pdf", content: pdfBuffer }],
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Chyba odeslání" };
  }
}
