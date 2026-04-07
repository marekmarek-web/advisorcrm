/**
 * AI Photo / Image Intake — multimodal combined pass (Phase 3).
 *
 * ONE structured vision call that delivers:
 * - classification upgrade (from image content, not just metadata)
 * - extracted facts per category
 * - possible client name signal (for CRM binding)
 * - draft reply intent (for communication screenshots)
 *
 * Cost rule: this is the escalation layer, NOT the default.
 * Called only when deterministic + text classifier don't suffice, or when
 * fact extraction is valuable for the input type.
 * Never called twice for the same asset in one request.
 */

import { createResponseStructuredWithImage, createResponseStructuredWithImages } from "@/lib/openai";
import { IMAGE_INPUT_TYPES } from "./types";
import type { ImageInputType, MultimodalCombinedPassResult, MultimodalFactItem } from "./types";
import { getImageIntakeMultimodalConfig } from "./feature-flag";

// ---------------------------------------------------------------------------
// JSON schema for the combined pass (classification + extraction in one call)
// ---------------------------------------------------------------------------

const COMBINED_PASS_SCHEMA = {
  type: "object",
  properties: {
    inputType: {
      type: "string",
      enum: IMAGE_INPUT_TYPES as unknown as string[],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rationale: { type: "string" },
    actionabilityLevel: {
      type: "string",
      enum: ["none", "low", "medium", "high"],
    },
    possibleClientNameSignal: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          factKey: { type: "string" },
          value: { anyOf: [{ type: "string" }, { type: "null" }] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source: { type: "string", enum: ["observed", "inferred"] },
        },
        required: ["factKey", "value", "confidence", "source"],
        additionalProperties: false,
      },
    },
    missingFields: { type: "array", items: { type: "string" } },
    ambiguityReasons: { type: "array", items: { type: "string" } },
    draftReplyIntent: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
  required: [
    "inputType",
    "confidence",
    "rationale",
    "actionabilityLevel",
    "possibleClientNameSignal",
    "facts",
    "missingFields",
    "ambiguityReasons",
    "draftReplyIntent",
  ],
  additionalProperties: false,
} as const;

type RawCombinedOutput = {
  inputType: ImageInputType;
  confidence: number;
  rationale: string;
  actionabilityLevel: "none" | "low" | "medium" | "high";
  possibleClientNameSignal: string | null;
  facts: Array<{ factKey: string; value: string | null; confidence: number; source: "observed" | "inferred" }>;
  missingFields: string[];
  ambiguityReasons: string[];
  draftReplyIntent: string | null;
};

// ---------------------------------------------------------------------------
// System prompt builder per input type
// ---------------------------------------------------------------------------

function buildCombinedPassPrompt(inputTypeHint: ImageInputType | null, accompanyingText: string | null): string {
  const hintLine = inputTypeHint ? `Předpokládaný typ vstupu: ${inputTypeHint}.` : "";
  const textLine = accompanyingText?.trim()
    ? `Doprovodná zpráva poradce: "${accompanyingText.trim().slice(0, 300)}"`
    : "";

  const factInstructions = buildFactInstructions(inputTypeHint);

  return [
    "Jsi AI systém pro zpracování obrazových vstupů finančního poradce.",
    "Analyzuj přiložený obrázek a vrať JSON podle schématu.",
    "",
    hintLine,
    textLine,
    "",
    "Klasifikuj obrázek jako jeden z typů:",
    "- screenshot_client_communication: WhatsApp, SMS, email, Messenger",
    "- photo_or_scan_document: foto nebo scan smlouvy, formuláře, dopisu",
    "- screenshot_payment_details: platební příkaz, QR platba, IBAN, VS",
    "- screenshot_bank_or_finance_info: bankovní dashboard, výpis, transakce",
    "- supporting_reference_image: referenční podklad, ceník, info karta",
    "- general_unusable_image: nečitelné, nekvalitní, nerelevantní",
    "- mixed_or_uncertain_image: kombinace typů nebo nejasný vstup",
    "",
    factInstructions,
    "",
    "Pravidla:",
    "- possibleClientNameSignal: jméno/příjmení osoby viditelné v obrázku, nebo null",
    "- draftReplyIntent: jen pro screenshot_client_communication — krátký záměr odpovědi (max 100 znaků), nebo null",
    "- facts: pouze fakta přímo viditelná nebo rozumně odvozená z obrázku",
    "- NIKDY nevymýšlej data, čísla, jména nebo fakta, která nejsou viditelná",
    "- source=observed: přímo čitelné z textu v obrázku",
    "- source=inferred: odvozené z kontextu/vizuálu, ne přímo čitelné",
    "- při nejistotě preferuj mixed_or_uncertain_image a nízkou confidence",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFactInstructions(inputTypeHint: ImageInputType | null): string {
  switch (inputTypeHint) {
    case "screenshot_client_communication":
      return [
        "Pro komunikační screenshot extrahuj fakta s klíči:",
        "- what_client_said: co klient napsal (krátce, max 200 znaků)",
        "- what_client_wants: co klient žádá nebo potřebuje (nebo null)",
        "- what_changed: co se změnilo, nová informace (nebo null)",
        "- required_follow_up: co je potřeba udělat jako reakci (nebo null)",
        "- urgency_signal: 'high'/'medium'/'low' nebo null",
        "- possible_date_mention: zmíněné datum nebo čas (nebo null)",
      ].join("\n");

    case "screenshot_payment_details":
      return [
        "Pro platební screenshot extrahuj fakta s klíči:",
        "- amount: výše platby s měnou (nebo null)",
        "- account_number: číslo účtu / IBAN (nebo null)",
        "- variable_symbol: variabilní symbol (nebo null)",
        "- due_date: datum splatnosti (nebo null)",
        "- recipient: příjemce platby (nebo null)",
        "- payment_method: způsob platby (QR, příkaz, atd.) nebo null",
        "- is_complete: 'yes'/'no'/'partial' — úplnost platebních údajů",
      ].join("\n");

    case "screenshot_bank_or_finance_info":
      return [
        "Pro bankovní screenshot extrahuj fakta s klíči:",
        "- balance_or_amount: zůstatek nebo transakční částka (nebo null)",
        "- transaction_description: popis transakce (nebo null)",
        "- product_or_account_type: typ produktu/účtu (nebo null)",
        "- date_range: datumové rozmezí výpisu (nebo null)",
        "- is_supporting_only: 'yes'/'no' — zda je jen jako referenční podklad",
      ].join("\n");

    case "photo_or_scan_document":
      return [
        "Pro sken/foto dokumentu extrahuj fakta s klíči:",
        "- document_type: typ dokumentu (smlouva, formulář, dopis, atd.) nebo null",
        "- document_summary: krátké shrnutí obsahu (max 200 znaků) nebo null",
        "- key_fact_1 až key_fact_3: klíčová fakta viditelná v dokumentu (nebo null)",
        "- looks_like_contract: 'yes'/'no' — zda vypadá jako finanční smlouva",
      ].join("\n");

    case "supporting_reference_image":
      return [
        "Pro referenční podklad extrahuj fakta s klíči:",
        "- relevance_summary: k čemu se obrázek vztahuje (max 150 znaků)",
        "- why_supporting: proč by měl zůstat jako referenční podklad",
      ].join("\n");

    default:
      return [
        "Extrahuj libovolná relevantní fakta s klíči popisujícími jejich typ.",
        "Pokud typ vstup je nejasný, extrahuj maximálně 3 klíčová fakta.",
      ].join("\n");
  }
}

// ---------------------------------------------------------------------------
// Validation and normalization of raw model output
// ---------------------------------------------------------------------------

function isValidInputType(t: unknown): t is ImageInputType {
  return typeof t === "string" && IMAGE_INPUT_TYPES.includes(t as ImageInputType);
}

function normalizeCombinedOutput(raw: unknown): MultimodalCombinedPassResult {
  if (!raw || typeof raw !== "object") return fallbackCombinedResult();
  const r = raw as Partial<RawCombinedOutput>;

  const inputType = isValidInputType(r.inputType) ? r.inputType : "mixed_or_uncertain_image";
  const confidence = typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.0;

  const facts: MultimodalFactItem[] = Array.isArray(r.facts)
    ? r.facts
        .filter((f): f is { factKey: string; value: string | null; confidence: number; source: "observed" | "inferred" } =>
          typeof f === "object" && f !== null && typeof f.factKey === "string"
        )
        .map((f) => ({
          factKey: f.factKey,
          value: typeof f.value === "string" ? f.value : null,
          confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.5,
          source: f.source === "observed" || f.source === "inferred" ? f.source : "inferred",
        }))
    : [];

  const actionabilityLevels = ["none", "low", "medium", "high"] as const;
  const actionabilityLevel = actionabilityLevels.includes(r.actionabilityLevel as any)
    ? (r.actionabilityLevel as "none" | "low" | "medium" | "high")
    : "none";

  return {
    inputType,
    confidence,
    rationale: typeof r.rationale === "string" ? r.rationale.slice(0, 400) : "",
    actionabilityLevel,
    possibleClientNameSignal:
      typeof r.possibleClientNameSignal === "string" && r.possibleClientNameSignal.trim()
        ? r.possibleClientNameSignal.trim().slice(0, 100)
        : null,
    facts,
    missingFields: Array.isArray(r.missingFields) ? r.missingFields.filter((f): f is string => typeof f === "string") : [],
    ambiguityReasons: Array.isArray(r.ambiguityReasons) ? r.ambiguityReasons.filter((f): f is string => typeof f === "string") : [],
    draftReplyIntent:
      typeof r.draftReplyIntent === "string" && r.draftReplyIntent.trim()
        ? r.draftReplyIntent.trim().slice(0, 200)
        : null,
  };
}

function fallbackCombinedResult(): MultimodalCombinedPassResult {
  return {
    inputType: "mixed_or_uncertain_image",
    confidence: 0.0,
    rationale: "Multimodal pass selhal nebo vrátil neplatná data.",
    actionabilityLevel: "none",
    possibleClientNameSignal: null,
    facts: [],
    missingFields: [],
    ambiguityReasons: ["multimodal_pass_failed"],
    draftReplyIntent: null,
  };
}

// ---------------------------------------------------------------------------
// Cost decision: when to run multimodal pass
// ---------------------------------------------------------------------------

/** Input types that ALWAYS warrant extraction (run multimodal). */
const EXTRACTION_WORTHY_TYPES = new Set<ImageInputType>([
  "screenshot_client_communication",
  "screenshot_payment_details",
  "screenshot_bank_or_finance_info",
  "photo_or_scan_document",
]);

/** Input types that should NEVER run multimodal (no value). */
const SKIP_MULTIMODAL_TYPES = new Set<ImageInputType>([
  "general_unusable_image",
  "supporting_reference_image",
]);

/**
 * Determines whether the multimodal pass should be run.
 * Cheap-first: only escalate when it adds value.
 */
export function shouldRunMultimodalPass(
  inputType: ImageInputType,
  confidence: number,
  earlyExit: boolean,
  storageUrl: string | null,
  multimodalEnabled: boolean,
): boolean {
  if (earlyExit || !storageUrl || !multimodalEnabled) return false;
  if (SKIP_MULTIMODAL_TYPES.has(inputType)) return false;

  // Always extract for high-value types
  if (EXTRACTION_WORTHY_TYPES.has(inputType)) return true;

  // For mixed/uncertain: run only if confidence is low enough to be worth clarifying
  if (inputType === "mixed_or_uncertain_image" && confidence < 0.5) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Main entry: run combined multimodal pass
// ---------------------------------------------------------------------------

export type MultimodalPassDecision = {
  result: MultimodalCombinedPassResult;
  usedModel: true;
};

/**
 * Run one structured vision call: classification + extraction + client signal.
 * Returns combined result. Fallback on failure (never throws to caller).
 */
export async function runCombinedMultimodalPass(
  imageUrl: string,
  inputTypeHint: ImageInputType | null,
  accompanyingText: string | null,
): Promise<MultimodalPassDecision> {
  const config = getImageIntakeMultimodalConfig();
  const prompt = buildCombinedPassPrompt(inputTypeHint, accompanyingText);

  try {
    const response = await createResponseStructuredWithImage<RawCombinedOutput>(
      imageUrl,
      prompt,
      COMBINED_PASS_SCHEMA as Record<string, unknown>,
      {
        model: config.model,
        store: false,
        routing: { category: config.routingCategory },
        schemaName: "image_intake_combined",
      },
    );

    return { result: normalizeCombinedOutput(response.parsed), usedModel: true };
  } catch {
    return { result: fallbackCombinedResult(), usedModel: true };
  }
}

/**
 * Phase 7: Run structured vision call with multiple related image URLs.
 * Sends all images in one call for grouped-thread understanding.
 *
 * Safety:
 * - maxImages enforced at provider layer (max 5) and caller layer
 * - Only for related grouped assets (caller responsibility)
 * - Falls back to single-image pass if multi-image call fails
 */
export async function runMultiImageCombinedPass(
  imageUrls: string[],
  inputTypeHint: ImageInputType | null,
  accompanyingText: string | null,
  maxImages = 3,
): Promise<MultimodalPassDecision & { imageCount: number }> {
  const cappedUrls = imageUrls.slice(0, Math.min(maxImages, 5));
  if (cappedUrls.length === 0) {
    return { result: fallbackCombinedResult(), usedModel: true, imageCount: 0 };
  }

  if (cappedUrls.length === 1) {
    const single = await runCombinedMultimodalPass(cappedUrls[0]!, inputTypeHint, accompanyingText);
    return { ...single, imageCount: 1 };
  }

  const config = getImageIntakeMultimodalConfig();
  const prompt = buildCombinedPassPrompt(inputTypeHint, accompanyingText);

  try {
    const response = await createResponseStructuredWithImages<RawCombinedOutput>(
      cappedUrls,
      prompt,
      COMBINED_PASS_SCHEMA as Record<string, unknown>,
      {
        model: config.model,
        store: false,
        routing: { category: config.routingCategory },
        schemaName: "image_intake_multi_combined",
        maxImages,
      },
    );

    return { result: normalizeCombinedOutput(response.parsed), usedModel: true, imageCount: cappedUrls.length };
  } catch {
    // Fallback to primary image single pass
    try {
      const fallback = await runCombinedMultimodalPass(cappedUrls[0]!, inputTypeHint, accompanyingText);
      return { ...fallback, imageCount: 1 };
    } catch {
      return { result: fallbackCombinedResult(), usedModel: true, imageCount: 0 };
    }
  }
}
