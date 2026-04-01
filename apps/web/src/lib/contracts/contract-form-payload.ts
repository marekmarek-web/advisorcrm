import { z } from "zod";
import type { WizardReviewRow } from "@/app/components/wizard";
import { segmentLabel } from "@/app/lib/segment-labels";
import {
  type ContractSegmentCode,
  CONTRACT_SEGMENT_CODES,
  getSegmentUiGroup,
  segmentShowsPremiumOrContributionFields,
} from "@/lib/contracts/contract-segment-wizard-config";
import { annualPremiumFromMonthlyInput, annualPremiumPillLabel } from "@/lib/contracts/annual-premium-from-monthly";

const segmentSchema = z.enum(
  [...CONTRACT_SEGMENT_CODES] as [ContractSegmentCode, ...ContractSegmentCode[]]
);

export type ContractFormState = {
  segment: string;
  partnerId: string;
  productId: string;
  partnerName: string;
  productName: string;
  premiumAmount: string;
  premiumAnnual: string;
  contractNumber: string;
  startDate: string;
  anniversaryDate: string;
  note: string;
};

/** Payload pro createContract / updateContract (normalizovaný). */
export type ContractPersistPayload = {
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
};

const optionalTrimmed = z
  .string()
  .optional()
  .transform((s) => (s != null && s.trim() !== "" ? s : undefined));

export function normalizeContractFormForSave(form: ContractFormState): ContractPersistPayload {
  const segment = form.segment?.trim();
  if (!segment) return { segment: "" };

  const showPremium = segmentShowsPremiumOrContributionFields(segment);
  let premiumAmount = form.premiumAmount?.trim() || undefined;
  let premiumAnnual = form.premiumAnnual?.trim() || undefined;
  if (showPremium && premiumAmount) {
    premiumAnnual = annualPremiumFromMonthlyInput(premiumAmount) || premiumAnnual;
  }
  if (!showPremium) {
    premiumAmount = undefined;
    premiumAnnual = undefined;
  }

  return {
    segment,
    partnerId: form.partnerId?.trim() || undefined,
    productId: form.productId?.trim() || undefined,
    partnerName: form.partnerName?.trim() || undefined,
    productName: form.productName?.trim() || undefined,
    premiumAmount,
    premiumAnnual,
    contractNumber: form.contractNumber?.trim() || undefined,
    startDate: form.startDate?.trim() || undefined,
    anniversaryDate: form.anniversaryDate?.trim() || undefined,
    note: form.note?.trim() || undefined,
  };
}

const persistSchema = z.object({
  segment: segmentSchema,
  partnerId: optionalTrimmed,
  productId: optionalTrimmed,
  partnerName: optionalTrimmed,
  productName: optionalTrimmed,
  premiumAmount: optionalTrimmed,
  premiumAnnual: optionalTrimmed,
  contractNumber: optionalTrimmed,
  startDate: optionalTrimmed,
  anniversaryDate: optionalTrimmed,
  note: optionalTrimmed,
});

/** Validace před uložením (klient i server). */
export function validateContractPersistPayload(
  payload: ContractPersistPayload
): { ok: true; data: z.infer<typeof persistSchema> } | { ok: false; message: string } {
  const parsed = persistSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: first?.message ?? "Neplatné údaje smlouvy.",
    };
  }
  return { ok: true, data: parsed.data };
}

/** Chybová hláška v češtině pro prázdný segment. */
export function validateContractFormForSubmit(form: ContractFormState): { ok: true } | { ok: false; message: string } {
  const segment = form.segment?.trim();
  if (!segment) {
    return { ok: false, message: "Vyberte segment smlouvy." };
  }
  if (!segmentSchema.safeParse(segment).success) {
    return { ok: false, message: "Neplatný segment smlouvy. Vyberte segment z nabídky." };
  }
  const normalized = normalizeContractFormForSave(form);
  const v = validateContractPersistPayload(normalized);
  if (!v.ok) return v;

  const hasPartnerOrProduct =
    Boolean(normalized.partnerId?.trim()) ||
    Boolean(normalized.productId?.trim()) ||
    Boolean(normalized.partnerName?.trim()) ||
    Boolean(normalized.productName?.trim());
  if (!hasPartnerOrProduct) {
    return {
      ok: false,
      message: "Vyberte partnera a produkt z katalogu nebo vyplňte alespoň název partnera či produktu.",
    };
  }

  return { ok: true };
}

export function buildContractReviewRows(
  form: ContractFormState,
  uploadedDocumentName: string | null
): WizardReviewRow[] {
  const normalized = normalizeContractFormForSave(form);
  const segment = form.segment?.trim() ?? "";
  const rows: WizardReviewRow[] = [
    { label: "Segment", value: segmentLabel(segment) || "—" },
    {
      label: "Partner / Produkt",
      value: [form.partnerName, form.productName].filter(Boolean).join(" – ") || "—",
    },
  ];

  const group = getSegmentUiGroup(segment);
  if (group !== "lending") {
    if (normalized.premiumAmount) {
      rows.push({
        label: group === "investment" ? "Pravidelná platba (měs.)" : "Pojistné (měs.)",
        value: `${normalized.premiumAmount} Kč`,
      });
    }
    if (normalized.premiumAnnual) {
      rows.push({
        label: group === "investment" ? "Příspěvek (roční)" : "Pojistné (roční)",
        value: `${normalized.premiumAnnual} Kč`,
      });
    }
  }

  if (normalized.contractNumber) {
    rows.push({ label: "Číslo smlouvy", value: normalized.contractNumber });
  }
  if (normalized.startDate) {
    rows.push({ label: "Od", value: normalized.startDate });
  }
  if (normalized.anniversaryDate) {
    rows.push({
      label: getSegmentUiGroup(segment) === "lending" ? "Výročí / fixace" : "Výročí",
      value: normalized.anniversaryDate,
    });
  }
  if (normalized.note) {
    rows.push({ label: "Poznámka", value: normalized.note });
  }
  rows.push({
    label: "Soubor",
    value: uploadedDocumentName?.trim() || "—",
  });

  return rows;
}

/** Pill vedle měsíční částky — stejný zdroj jako uložené roční. */
export function contractFormAnnualPillLabel(form: ContractFormState): string | null {
  if (!segmentShowsPremiumOrContributionFields(form.segment)) return null;
  return annualPremiumPillLabel(form.premiumAmount);
}

const EMPTY_STEP2: Pick<
  ContractFormState,
  "premiumAmount" | "premiumAnnual" | "contractNumber" | "startDate" | "anniversaryDate" | "note"
> = {
  premiumAmount: "",
  premiumAnnual: "",
  contractNumber: "",
  startDate: "",
  anniversaryDate: "",
  note: "",
};

/** Po změně segmentu: partner/produkt + pole kroku 2 vyčistit (volá se z wizardu). */
export function resetContractFormForNewSegment(
  prev: ContractFormState,
  newSegment: string
): ContractFormState {
  return {
    ...prev,
    segment: newSegment,
    partnerId: "",
    productId: "",
    partnerName: "",
    productName: "",
    ...EMPTY_STEP2,
  };
}

export const initialContractFormState = (): ContractFormState => ({
  segment: "ZP",
  partnerId: "",
  productId: "",
  partnerName: "",
  productName: "",
  premiumAmount: "",
  premiumAnnual: "",
  contractNumber: "",
  startDate: "",
  anniversaryDate: "",
  note: "",
});
