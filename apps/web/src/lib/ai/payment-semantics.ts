/**
 * Generic payment semantics: frequency- and segment-aware selection of the canonical
 * payable amount (sync + summary), without vendor or filename rules.
 */

import type { ExtractedField, PrimaryDocumentType } from "./document-review-types";

function isPresent(cell: ExtractedField | undefined): boolean {
  if (!cell) return false;
  if (cell.status === "missing" || cell.status === "not_found" || cell.status === "not_applicable") return false;
  const v = cell.value;
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "" && s !== "—" && s !== "null";
}

/** First number in a money-like string (CZK, spaces, comma decimals). */
export function extractFirstNumericAmount(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/\s/g, " ").trim();
  if (!s) return null;
  const m = s.match(/-?\d[\d\s.,]*/);
  if (!m) return null;
  const compact = m[0].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(compact);
  return Number.isFinite(n) ? n : null;
}

export type PaymentFrequencyClass = "annual" | "monthly" | "quarterly" | "semi_annual" | "one_time" | "unknown";

export function classifyPaymentFrequency(
  ef: Record<string, ExtractedField | undefined>
): PaymentFrequencyClass {
  const v = `${ef.paymentFrequency?.value ?? ""} ${ef.premiumFrequency?.value ?? ""}`.toLowerCase();
  if (
    v.includes("ročn") ||
    v.includes("rocn") ||
    /\bannual(ly)?\b/.test(v) ||
    /\byearly\b/.test(v)
  ) {
    return "annual";
  }
  if (v.includes("měsíč") || v.includes("mesic") || /\bmonthly\b/.test(v) || /\bmonth\b/.test(v)) {
    return "monthly";
  }
  if (v.includes("čtvrtlet") || v.includes("ctvrtlet") || /\bquarter(ly)?\b/.test(v)) {
    return "quarterly";
  }
  if (v.includes("pololet") || /\bsemi.?annual(ly)?\b/.test(v) || /\bhalf.?year(ly)?\b/.test(v)) {
    return "semi_annual";
  }
  if (
    v.includes("jednorázov") ||
    v.includes("jednorazov") ||
    /\bone.?time\b/.test(v) ||
    /\blump.?sum\b/.test(v) ||
    /\bsingle.?premium\b/.test(v)
  ) {
    return "one_time";
  }
  return "unknown";
}

export type PaymentSemanticContext = {
  primaryType: PrimaryDocumentType;
};

const INVESTMENT_PRIMARIES = new Set<PrimaryDocumentType>([
  "investment_subscription_document",
  "investment_service_agreement",
  "investment_modelation",
  "investment_payment_instruction",
]);

const PENSION_PRIMARIES = new Set<PrimaryDocumentType>(["pension_contract"]);

const LIFE_PRIMARIES = new Set<PrimaryDocumentType>([
  "life_insurance_final_contract",
  "life_insurance_contract",
  "life_insurance_investment_contract",
  "life_insurance_proposal",
  "life_insurance_change_request",
  "life_insurance_modelation",
]);

const NONLIFE_PRIMARIES = new Set<PrimaryDocumentType>([
  "nonlife_insurance_contract",
  "liability_insurance_offer",
]);

function fv(ef: Record<string, ExtractedField | undefined>, keys: readonly string[]): string {
  for (const k of keys) {
    const c = ef[k];
    if (!isPresent(c)) continue;
    const s = String(c!.value).trim();
    if (s && s !== "—" && s !== "Nenalezeno") return s;
  }
  return "";
}

/**
 * Single canonical payable amount for CRM sync / payment summary.
 * Order follows: explicit payment line → frequency-aligned totals → breakdown lines last.
 */
export function selectCanonicalPaymentAmount(
  ef: Record<string, ExtractedField | undefined>,
  ctx: PaymentSemanticContext
): string {
  const freq = classifyPaymentFrequency(ef);
  const primary = ctx.primaryType;

  if (PENSION_PRIMARIES.has(primary)) {
    return fv(ef, [
      "contributionParticipant",
      "mesicniPrispevek",
      "monthlyContribution",
      "regularAmount",
      "premiumAmount",
      "totalMonthlyPremium",
      "annualPremium",
    ]);
  }

  if (INVESTMENT_PRIMARIES.has(primary)) {
    // `intendedInvestment` = celková zamýšlená investice za celý horizont
    // (viz RULE v combined-extraction: „Předpokládaná výše investice"),
    // a `amountToPay` může být cílový target. U pravidelného investování
    // (měsíčně / čtvrtletně / pololetně / ročně) NESMÍ tyto součtové/cílové
    // hodnoty přebít skutečnou splátku (regularAmount / premiumAmount /
    // totalMonthlyPremium / installmentAmount). Jinak shrnutí ukáže např.
    // „576 000 CZK (měsíčně)" místo reálných 3 000 CZK / měs.
    if (freq === "monthly" || freq === "quarterly" || freq === "semi_annual" || freq === "annual") {
      return fv(ef, [
        "regularAmount",
        "premiumAmount",
        "totalMonthlyPremium",
        "installmentAmount",
        "annualPremium",
        // až jako poslední – pokud nic explicitního není nalezeno,
        // povol i cílové / celkové pole (lepší něco než „—").
        "amountToPay",
        "intendedInvestment",
      ]);
    }
    // one_time / unknown → lump-sum pořadí (zde má intendedInvestment smysl).
    return fv(ef, [
      "oneOffAmount",
      "amountToPay",
      "intendedInvestment",
      "regularAmount",
      "premiumAmount",
      "installmentAmount",
      "totalMonthlyPremium",
      "annualPremium",
    ]);
  }

  const insurancePremiumKeysAnnual: string[] = [
    "premiumAmount",
    "regularAmount",
    "annualPremium",
    "totalMonthlyPremium",
    "monthlyPremium",
  ];

  const insurancePremiumKeysMonthly: string[] = [
    "premiumAmount",
    "regularAmount",
    "totalMonthlyPremium",
    "monthlyPremium",
    "annualPremium",
  ];

  if (NONLIFE_PRIMARIES.has(primary) || primary === "payment_instruction") {
    if (freq === "monthly") return fv(ef, insurancePremiumKeysMonthly);
    if (freq === "annual") return fv(ef, insurancePremiumKeysAnnual);
    return fv(ef, [
      "premiumAmount",
      "regularAmount",
      "annualPremium",
      "totalMonthlyPremium",
      "monthlyPremium",
    ]);
  }

  if (LIFE_PRIMARIES.has(primary)) {
    const keys = freq === "monthly" ? insurancePremiumKeysMonthly : insurancePremiumKeysAnnual;
    const base = fv(ef, keys);
    if (base) return base;
    return fv(ef, ["riskPremium"]);
  }

  // Default: unknown product family — explicit payment lines first; risk breakdown last.
  if (freq === "monthly") {
    return fv(ef, insurancePremiumKeysMonthly);
  }
  if (freq === "annual") {
    return fv(ef, insurancePremiumKeysAnnual);
  }
  return fv(ef, [
    "premiumAmount",
    "regularAmount",
    "annualPremium",
    "totalMonthlyPremium",
    "monthlyPremium",
  ]);
}

/** Whether non-life riskPremium is plausible from labels/snippet (not a coverage line guess). */
export function nonlifeRiskPremiumHasExplicitSemantics(cell: ExtractedField | undefined): boolean {
  if (!isPresent(cell)) return false;
  const text = [cell!.evidenceSnippet, cell!.sourceLabel].filter(Boolean).join(" ");
  if (!text.trim()) return false;
  return /\b(rizik|rizikov|rizikové|rizikove|pure\s*risk|netto\s*rizik|čistě\s*rizik|ciste\s*rizik|příplat|priplat)/i.test(
    text
  );
}

export function resolvePaymentSemanticContext(envelope: {
  documentClassification?: { primaryType?: PrimaryDocumentType } | null;
}): PaymentSemanticContext {
  return {
    primaryType: envelope.documentClassification?.primaryType ?? "unsupported_or_unknown",
  };
}
