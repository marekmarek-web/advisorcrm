/**
 * Plan 3 §7.3 — rule-based classification overrides from short OCR/markdown text.
 * Does not replace the model; only adjusts type when markers are very strong.
 */

import type { PrimaryDocumentType } from "./document-review-types";
import type { ClassificationResult } from "./document-classification";

export type ClassificationOverrideResult = {
  classification: ClassificationResult;
  overrideApplied: boolean;
  classificationOverrideReason?: string;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

type Rule = {
  id: string;
  /** Minimum number of marker groups that must match */
  minHits: number;
  markers: RegExp[];
  targetType: PrimaryDocumentType;
};

const RULES: Rule[] = [
  {
    id: "payment_iban_vs",
    minHits: 2,
    markers: [
      /platebn[ií]\s+instruk/i,
      /\biban\b/i,
      /variabiln[ií]\s+symbol|vs[\s:.]*[0-9]/i,
    ],
    targetType: "payment_instruction",
  },
  {
    id: "loan_rpsn",
    minHits: 2,
    markers: [/smlouva\s+o\s+úvěru|uveru|spotřebitelský\s+úvěr/i, /\brpsn\b/i, /výše\s+úvěru|vyse\s+uveru/i],
    targetType: "consumer_loan_contract",
  },
  {
    id: "bank_statement",
    minHits: 2,
    markers: [/výpis\s+z\s+účtu|vypis\s+z\s+uctu|bankovní\s+výpis/i, /počáteční\s+zůstatek|pocatecni\s+zustatek/i, /konečný\s+zůstatek|konecny\s+zustatek/i],
    targetType: "bank_statement",
  },
  {
    id: "modelace_disclaimer",
    minHits: 2,
    markers: [/detailn[ií]\s+nabídka|detailni\s+nabidka/i, /nejedná\s+se\s+o\s+nabídku|modelace|ilustrace/i],
    targetType: "life_insurance_modelation",
  },
  {
    id: "insurance_contract_headers",
    minHits: 2,
    markers: [/pojistn[aá]\s+smlouva/i, /pojistitel/i, /číslo\s+pojistné\s+smlouvy|cislo\s+pojistne\s+smlouvy/i],
    targetType: "life_insurance_contract",
  },
];

// ─── Product family override: DIP / DPS / PP ─────────────────────────────────
// Maps text-based signals to the router-level product family strings.
// These families are consumed by resolveAiReviewExtractionRoute, which uses
// them to select the correct extraction prompt key (dipExtraction / retirementProductExtraction).

type ProductFamilyOverrideRule = {
  id: string;
  minHits: number;
  markers: RegExp[];
  /** Overrides ai.productFamily before router call. Must match router §§ family strings. */
  targetFamily: string;
};

// NOTE: markers are tested against a normalized (NFD-decomposed, combining marks stripped,
// lowercased) version of the text — same as in the norm() helper above.
// Czech characters are therefore normalized: ě→e, á→a, í→i, ó→o, ú→u, ý→y, č→c, š→s, ž→z etc.
const PRODUCT_FAMILY_OVERRIDE_RULES: ProductFamilyOverrideRule[] = [
  {
    id: "dip_keywords",
    minHits: 2,
    markers: [
      // "dlouhodobý investiční produkt" normalized → "dlouhodoby investicni produkt"
      /dlouhodoby\s+investicni\s+produkt/i,
      /\bdip\b/,
      /smlouva\s+o\s+dip\b/i,
      /dip\s+(ucet|cislo|smlouva)/i,
    ],
    targetFamily: "dip",
  },
  {
    id: "dps_keywords",
    minHits: 2,
    markers: [
      // "doplňkové penzijní spoření" normalized → "doplnkove penzijni sporeni"
      /doplnkove\s+penzijni\s+sporeni/i,
      /\bdps\b/,
      // "penzijní společnost" / "penzijní fond" normalized
      /penzijni\s+(spolecnost|fond)/i,
      // "účastnická smlouva" normalized → "ucastnicka smlouva"
      /ucastnicka\s+smlouva.*dps/i,
      /transformovany\s+fond/i,
    ],
    targetFamily: "dps",
  },
  {
    id: "pp_pension_keywords",
    minHits: 2,
    markers: [
      // "penzijní připojištění" normalized → "penzijni pripojisteni"
      /penzijni\s+pripojisteni/i,
      /penzijni\s+fond/i,
      // "smlouva o penzijním připojištění" normalized
      /smlouva\s+o\s+penzijnim\s+pripojisteni/i,
      // "státní příspěvek" normalized → "statni prispevek"
      /statni\s+prispevek.*penzijn/i,
    ],
    targetFamily: "pp",
  },
];

export type ProductFamilyOverrideResult = {
  productFamily: string;
  overrideApplied: boolean;
  overrideReason?: string;
};

/**
 * Override the LLM-determined productFamily using rule-based text signals.
 * Called before resolveAiReviewExtractionRoute in the V2 pipeline to fix
 * DIP/DPS/PP documents that the classifier returned as "life_insurance".
 *
 * Only activates when the current family is life_insurance (or unknown) AND
 * the text strongly signals DIP/DPS/PP — avoids false overrides.
 */
export function applyProductFamilyTextOverride(
  currentProductFamily: string,
  textSnippet: string | null | undefined,
): ProductFamilyOverrideResult {
  // Only override life_insurance or generic families — don't touch already-correct routing
  const OVERRIDABLE_FAMILIES = new Set([
    "life_insurance",
    "unknown",
    "generic_financial_product",
    "legacy_financial_product",
  ]);
  if (!OVERRIDABLE_FAMILIES.has(currentProductFamily?.toLowerCase().trim())) {
    return { productFamily: currentProductFamily, overrideApplied: false };
  }
  if (!textSnippet || textSnippet.trim().length < 40) {
    return { productFamily: currentProductFamily, overrideApplied: false };
  }

  const haystack = textSnippet
    .slice(0, 24_000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  for (const rule of PRODUCT_FAMILY_OVERRIDE_RULES) {
    let hits = 0;
    for (const marker of rule.markers) {
      if (marker.test(haystack)) hits++;
    }
    if (hits >= rule.minHits) {
      return {
        productFamily: rule.targetFamily,
        overrideApplied: true,
        overrideReason: rule.id,
      };
    }
  }

  return { productFamily: currentProductFamily, overrideApplied: false };
}

// ─── Router-input text overrides (G03/G08/G09 family / docType correction) ───
// Applied in V2 pipeline BEFORE the router to fix wrong LLM-classifier outputs
// without touching the main classifier call.

export type RouterInputOverrideResult = {
  productFamily: string;
  documentType: string;
  productSubtype: string;
  overrideApplied: boolean;
  overrideReasons: string[];
};

const AML_COMPLIANCE_MARKERS: RegExp[] = [
  /\baml\b/,
  /fatca/,
  /anti.mone.*launder/,
  /legitimace\s+(prostredku|zdroje)/,
  /politicky\s+exponovana/,
  /\bkyc\b/,
  /boj\s+proti.*praci\s+penez/,
  /identifikac.*klienta\s+dle\s+zakona/,
];

const LEASING_MARKERS: RegExp[] = [
  /\bleasing\b/,
  /leasingov\w+\s+smlouva/,
  /smlouva\s+o\s+(financnim|financovacim|financovani)/,
  /najemce|pronajimatele/,
  /csob\s+leasing/,
  /financovani\s+vozidla|financovani\s+majetku/,
  /\bpbi\b/,
];

const LIFE_CONTRACT_HEADER_MARKERS: RegExp[] = [
  /pojistna\s+smlouva/,
  /pojistitel/,
  /cislo\s+pojistne\s+smlouvy/,
];

/**
 * Rule-based override for router input fields (productFamily / documentType / productSubtype).
 * Called in the V2 pipeline AFTER the LLM classifier and BEFORE resolveAiReviewExtractionRoute.
 * Priorities: AML/compliance > leasing > life-insurance modelation→contract correction.
 */
export function applyRouterInputTextOverrides(
  currentProductFamily: string,
  currentDocumentType: string,
  currentProductSubtype: string,
  textSnippet: string | null | undefined,
): RouterInputOverrideResult {
  const base: RouterInputOverrideResult = {
    productFamily: currentProductFamily,
    documentType: currentDocumentType,
    productSubtype: currentProductSubtype,
    overrideApplied: false,
    overrideReasons: [],
  };
  if (!textSnippet || textSnippet.trim().length < 40) return base;

  const haystack = textSnippet
    .slice(0, 32_000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  // Priority 1: AML/FATCA compliance — overrides generic/investment family when the document
  // is primarily a compliance/KYC form rather than a product contract with AML clauses.
  // Guards: skip when product family is already a specific product (DIP/DPS/PP/loan/…),
  // or when strong insurance/investment primary contract headers are present.
  {
    // Guard 1: already-specific product families contain AML clauses by regulation — don't override
    const PRODUCT_FAMILIES_WITH_EMBEDDED_AML = new Set([
      "dip", "dps", "pp", "loan", "mortgage", "building_savings", "leasing",
    ]);
    if (!PRODUCT_FAMILIES_WITH_EMBEDDED_AML.has(currentProductFamily)) {
      let amlHits = 0;
      for (const m of AML_COMPLIANCE_MARKERS) {
        if (m.test(haystack)) amlHits++;
        if (amlHits >= 2) break;
      }
      if (amlHits >= 2) {
        // Guard 2: if document has ≥2 insurance contract headers, it's a primary insurance
        // contract with an embedded AML section — skip the override.
        let contractHits = 0;
        for (const m of LIFE_CONTRACT_HEADER_MARKERS) {
          if (m.test(haystack)) contractHits++;
        }
        if (contractHits < 2) {
          return {
            productFamily: "compliance",
            documentType: "consent_or_identification_document",
            productSubtype: "aml_kyc_form",
            overrideApplied: true,
            overrideReasons: ["aml_compliance_override"],
          };
        }
      }
    }
  }

  // Priority 2: Leasing / financial lease — override when clear leasing signals
  {
    let hits = 0;
    for (const m of LEASING_MARKERS) {
      if (m.test(haystack)) hits++;
      if (hits >= 2) break;
    }
    if (hits >= 2) {
      const dt =
        currentDocumentType === "contract" ||
        currentDocumentType === "amendment" ||
        currentDocumentType.includes("contract")
          ? "contract"
          : "unknown";
      return {
        productFamily: "leasing",
        documentType: dt,
        productSubtype: "leasing_contract",
        overrideApplied: true,
        overrideReasons: ["leasing_override"],
      };
    }
  }

  // Priority 3: Life insurance classified as modelation but has strong contract headers
  // → reclassify as contract so insuranceContractExtraction is used
  {
    const isLifeFam = currentProductFamily === "life_insurance";
    const isModelationDt =
      currentDocumentType === "modelation" ||
      currentDocumentType === "life_insurance_modelation";
    if (isLifeFam && isModelationDt) {
      let hits = 0;
      for (const m of LIFE_CONTRACT_HEADER_MARKERS) {
        if (m.test(haystack)) hits++;
      }
      if (hits >= 2) {
        return {
          productFamily: currentProductFamily,
          documentType: "contract",
          productSubtype: currentProductSubtype,
          overrideApplied: true,
          overrideReasons: ["life_contract_modelation_correction"],
        };
      }
    }
  }

  return base;
}

export function applyRuleBasedClassificationOverride(
  classification: ClassificationResult,
  textSnippet: string | null | undefined
): ClassificationOverrideResult {
  if (!textSnippet || textSnippet.trim().length < 40) {
    return { classification, overrideApplied: false };
  }

  const haystack = norm(textSnippet.slice(0, 24_000));

  for (const rule of RULES) {
    let hits = 0;
    for (const re of rule.markers) {
      if (re.test(haystack)) hits++;
    }
    if (hits >= rule.minHits) {
      if (classification.primaryType === rule.targetType) {
        return { classification, overrideApplied: false };
      }
      return {
        classification: {
          ...classification,
          primaryType: rule.targetType,
          reasons: [
            `rule_override:${rule.id}`,
            ...classification.reasons.filter((r) => !r.startsWith("rule_override:")),
          ],
          confidence: Math.max(classification.confidence, 0.72),
        },
        overrideApplied: true,
        classificationOverrideReason: rule.id,
      };
    }
  }

  return { classification, overrideApplied: false };
}
