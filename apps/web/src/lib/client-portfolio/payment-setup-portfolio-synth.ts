import { contractSegments } from "db";
import type { ClientPaymentSetupPaymentType, ClientPaymentSetupStatus } from "db";
import type { ContractRow } from "@/app/actions/contracts";

const SEGMENT_SET = new Set<string>([...contractSegments]);

/**
 * Map DB payment type to a canonical contract segment when `segment` is missing.
 * platební instrukce mají být v portfoliu u skupiny odpovídající produktu.
 */
export function paymentTypeToFallbackSegment(
  paymentType: ClientPaymentSetupPaymentType | string | null | undefined
): string {
  const p = (paymentType ?? "other") as string;
  switch (p) {
    case "investment":
      return "INV";
    case "pension":
    case "contribution":
      return "DPS";
    case "insurance":
      return "ZP";
    case "loan":
      return "UVER";
    default:
      return "INV";
  }
}

export function resolveSegmentForPaymentSetup(row: {
  segment: string | null | undefined;
  paymentType: ClientPaymentSetupPaymentType | null | undefined;
}): string {
  const s = (row.segment ?? "").trim();
  if (s && SEGMENT_SET.has(s)) return s;
  return paymentTypeToFallbackSegment(row.paymentType);
}

export function premiumFieldsFromAmountAndFrequency(
  amount: string | null | undefined,
  frequency: string | null | undefined,
  paymentType: ClientPaymentSetupPaymentType | null | undefined
): { premiumAmount: string | null; premiumAnnual: string | null; portfolioAttributes: Record<string, unknown> } {
  if (amount == null || String(amount).trim() === "") {
    return { premiumAmount: null, premiumAnnual: null, portfolioAttributes: { paymentType: paymentType ?? "other" } };
  }
  const amt = String(amount);
  const freq = (frequency ?? "").toLowerCase();
  const isAnnual = freq === "annually" || freq === "yearly" || freq === "ročně" || freq === "rocne" || freq === "roční";
  const isOneTime =
    freq === "one_time" ||
    freq === "one-time" ||
    freq === "jednorázově" ||
    freq === "jednorazove" ||
    freq === "jednoráz" ||
    freq.includes("jednoráz");

  const baseAttrs: Record<string, unknown> = {
    paymentType: isOneTime ? "one_time" : paymentType === "investment" ? "recurring" : paymentType ?? "other",
  };

  if (isAnnual) {
    return { premiumAmount: null, premiumAnnual: amt, portfolioAttributes: baseAttrs };
  }
  if (isOneTime && (paymentType === "investment" || paymentType === "other")) {
    return { premiumAmount: amt, premiumAnnual: null, portfolioAttributes: { ...baseAttrs, paymentType: "one_time" } };
  }
  return { premiumAmount: amt, premiumAnnual: null, portfolioAttributes: baseAttrs };
}

export type PaymentSetupForPortfolioRow = {
  id: string;
  sourceContractReviewId: string | null;
  status: ClientPaymentSetupStatus;
  paymentType: ClientPaymentSetupPaymentType;
  providerName: string | null;
  productName: string | null;
  contractNumber: string | null;
  accountNumber: string | null;
  variableSymbol: string | null;
  paymentInstructionsText: string | null;
  amount: string | null;
  frequency: string | null;
  firstPaymentDate: string | null;
  segment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Syntetická „smlouva“ pro klientské portfolio z řádku `client_payment_setups`.
 * `id` = UUID platebního pokynu (slouží pro deep link /client/portfolio/:id).
 */
export function contractRowFromPaymentSetup(
  contactId: string,
  row: PaymentSetupForPortfolioRow
): ContractRow {
  const segment = resolveSegmentForPaymentSetup(row);
  const { premiumAmount, premiumAnnual, portfolioAttributes } = premiumFieldsFromAmountAndFrequency(
    row.amount,
    row.frequency,
    row.paymentType
  );

  return {
    id: row.id,
    contactId,
    segment,
    type: segment,
    partnerId: null,
    productId: null,
    partnerName: row.providerName,
    productName: row.productName?.trim() || "Platební instrukce",
    premiumAmount,
    premiumAnnual,
    contractNumber: row.contractNumber,
    startDate: row.firstPaymentDate,
    anniversaryDate: null,
    note: null,
    visibleToClient: true,
    portfolioStatus: "active",
    sourceKind: "payment_setup",
    sourceDocumentId: null,
    sourceContractReviewId: row.sourceContractReviewId,
    advisorConfirmedAt: null,
    confirmedByUserId: null,
    portfolioAttributes: {
      ...portfolioAttributes,
      fromPaymentInstruction: true,
      paymentSetupId: row.id,
      paymentInstructionAccount: row.accountNumber ?? null,
      paymentInstructionVs: row.variableSymbol ?? null,
      paymentInstructionNotes: row.paymentInstructionsText?.trim() || null,
    },
    extractionConfidence: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    portfolioRowKind: "payment_setup",
  };
}
