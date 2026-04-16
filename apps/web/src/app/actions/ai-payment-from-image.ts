"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  extractPaymentInstructionsFromImageUrl,
  validatePaymentInstructionExtraction,
  type PaymentInstructionExtraction,
} from "@/lib/ai/payment-instruction-extraction";

export type PaymentFromImageDraft = {
  providerName: string;
  productName: string;
  segment: string;
  accountNumber: string;
  iban: string;
  variableSymbol: string;
  constantSymbol: string;
  specificSymbol: string;
  amount: string;
  frequency: string;
  firstPaymentDate: string;
  note: string;
  missingFields: string[];
  confidence: number;
  needsHumanReview: boolean;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function numStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && !Number.isNaN(v)) return String(v);
  return str(v);
}

function guessSegment(p: PaymentInstructionExtraction): string {
  const text = [str(p.productName), str(p.institutionName), str(p.paymentNote)].join(" ").toLowerCase();
  if (/invest|fond|etf|dip\b|cenné paper/i.test(text)) return "INV";
  if (/důchod|dps|penzijní/i.test(text)) return "DPS";
  if (/hypotéka|hypo|úvěr|půjčka|mortgage/i.test(text)) return "HYPO";
  if (/pojišt|poji\b|poj\s/i.test(text)) return "ZP";
  return "other";
}

function collectMissingFields(p: PaymentInstructionExtraction): string[] {
  const missing: string[] = [];
  if (!str(p.institutionName)) missing.push("instituce");
  if (!str(p.iban) && !str(p.accountNumber)) missing.push("IBAN nebo číslo účtu");
  if (!str(p.variableSymbol)) missing.push("variabilní symbol");
  if (!numStr(p.amount)) missing.push("částka");
  if (!str(p.paymentFrequency)) missing.push("frekvence");
  return missing;
}

export async function extractPaymentDraftFromImageAction(
  imageDataUrl: string
): Promise<{ ok: true; draft: PaymentFromImageDraft } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { ok: false, error: "Nemáte oprávnění vytvářet platební instrukce." };
  }

  if (!imageDataUrl?.startsWith("data:image/") && !imageDataUrl?.startsWith("https://")) {
    return { ok: false, error: "Nepodporovaný formát obrázku." };
  }

  const result = await extractPaymentInstructionsFromImageUrl(imageDataUrl);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const p = result.data;
  const { needsHumanReview } = validatePaymentInstructionExtraction(p);
  const missing = collectMissingFields(p);

  const draft: PaymentFromImageDraft = {
    providerName: str(p.institutionName),
    productName: str(p.productName),
    segment: guessSegment(p),
    accountNumber: str(p.accountNumber) + (str(p.bankCode) ? `/${str(p.bankCode)}` : ""),
    iban: str(p.iban),
    variableSymbol: str(p.variableSymbol),
    constantSymbol: str(p.constantSymbol),
    specificSymbol: str(p.specificSymbol),
    amount: numStr(p.amount),
    frequency: str(p.paymentFrequency),
    firstPaymentDate: str(p.firstPaymentDate) || str(p.dueDate),
    note: str(p.paymentNote),
    missingFields: missing,
    confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
    needsHumanReview,
  };

  return { ok: true, draft };
}
