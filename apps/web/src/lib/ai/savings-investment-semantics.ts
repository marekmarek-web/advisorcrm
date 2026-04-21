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

const INVESTMENT_LIKE_PRIMARIES_FOR_TOTAL_INVESTED = new Set<PrimaryDocumentType>([
  "investment_subscription_document",
  "investment_service_agreement",
  "investment_modelation",
  "investment_payment_instruction",
  "life_insurance_investment_contract",
  "pension_contract",
]);

function toNumericAmount(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = s
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[Kč\s]/gi, "")
    .replace(/czk/gi, "")
    .replace(/,/g, ".")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toYearsFromDuration(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    if (raw > 0 && raw <= 80) return raw;
    if (raw > 80 && raw <= 960) return raw / 12;
    return null;
  }
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const yearTarget = s.match(/do\s+roku\s+(\d{4})/);
  if (yearTarget) {
    const y = Number(yearTarget[1]);
    const cur = new Date().getFullYear();
    if (Number.isFinite(y) && y > cur) {
      const n = y - cur;
      return n > 0 && n <= 80 ? n : null;
    }
  }
  const plusLet = s.match(/(\d{1,2})\s*\+\s*let/);
  if (plusLet) {
    const n = Number(plusLet[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const nLet = s.match(/(\d{1,3})\s*(?:let|roků|roku|r\.)/);
  if (nLet) {
    const n = Number(nLet[1]);
    if (Number.isFinite(n) && n > 0 && n <= 80) return n;
  }
  const nMes = s.match(/(\d{1,3})\s*(?:měs|mesi|měsíců|mesicu|months|m\.)/);
  if (nMes) {
    const n = Number(nMes[1]);
    if (Number.isFinite(n) && n > 0 && n <= 960) return n / 12;
  }
  const bare = Number(s.replace(/[^\d.]/g, ""));
  if (Number.isFinite(bare) && bare > 0 && bare <= 80) return bare;
  return null;
}

function yearsBetweenDates(startRaw: unknown, endRaw: unknown): number | null {
  const parseCzDate = (r: unknown): Date | null => {
    if (!r) return null;
    const s = String(r).trim();
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
      return Number.isFinite(d.valueOf()) ? d : null;
    }
    const cz = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (cz) {
      const dd = cz[1].padStart(2, "0");
      const mm = cz[2].padStart(2, "0");
      const d = new Date(`${cz[3]}-${mm}-${dd}T00:00:00Z`);
      return Number.isFinite(d.valueOf()) ? d : null;
    }
    return null;
  };
  const s = parseCzDate(startRaw);
  const e = parseCzDate(endRaw);
  if (!s || !e) return null;
  const years = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return years > 0 && years <= 80 ? years : null;
}

const MONTHLY_FREQUENCY_MARKERS = ["měsíč", "mesicn", "mesic", "month"];
const ANNUAL_FREQUENCY_MARKERS = ["ročn", "rocn", "annual", "yearly"];
const ONE_OFF_FREQUENCY_MARKERS = ["jednoráz", "jednoraz", "lump", "once"];

function frequencyMultiplierPerYear(paymentFrequency: unknown): number | null {
  const s = String(paymentFrequency ?? "").trim().toLowerCase();
  if (!s) return null;
  if (ONE_OFF_FREQUENCY_MARKERS.some((m) => s.includes(m))) return 0;
  if (MONTHLY_FREQUENCY_MARKERS.some((m) => s.includes(m))) return 12;
  if (s.includes("čtvrt") || s.includes("ctvrt") || s.includes("quarter")) return 4;
  if (s.includes("pololetn") || s.includes("semiannual") || s.includes("half")) return 2;
  if (ANNUAL_FREQUENCY_MARKERS.some((m) => s.includes(m))) return 1;
  return null;
}

/**
 * Compute intendedInvestment (total invested amount) for regular-investment documents
 * when the model returned a monthly contribution and a horizon but omitted the total.
 *
 * Formula: intendedInvestment ≈ monthlyAmount × 12 × years
 *          (or paymentFrequencyPerYear × amount × years when frequency is quarterly/annual).
 *
 * Skips jednorázová investice (one-off) — in that case amount IS intendedInvestment itself.
 * Never overwrites an existing intendedInvestment with a plausible value.
 */
export function computeIntendedInvestmentFromRegularContributions(
  primary: PrimaryDocumentType,
  ef: Record<string, ExtractedField | undefined>,
): void {
  if (!INVESTMENT_LIKE_PRIMARIES_FOR_TOTAL_INVESTED.has(primary)) return;

  const freqMul = frequencyMultiplierPerYear(ef.paymentFrequency?.value);
  if (freqMul === 0) return;

  const existing = toNumericAmount(ef.intendedInvestment?.value);
  const monthlyCandidate =
    toNumericAmount(ef.investmentPremium?.value) ??
    toNumericAmount(ef.totalMonthlyPremium?.value) ??
    toNumericAmount(ef.contributionAmount?.value) ??
    toNumericAmount(ef.regularAmount?.value) ??
    toNumericAmount(ef.amount?.value) ??
    toNumericAmount(ef.premiumAmount?.value);
  if (monthlyCandidate == null) return;

  const years =
    toYearsFromDuration(ef.policyDuration?.value) ??
    toYearsFromDuration(ef.investmentHorizon?.value) ??
    toYearsFromDuration(ef.investmentHorizonYears?.value) ??
    toYearsFromDuration(ef.horizonYears?.value) ??
    yearsBetweenDates(ef.policyStartDate?.value ?? ef.startDate?.value, ef.policyEndDate?.value ?? ef.endDate?.value);
  if (years == null || !Number.isFinite(years) || years <= 0) return;

  const effectiveMul = freqMul ?? 12;
  const totalInvested = Math.round(monthlyCandidate * effectiveMul * years);
  if (!Number.isFinite(totalInvested) || totalInvested <= 0) return;

  const tolerance = 0.2;
  if (existing != null && Math.abs(existing - totalInvested) / Math.max(existing, totalInvested) <= tolerance) {
    return;
  }

  const plausiblyMatchesExistingMonthly =
    existing != null && Math.abs(existing - monthlyCandidate) / Math.max(existing, monthlyCandidate) < 0.02;

  if (existing == null || plausiblyMatchesExistingMonthly) {
    ef.intendedInvestment = {
      value: String(totalInvested),
      status: "extracted",
      confidence: 0.82,
      evidenceSnippet: `[semantic] Dopočet celkové investované částky = ${monthlyCandidate} × ${effectiveMul} × ${years.toFixed(2)} let = ${totalInvested} Kč.`,
    };
  }
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
  computeIntendedInvestmentFromRegularContributions(primary, ef);
}
