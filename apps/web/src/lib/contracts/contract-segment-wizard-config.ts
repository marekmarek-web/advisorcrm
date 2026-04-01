/**
 * Segment → UI skupina pro krok „Parametry“ wizardu smlouvy.
 * Kódy segmentů musí odpovídat packages/db/src/schema/contracts.ts (contractSegments).
 */
export type ContractSegmentUiGroup = "insurance" | "lending" | "investment";

/** Kódy v souladu s DB enum contractSegments. */
export const CONTRACT_SEGMENT_CODES = [
  "ZP",
  "MAJ",
  "ODP",
  "AUTO_PR",
  "AUTO_HAV",
  "CEST",
  "INV",
  "DIP",
  "DPS",
  "HYPO",
  "UVER",
  "FIRMA_POJ",
] as const;

export type ContractSegmentCode = (typeof CONTRACT_SEGMENT_CODES)[number];

const LENDING = new Set<ContractSegmentCode>(["HYPO", "UVER"]);
const INVESTMENT = new Set<ContractSegmentCode>(["INV", "DIP", "DPS"]);

export function isContractSegmentCode(s: string): s is ContractSegmentCode {
  return (CONTRACT_SEGMENT_CODES as readonly string[]).includes(s);
}

export function getSegmentUiGroup(segment: string): ContractSegmentUiGroup {
  if (!isContractSegmentCode(segment)) return "insurance";
  if (LENDING.has(segment)) return "lending";
  if (INVESTMENT.has(segment)) return "investment";
  return "insurance";
}

/** Zobrazit pole měsíční částky ukládané do premium_amount (pojištění / investice). */
export function segmentShowsPremiumOrContributionFields(segment: string): boolean {
  return getSegmentUiGroup(segment) !== "lending";
}

export function getMonthlyAmountFieldLabel(segment: string): string {
  return getSegmentUiGroup(segment) === "investment"
    ? "Pravidelná platba (měsíční) Kč"
    : "Pojistné (měsíční) Kč";
}

export function getMonthlyAmountHelperText(segment: string): string {
  return getSegmentUiGroup(segment) === "investment"
    ? "Roční příspěvek se dopočítá automaticky (× 12)."
    : "Roční pojistné se dopočítá automaticky (× 12).";
}

export function getAnniversaryFieldLabel(segment: string): string {
  return getSegmentUiGroup(segment) === "lending" ? "Výročí / fixace" : "Výročí";
}
