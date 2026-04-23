/**
 * Product categories & subtypes používané v AI Review a následně v BJ kalkulaci.
 *
 * Kategorie popisuje ekonomickou povahu produktu (životní pojištění pravidelné,
 * investice s vstupním poplatkem, hypotéka, …), subtype pak upřesňuje chování
 * relevantní pro produkci / provizní výpočet (např. PPI ano/ne, single/regular).
 *
 * Používá se:
 *   1. při AI extrakci (combined-extraction) — classifyProduct() doplní výsledky
 *      do envelope a zároveň řídí confidence + needs_human_review flag,
 *   2. v UI (ExtractionLeftPanel) pro zobrazení badge,
 *   3. v BJ kalkulaci — mapování kategorie → coefficient tabulka.
 */

export const PRODUCT_CATEGORIES = [
  "INVESTMENT_ENTRY_FEE",
  "INVESTMENT_SINGLE_WITH_ENTRY_FEE",
  "INVESTMENT_AUM_FOLLOWUP",
  "PENSION_PARTICIPANT_CONTRIBUTION",
  "LIFE_INSURANCE_REGULAR",
  "LIFE_INSURANCE_SINGLE",
  "MOTOR_INSURANCE",
  "PROPERTY_INSURANCE",
  "LIABILITY_INSURANCE",
  "MORTGAGE",
  "CONSUMER_LOAN",
  "LEASING",
  "UNKNOWN_REVIEW",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_SUBTYPES = [
  "with_ppi",
  "without_ppi",
  "regular_payment",
  "single_payment",
  "biometric_signed",
  "not_biometric_signed",
  "investment_fund",
  "pension",
  "mortgage",
  "unsecured_loan",
  "auto",
  "property",
] as const;
export type ProductSubtype = (typeof PRODUCT_SUBTYPES)[number];

export type ExtractionConfidence = "high" | "medium" | "low";

/** Jediný human-readable popisek kategorie (UI badge). */
export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  INVESTMENT_ENTRY_FEE: "Investice — vstupní poplatek",
  INVESTMENT_SINGLE_WITH_ENTRY_FEE: "Investice — jednoráz + poplatek",
  INVESTMENT_AUM_FOLLOWUP: "Investice — AUM follow-up",
  PENSION_PARTICIPANT_CONTRIBUTION: "Penzijní spoření (DPS) — účastník",
  LIFE_INSURANCE_REGULAR: "Životní pojištění (pravidelné)",
  LIFE_INSURANCE_SINGLE: "Životní pojištění (jednorázové)",
  MOTOR_INSURANCE: "Autopojištění",
  PROPERTY_INSURANCE: "Pojištění majetku",
  LIABILITY_INSURANCE: "Pojištění odpovědnosti",
  MORTGAGE: "Hypotéka",
  CONSUMER_LOAN: "Spotřebitelský úvěr",
  LEASING: "Leasing",
  UNKNOWN_REVIEW: "Nezařazeno (review)",
};

export const PRODUCT_SUBTYPE_LABELS: Record<ProductSubtype, string> = {
  with_ppi: "s PPI",
  without_ppi: "bez PPI",
  regular_payment: "pravidelná platba",
  single_payment: "jednorázová platba",
  biometric_signed: "biometrický podpis",
  not_biometric_signed: "bez biometrie",
  investment_fund: "investiční fond",
  pension: "penzijní",
  mortgage: "hypotéka",
  unsecured_loan: "nezajištěný úvěr",
  auto: "auto",
  property: "majetek",
};

/** Partner / product klíčová slova → kategorie (má přednost před heuristikou). */
export const PARTNER_PRODUCT_RULES: Array<{
  /** Regex přes provider + product + segment (case insensitive, unicode). */
  pattern: RegExp;
  category: ProductCategory;
  subtypes?: ProductSubtype[];
  /** Pokud je uvedeno a pattern sedí, pak confidence override (jinak dopočítáme). */
  confidenceHint?: ExtractionConfidence;
}> = [
  // ── Investice — vstupní poplatek (Amundi, Edward, CODYA, Investika) ───────
  { pattern: /\bamundi(?:\s+invest)?\b/i, category: "INVESTMENT_ENTRY_FEE", subtypes: ["investment_fund"] },
  { pattern: /\bedward\b/i, category: "INVESTMENT_ENTRY_FEE", subtypes: ["investment_fund"] },
  { pattern: /\bcodya(mix)?\b/i, category: "INVESTMENT_ENTRY_FEE", subtypes: ["investment_fund"] },
  { pattern: /\binvestika\b/i, category: "INVESTMENT_ENTRY_FEE", subtypes: ["investment_fund"] },

  // ── Investice — jednoráz + vstupní poplatek (realitní / ATRIS / EFEKTA) ──
  { pattern: /\batris\b/i, category: "INVESTMENT_SINGLE_WITH_ENTRY_FEE", subtypes: ["investment_fund", "single_payment"] },
  { pattern: /\befekta\b/i, category: "INVESTMENT_SINGLE_WITH_ENTRY_FEE", subtypes: ["investment_fund", "single_payment"] },
  { pattern: /\brealitní\s+fond|realitn[ií]\s+fond/i, category: "INVESTMENT_SINGLE_WITH_ENTRY_FEE", subtypes: ["investment_fund", "single_payment"] },

  // ── Penzijní spoření účastníka (Conseq PS / DPS / DIP) ─────────────────
  { pattern: /\bconseq\b.*\b(ps|doplňkové|doplnkov[eé]|penzijn[ií])\b/i, category: "PENSION_PARTICIPANT_CONTRIBUTION", subtypes: ["pension"] },
  { pattern: /\b(dps|doplňkové\s+penzijní)\b/i, category: "PENSION_PARTICIPANT_CONTRIBUTION", subtypes: ["pension"] },

  // ── Autopojištění ──────────────────────────────────────────────────────
  { pattern: /\bpillow\b/i, category: "MOTOR_INSURANCE", subtypes: ["auto"] },
  { pattern: /\b(pov|povinné\s+ručení|hav[áa]rijn[ií])\b/i, category: "MOTOR_INSURANCE", subtypes: ["auto"] },

  // ── Životní pojištění (pravidelné) ────────────────────────────────────
  { pattern: /\bnn\b.*\b(život|zivot|životn[ií])\b/i, category: "LIFE_INSURANCE_REGULAR", subtypes: ["regular_payment"] },
  { pattern: /\buniqa\b.*\b(život|zivot|životn[ií])\b/i, category: "LIFE_INSURANCE_REGULAR", subtypes: ["regular_payment"] },
  { pattern: /\b(maxima|allianz|koopa?|kooperativa|generali|česká\s+pojišťovna)\b.*\b(život|zivot|životn[ií])\b/i, category: "LIFE_INSURANCE_REGULAR", subtypes: ["regular_payment"] },

  // ── Majetkové pojištění ────────────────────────────────────────────────
  { pattern: /\b(nemovitost|domácnost|budova|chata|byt)\b/i, category: "PROPERTY_INSURANCE", subtypes: ["property"] },

  // ── Odpovědnost ────────────────────────────────────────────────────────
  { pattern: /\bodpovědnost(?:i)?\b/i, category: "LIABILITY_INSURANCE" },

  // ── Hypotéky ──────────────────────────────────────────────────────────
  { pattern: /\b(rb|raiffeisenbank)\b.*\bhypo/i, category: "MORTGAGE", subtypes: ["mortgage"] },
  { pattern: /\b(ucb|unicredit)\b.*\bhypo/i, category: "MORTGAGE", subtypes: ["mortgage"] },
  { pattern: /\bhypotéka|\bhypo(téka|teka)\b/i, category: "MORTGAGE", subtypes: ["mortgage"] },

  // ── Spotřebitelské úvěry ──────────────────────────────────────────────
  { pattern: /\brsts\b/i, category: "CONSUMER_LOAN", subtypes: ["unsecured_loan"] },
  { pattern: /\bpresto\b/i, category: "CONSUMER_LOAN", subtypes: ["unsecured_loan"] },
  { pattern: /\b(spotřebit|rekop[uůu]jčka|půjčka|úvěr(?!.*hypo))\b/i, category: "CONSUMER_LOAN", subtypes: ["unsecured_loan"] },

  // ── Leasing ───────────────────────────────────────────────────────────
  { pattern: /\bčsob\s+leasing|leasing\b/i, category: "LEASING" },
];

export type ClassifyProductInput = {
  /** Název poskytovatele / instituce (partner). */
  providerName?: string | null;
  /** Název produktu. */
  productName?: string | null;
  /** Segment (ZP, INV, DPS, HYPO, …) — fallback pokud nic jiného neodhaduje. */
  segment?: string | null;
  /** Typ platby z dokumentu / formuláře (regular / one_time). */
  paymentType?: "one_time" | "regular" | null;
  /** Volitelně — přítomnost vstupního poplatku (pro rozlišení AUM vs entry-fee). */
  hasEntryFee?: boolean | null;
  /** Volitelně — PPI (payment protection insurance) u úvěrů. */
  hasPpi?: boolean | null;
  /** Volitelně — zaplacení skrze biometrii. */
  biometricSigned?: boolean | null;
};

export type ClassifyProductResult = {
  category: ProductCategory;
  subtypes: ProductSubtype[];
  confidence: ExtractionConfidence;
  needsHumanReview: boolean;
  matchedRule?: string;
  notes: string[];
};

function segmentToCategoryFallback(segment: string | null | undefined): ProductCategory {
  const s = (segment ?? "").toUpperCase();
  switch (s) {
    case "ZP":
      return "LIFE_INSURANCE_REGULAR";
    case "MAJ":
      return "PROPERTY_INSURANCE";
    case "ODP":
    case "ODP_ZAM":
      return "LIABILITY_INSURANCE";
    case "AUTO_PR":
    case "AUTO_HAV":
      return "MOTOR_INSURANCE";
    case "INV":
      return "INVESTMENT_ENTRY_FEE";
    case "DIP":
    case "DPS":
      return "PENSION_PARTICIPANT_CONTRIBUTION";
    case "HYPO":
      return "MORTGAGE";
    case "UVER":
      return "CONSUMER_LOAN";
    default:
      return "UNKNOWN_REVIEW";
  }
}

/**
 * Základní klasifikace produktu + výpočet confidence / needs_human_review.
 *
 * Deterministická, bez volání LLM — používá se jako filtr nad raw extrakcí.
 */
export function classifyProduct(input: ClassifyProductInput): ClassifyProductResult {
  const haystack = [input.providerName ?? "", input.productName ?? "", input.segment ?? ""].join(" ");
  const notes: string[] = [];

  let category: ProductCategory = "UNKNOWN_REVIEW";
  const subtypes = new Set<ProductSubtype>();
  let matchedRule: string | undefined;
  let confidence: ExtractionConfidence = "medium";

  for (const rule of PARTNER_PRODUCT_RULES) {
    if (rule.pattern.test(haystack)) {
      category = rule.category;
      matchedRule = rule.pattern.source;
      if (rule.subtypes) for (const st of rule.subtypes) subtypes.add(st);
      if (rule.confidenceHint) confidence = rule.confidenceHint;
      break;
    }
  }

  if (category === "UNKNOWN_REVIEW") {
    const fallback = segmentToCategoryFallback(input.segment);
    if (fallback !== "UNKNOWN_REVIEW") {
      category = fallback;
      confidence = "low";
      notes.push(`Kategorie odvozena jen ze segmentu „${input.segment}“ — pro jistotu zkontrolujte.`);
    } else {
      confidence = "low";
      notes.push("Nepodařilo se odhadnout kategorii produktu z názvu ani ze segmentu.");
    }
  }

  // Odvození subtypu z paymentType
  if (input.paymentType === "one_time") subtypes.add("single_payment");
  if (input.paymentType === "regular") subtypes.add("regular_payment");

  // PPI / biometrie — pokud víme
  if (input.hasPpi === true) subtypes.add("with_ppi");
  if (input.hasPpi === false) subtypes.add("without_ppi");
  if (input.biometricSigned === true) subtypes.add("biometric_signed");
  if (input.biometricSigned === false) subtypes.add("not_biometric_signed");

  // Entry fee zpřesnění u investic
  if (category === "INVESTMENT_ENTRY_FEE" && input.hasEntryFee === false) {
    category = "INVESTMENT_AUM_FOLLOWUP";
    notes.push("Vstupní poplatek není u produktu uveden — překlasifikováno na AUM follow-up.");
  }

  // needs_human_review: low confidence, UNKNOWN, nebo chybějící základní identifikace
  const providerTrimmed = (input.providerName ?? "").trim();
  const productTrimmed = (input.productName ?? "").trim();
  const missingProvider = providerTrimmed.length === 0;
  const missingProduct = productTrimmed.length === 0;
  if (missingProvider || missingProduct) {
    confidence = "low";
    if (missingProvider) notes.push("Chybí název poskytovatele / instituce.");
    if (missingProduct) notes.push("Chybí název produktu — doplňte nebo potvrďte název podle poskytovatele.");
  }

  const needsHumanReview =
    category === "UNKNOWN_REVIEW" || confidence === "low" || missingProvider || missingProduct;

  return {
    category,
    subtypes: Array.from(subtypes),
    confidence,
    needsHumanReview,
    matchedRule,
    notes,
  };
}

/**
 * Pokud je název produktu prázdný nebo vypadá jako halucinace (obecné fráze),
 * vrátíme bezpečné náhradní pojmenování „<poskytovatel> — produkt k doplnění".
 *
 * Prompt rule: raději fallback než halucinace. UI tuto hodnotu označí jako
 * „potřebuje review“ a nezapíše ji do produkce bez potvrzení.
 */
export function safeProductNameFallback(
  rawProductName: string | null | undefined,
  providerName: string | null | undefined,
): string | null {
  const product = (rawProductName ?? "").trim();
  const provider = (providerName ?? "").trim();
  const genericPhrases = [/^produkt$/i, /^smlouva$/i, /^investice$/i, /^pojištění$/i];
  const isGeneric = product.length === 0 || genericPhrases.some((re) => re.test(product));
  if (!isGeneric) return product;
  if (!provider) return null;
  return `${provider} — produkt k doplnění`;
}
