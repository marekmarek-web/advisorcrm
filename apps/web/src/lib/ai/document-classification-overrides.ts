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
