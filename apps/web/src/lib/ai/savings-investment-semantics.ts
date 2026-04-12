/**
 * Generic savings / pension / investment product semantics (DPS, DIP, úpis, investiční služby).
 * No vendor or filename rules — segment- and role-based only.
 */

import type { ExtractedField, PrimaryDocumentType } from "./document-review-types";

/** Same shape as contract-semantic-understanding (avoid circular import). */
function plausibleIsin(value: unknown): boolean {
  const t = String(value ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(t);
}

function isPresent(cell: ExtractedField | undefined): cell is ExtractedField {
  if (!cell) return false;
  if (cell.status === "missing" || cell.status === "not_found" || cell.status === "not_applicable") return false;
  const v = cell.value;
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "" && s !== "—" && s !== "null";
}

function strEq(a: unknown, b: unknown): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase() && String(a ?? "").trim() !== "";
}

function hasNonEmptyInvestmentFunds(ef: Record<string, ExtractedField | undefined>): boolean {
  const c = ef.investmentFunds;
  if (!c || !isPresent(c)) return false;
  const raw = String(c.value ?? "").trim();
  if (raw.length < 3 || raw === "[]" || raw === "{}") return false;
  if (raw.startsWith("[")) {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) && p.length > 0;
    } catch {
      return raw.length > 10;
    }
  }
  return raw.length > 5;
}

const PROMOTE_FUND_PRIMARIES = new Set<PrimaryDocumentType>([
  "pension_contract",
  "investment_subscription_document",
  "investment_service_agreement",
  "investment_modelation",
]);

const LOOSE_FUND_KEYS = [
  "fundAllocation",
  "portfolioAllocation",
  "proposedFunds",
  "investmentAllocation",
  "fundSelection",
  "selectedFunds",
  "fundNames",
  "targetFund",
  "subFund",
] as const;

const LOOSE_ISIN_KEYS = ["fundIsin", "productIsin", "instrumentIsin", "bondIsin"] as const;

const INVESTMENT_PRIMARIES_FOR_INSURER_SUPPRESS: PrimaryDocumentType[] = [
  "investment_subscription_document",
  "investment_service_agreement",
  "investment_modelation",
];

/**
 * If the model split allocation across loose fields, copy into canonical `investmentFunds` (JSON array string).
 */
export function promoteLooseFundAllocationToInvestmentFunds(
  primary: PrimaryDocumentType,
  ef: Record<string, ExtractedField | undefined>
): void {
  if (!PROMOTE_FUND_PRIMARIES.has(primary)) return;
  if (hasNonEmptyInvestmentFunds(ef)) return;

  for (const key of LOOSE_FUND_KEYS) {
    const cell = ef[key];
    if (!cell || !isPresent(cell)) continue;
    const raw = String(cell.value ?? "").trim();
    if (!raw || raw === "[]" || raw === "{}") continue;

    if (raw.startsWith("[")) {
      try {
        const p = JSON.parse(raw) as unknown;
        if (Array.isArray(p) && p.length > 0) {
          ef.investmentFunds = {
            value: raw,
            status: cell.status === "inferred_low_confidence" ? "inferred_low_confidence" : "extracted",
            confidence: cell.confidence ?? 0.78,
            evidenceSnippet: cell.evidenceSnippet,
          };
          return;
        }
      } catch {
        /* fall through to string wrap */
      }
    }

    ef.investmentFunds = {
      value: JSON.stringify([{ name: raw, allocation: null }]),
      status: cell.status === "inferred_low_confidence" ? "inferred_low_confidence" : "extracted",
      confidence: cell.confidence ?? 0.75,
      evidenceSnippet: cell.evidenceSnippet,
    };
    return;
  }
}

/**
 * If LLM put the asset manager name into `intermediaryCompany`, dedupe against provider/institution.
 */
export function suppressIntermediaryCompanyWhenDuplicatesAssetManager(
  primary: PrimaryDocumentType,
  ef: Record<string, ExtractedField | undefined>
): void {
  if (!INVESTMENT_PRIMARIES_FOR_INSURER_SUPPRESS.includes(primary)) return;
  const ic = ef.intermediaryCompany;
  if (!isPresent(ic)) return;
  const dupProv = isPresent(ef.provider) && strEq(ic.value, ef.provider?.value);
  const dupInst = isPresent(ef.institutionName) && strEq(ic.value, ef.institutionName?.value);
  if (dupProv || dupInst) {
    ef.intermediaryCompany = {
      value: null,
      status: "not_applicable",
      confidence: 1,
      evidenceSnippet:
        "[semantic] Stejná entita jako správce/instituce — pole zprostředkovatelské firmy vypnuto.",
    };
  }
}

/** Copy first plausible ISIN from loose keys into canonical `isin`. */
export function promoteLooseIsinToCanonical(
  primary: PrimaryDocumentType,
  ef: Record<string, ExtractedField | undefined>
): void {
  if (!PROMOTE_FUND_PRIMARIES.has(primary)) return;
  if (isPresent(ef.isin) && plausibleIsin(ef.isin.value)) return;

  for (const key of LOOSE_ISIN_KEYS) {
    const cell = ef[key];
    if (!cell || !isPresent(cell)) continue;
    const raw = String(cell.value ?? "").trim();
    if (!raw || !plausibleIsin(raw)) continue;
    ef.isin = {
      value: raw.replace(/\s/g, "").toUpperCase(),
      status: cell.status === "inferred_low_confidence" ? "inferred_low_confidence" : "extracted",
      confidence: cell.confidence ?? 0.76,
      evidenceSnippet: cell.evidenceSnippet,
    };
    return;
  }
}

/**
 * Penze: pojistná role `insurer` nesmí nést penzijní společnost (alias pass ji často vyčistí — pojistka zůstane jen při chybě pipeline).
 * Investice: `insurer` nesmí duplikovat správce/producenta v `provider` / `institutionName`.
 */
export function suppressInsuranceInsurerFieldForPensionAndInvestment(
  primary: PrimaryDocumentType,
  ef: Record<string, ExtractedField | undefined>
): void {
  if (primary === "pension_contract") {
    if (isPresent(ef.insurer)) {
      if (!isPresent(ef.provider)) {
        ef.provider = {
          ...ef.insurer!,
          evidenceSnippet: ef.insurer!.evidenceSnippet ?? "[semantic] Přeneseno z pole pojistitel na poskytovatele (penze).",
        };
      }
      ef.insurer = {
        value: null,
        status: "not_applicable",
        confidence: 1,
        evidenceSnippet: "[semantic] Penzijní produkt — pojistitel není relevantní; poskytovatel = penzijní společnost.",
      };
    }
    return;
  }

  if (!INVESTMENT_PRIMARIES_FOR_INSURER_SUPPRESS.includes(primary)) return;
  const ins = ef.insurer;
  if (!isPresent(ins)) return;

  const dupProvider = isPresent(ef.provider) && strEq(ins.value, ef.provider?.value);
  const dupInst = isPresent(ef.institutionName) && strEq(ins.value, ef.institutionName?.value);
  if (dupProvider || dupInst) {
    ef.insurer = {
      value: null,
      status: "not_applicable",
      confidence: 1,
      evidenceSnippet:
        "[semantic] Investiční produkt — hodnota odpovídá správci/instituci; pole pojistitel vypnuto.",
    };
  }
}

/** Stejná osoba nesmí být účastník i zprostředkovatel u DPS/penze. */
export function resolveParticipantIntermediaryDuplicateForPension(
  primary: PrimaryDocumentType,
  ef: Record<string, ExtractedField | undefined>
): void {
  if (primary !== "pension_contract") return;
  if (!isPresent(ef.participantFullName) || !isPresent(ef.intermediaryName)) return;
  if (!strEq(ef.participantFullName?.value, ef.intermediaryName?.value)) return;
  ef.intermediaryName = {
    value: null,
    status: "not_applicable",
    confidence: 1,
    evidenceSnippet: "[semantic] Stejná hodnota jako účastník — zprostředkovatel vypnut.",
  };
}

/**
 * Bounded pass: insurer role + participant/investor vs intermediary disambiguation for savings/investment.
 */
export function applySavingsInvestmentSemantics(
  primary: PrimaryDocumentType,
  ef: Record<string, ExtractedField | undefined>
): void {
  suppressInsuranceInsurerFieldForPensionAndInvestment(primary, ef);
  suppressIntermediaryCompanyWhenDuplicatesAssetManager(primary, ef);
  resolveParticipantIntermediaryDuplicateForPension(primary, ef);
}
