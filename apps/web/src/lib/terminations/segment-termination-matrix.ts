/**
 * Centralizovaná matice: segment → povolené způsoby ukončení.
 * Rozhoduje, co wizard ukáže v dropdownu "Způsob ukončení".
 * Pokud segment není známý nebo null → fallback na všechny módy.
 */
import type { TerminationMode } from "./types";

export const ALL_TERMINATION_MODES: TerminationMode[] = [
  "end_of_insurance_period",
  "fixed_calendar_date",
  "within_two_months_from_inception",
  "after_claim",
  "distance_withdrawal",
  "mutual_agreement",
  "manual_review_other",
];

/**
 * Segment → povolené termination modes.
 * Vychází z typické praxe CZ pojistného práva; pojišťovny mohou mít overrides přes registry.
 */
const SEGMENT_MODE_MAP: Partial<Record<string, TerminationMode[]>> = {
  // Životní pojištění – plná sada
  ZP: [
    "end_of_insurance_period",
    "fixed_calendar_date",
    "within_two_months_from_inception",
    "after_claim",
    "distance_withdrawal",
    "mutual_agreement",
    "manual_review_other",
  ],
  // Majetek (domácnost, nemovitost) – vázáno na pojistné období; fixed date jen výjimečně
  MAJ: [
    "end_of_insurance_period",
    "within_two_months_from_inception",
    "distance_withdrawal",
    "mutual_agreement",
    "manual_review_other",
  ],
  // Odpovědnost – jako majetek
  ODP: [
    "end_of_insurance_period",
    "within_two_months_from_inception",
    "distance_withdrawal",
    "mutual_agreement",
    "manual_review_other",
  ],
  // Auto – povinné ručení; po pojistné události povoleno
  AUTO_PR: [
    "end_of_insurance_period",
    "within_two_months_from_inception",
    "after_claim",
    "distance_withdrawal",
    "mutual_agreement",
    "manual_review_other",
  ],
  // Auto – havarijní; obdobné, fixed_date může být ve smlouvě
  AUTO_HAV: [
    "end_of_insurance_period",
    "fixed_calendar_date",
    "within_two_months_from_inception",
    "after_claim",
    "distance_withdrawal",
    "mutual_agreement",
    "manual_review_other",
  ],
  // Cestovní – krátkodobé; ukončení typicky jen do 2 měsíců nebo dohoda
  CEST: [
    "within_two_months_from_inception",
    "distance_withdrawal",
    "mutual_agreement",
    "manual_review_other",
  ],
  // Investice – komplexní, vždy review
  INV: [
    "fixed_calendar_date",
    "mutual_agreement",
    "manual_review_other",
  ],
  // DIP – Dlouhodobý investiční produkt; zákonné podmínky pro čerpání
  DIP: [
    "fixed_calendar_date",
    "mutual_agreement",
    "manual_review_other",
  ],
  // DPS – Doplňkové penzijní spoření; výběr nebo zánik smlouvy
  DPS: [
    "fixed_calendar_date",
    "mutual_agreement",
    "manual_review_other",
  ],
  // Hypotéky – výpověď / splacení / refinancování, vždy manual review
  HYPO: [
    "fixed_calendar_date",
    "mutual_agreement",
    "manual_review_other",
  ],
  // Úvěry
  UVER: [
    "fixed_calendar_date",
    "mutual_agreement",
    "manual_review_other",
  ],
  // Pojištění firem – plná sada
  FIRMA_POJ: [
    "end_of_insurance_period",
    "fixed_calendar_date",
    "within_two_months_from_inception",
    "after_claim",
    "distance_withdrawal",
    "mutual_agreement",
    "manual_review_other",
  ],
};

/**
 * Vrátí povolené termination modes pro daný segment.
 * Pokud segment není znám nebo null, vrátí všechny módy.
 */
export function getAllowedTerminationModes(segment: string | null | undefined): TerminationMode[] {
  if (!segment) return ALL_TERMINATION_MODES;
  return SEGMENT_MODE_MAP[segment] ?? ALL_TERMINATION_MODES;
}

/**
 * True pokud je daný mód povolen pro tento segment.
 */
export function isTerminationModeAllowedForSegment(
  mode: TerminationMode,
  segment: string | null | undefined,
): boolean {
  return getAllowedTerminationModes(segment).includes(mode);
}

/**
 * Vrátí fallback mód – první povolený pro daný segment.
 */
export function getDefaultTerminationMode(segment: string | null | undefined): TerminationMode {
  return getAllowedTerminationModes(segment)[0] ?? "end_of_insurance_period";
}
