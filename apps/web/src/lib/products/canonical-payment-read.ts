/**
 * Canonical payment read layer — stable foundation for client payments.
 *
 * Reads from the same canonical publish artifact as portfolio:
 * - client_payment_setups (AI Review published payments, status = 'active')
 * - payment_accounts (legacy static mapping from partner/segment → account)
 * - contracts (for linking payments to products)
 *
 * All consumers read through this module for consistent payment data.
 */

import type { CanonicalProduct } from "./canonical-product-read";

export type CanonicalPaymentInstruction = {
  id: string;
  source: "ai_review" | "legacy_catalog";
  segment: string;
  partnerName: string;
  productName: string | null;
  contractNumber: string | null;
  accountNumber: string;
  bankCode: string | null;
  iban: string | null;
  variableSymbol: string | null;
  specificSymbol: string | null;
  constantSymbol: string | null;
  amount: string | null;
  currency: string | null;
  frequency: string | null;
  note: string | null;
  /** Matched contract ID (nullable — payment may not match a specific contract). */
  matchedContractId: string | null;
};

/**
 * Segment category for payment UI grouping (Czech labels).
 */
export type PaymentSegmentCategory =
  | "bydleni"
  | "uvery"
  | "pojisteni_osob"
  | "penze"
  | "investice"
  | "pojisteni_majetku"
  | "pojisteni_vozidel"
  | "ostatni";

const SEGMENT_TO_PAYMENT_CATEGORY: Record<string, PaymentSegmentCategory> = {
  MAJ: "pojisteni_majetku",
  ODP: "pojisteni_majetku",
  HYPO: "bydleni",
  UVER: "uvery",
  ZP: "pojisteni_osob",
  DPS: "penze",
  INV: "investice",
  DIP: "investice",
  AUTO_PR: "pojisteni_vozidel",
  AUTO_HAV: "pojisteni_vozidel",
  CEST: "ostatni",
  FIRMA_POJ: "ostatni",
};

export const PAYMENT_CATEGORY_LABELS: Record<PaymentSegmentCategory, string> = {
  bydleni: "Bydlení",
  uvery: "Úvěry",
  pojisteni_osob: "Pojištění osob",
  penze: "Penze",
  investice: "Investice",
  pojisteni_majetku: "Pojištění majetku",
  pojisteni_vozidel: "Pojištění vozidel",
  ostatni: "Ostatní",
};

export function paymentSegmentCategory(segment: string): PaymentSegmentCategory {
  return SEGMENT_TO_PAYMENT_CATEGORY[segment] ?? "ostatni";
}

/**
 * Attempts to match a payment instruction to a canonical product.
 * Matching by contractNumber (strongest) or partnerName+segment (fallback).
 * Returns matched contractId or null.
 */
export function matchPaymentToProduct(
  payment: { contractNumber: string | null; partnerName: string; segment: string },
  products: CanonicalProduct[],
): string | null {
  if (payment.contractNumber) {
    const cn = payment.contractNumber.trim().toLowerCase();
    const byNumber = products.find(
      (p) => p.contractNumber && p.contractNumber.trim().toLowerCase() === cn,
    );
    if (byNumber) return byNumber.id;
  }

  const byPartnerSegment = products.find(
    (p) =>
      p.segment === payment.segment &&
      p.partnerName?.trim().toLowerCase() === payment.partnerName.trim().toLowerCase(),
  );
  return byPartnerSegment?.id ?? null;
}

/**
 * Deduplication key for payment instructions.
 */
export function paymentDedupKey(p: {
  partnerName: string;
  productName: string | null;
  contractNumber: string | null;
  accountNumber: string;
  variableSymbol: string | null;
}): string {
  const norm = (v: string | null | undefined) =>
    (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return [
    norm(p.partnerName),
    norm(p.productName),
    norm(p.contractNumber),
    norm(p.accountNumber),
    norm(p.variableSymbol),
  ].join("|");
}
