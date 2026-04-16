/**
 * Read-side view helpers for client portal payments — pure functions over canonical
 * `PaymentInstruction` rows from `getPaymentInstructionsForContact` (CRM / publish artifact).
 * No parallel data source; presentation only.
 */

import type { PaymentInstruction } from "@/app/actions/payment-pdf";
import { formatPaymentFrequencyCs } from "./payment-display-cs";

const PLACEHOLDER_DASH = "—";

/** Strip CRM placeholder institution names — UI renders nothing instead of fake labels. */
export function institutionDisplayName(partnerName: string | null | undefined): string | null {
  const t = partnerName?.trim();
  if (!t || t === PLACEHOLDER_DASH) return null;
  return t;
}

/**
 * Primary amount line only (no frequency). Avoids showing "0 Kč" for missing numeric amount.
 */
export function formatPortalPrimaryAmountLine(instruction: PaymentInstruction): string {
  const raw = instruction.amount?.trim();
  if (raw) {
    const amount = Number(raw);
    const cur = instruction.currency?.trim();
    const suffix = cur && cur.toUpperCase() !== "CZK" ? ` ${cur}` : " Kč";
    if (Number.isFinite(amount) && amount > 0) {
      return `${amount.toLocaleString("cs-CZ")}${suffix}`;
    }
  }
  if (instruction.note?.trim()) return instruction.note.trim();
  return "Dle smlouvy";
}

/** Frequency label for a dedicated row; null when nothing reliable is stored. */
export function portalFrequencyLabel(instruction: PaymentInstruction): string | null {
  const formatted = formatPaymentFrequencyCs(instruction.frequency);
  if (formatted) return formatted;
  const raw = instruction.frequency?.trim();
  return raw || null;
}

export function isCzechOrGeneralIban(accountNumber: string): boolean {
  const c = accountNumber.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(c) && c.length >= 15;
}

export function isCzechDomesticAccount(accountNumber: string): boolean {
  const c = accountNumber.replace(/\s+/g, "");
  return /^\d{2,10}\/\d{4}$/.test(c);
}

/**
 * QR / SPAYD CTA only when account is in a shape that can be encoded for Czech banking QR (IBAN or domestic číslo/kód).
 */
export function isPortalPaymentQrActionEligible(instruction: PaymentInstruction): boolean {
  const raw = instruction.accountNumber?.trim();
  if (!raw) return false;
  return isCzechOrGeneralIban(raw) || isCzechDomesticAccount(raw);
}

export function accountFieldLabel(accountNumber: string): "IBAN" | "Účet" {
  return isCzechOrGeneralIban(accountNumber) ? "IBAN" : "Účet";
}

export function variableSymbolDisplay(instruction: PaymentInstruction): string | null {
  const vs = instruction.variableSymbol?.trim();
  if (vs) return vs;
  const cn = instruction.contractNumber?.trim();
  return cn || null;
}

/**
 * "První platba do <datum>" pill text.
 * Shows only when the first payment date is in the future or within 2 months in the past.
 * Returns null when pill should not be shown.
 */
export function firstPaymentPillLabel(firstPaymentDate: string | null | undefined): string | null {
  if (!firstPaymentDate) return null;

  let date: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(firstPaymentDate)) {
    date = new Date(firstPaymentDate + "T00:00:00");
  } else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(firstPaymentDate)) {
    const parts = firstPaymentDate.split(".");
    const d = parts[0]?.padStart(2, "0");
    const m = parts[1]?.padStart(2, "0");
    const y = parts[2];
    if (d && m && y) date = new Date(`${y}-${m}-${d}T00:00:00`);
  }
  if (!date || isNaN(date.getTime())) return null;

  const now = new Date();
  const twoMonthsAfter = new Date(date);
  twoMonthsAfter.setMonth(twoMonthsAfter.getMonth() + 2);

  if (now > twoMonthsAfter) return null;

  return `První platba do ${date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  })}`;
}

/** Distinguishes load failure from honest empty list (no published payment instructions). */
export type PortalPaymentsViewKind = "load_failed" | "empty" | "list";

export function portalPaymentsViewKind(
  paymentsLoadFailed: boolean,
  instructionCount: number,
): PortalPaymentsViewKind {
  if (paymentsLoadFailed) return "load_failed";
  if (instructionCount === 0) return "empty";
  return "list";
}
