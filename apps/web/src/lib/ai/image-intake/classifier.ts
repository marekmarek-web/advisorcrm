/**
 * AI Photo / Image Intake — cheap-first classifier v1.
 *
 * Two-layer architecture:
 * 1. Deterministic — MIME, filename hints, dimensions, obvious dead ends (free)
 * 2. Light model call — text description of metadata + accompanying text (cheap)
 *
 * Cost guardrails:
 * - Layer 1 can fully classify obvious cases without any model call
 * - Layer 2 only runs when deterministic layer is uncertain (confidence < threshold)
 * - Layer 2 uses metadata text description, NOT the image itself (Phase 3 adds multimodal)
 * - Obvious unusable inputs exit before any model call
 */

import { createResponseStructured } from "@/lib/openai";
import type { NormalizedImageAsset, InputClassificationResult, ImageInputType } from "./types";
import { IMAGE_INPUT_TYPES } from "./types";
import { getImageIntakeClassifierConfig } from "./feature-flag";

// ---------------------------------------------------------------------------
// Classifier JSON schema for structured output
// ---------------------------------------------------------------------------

const CLASSIFIER_JSON_SCHEMA = {
  type: "object",
  properties: {
    inputType: {
      type: "string",
      enum: IMAGE_INPUT_TYPES as unknown as string[],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rationale: { type: "string", maxLength: 200 },
    needsDeepExtraction: { type: "boolean" },
    safePreviewAlready: { type: "boolean" },
  },
  required: ["inputType", "confidence", "rationale", "needsDeepExtraction", "safePreviewAlready"],
  additionalProperties: false,
} as const;

type ClassifierModelOutput = {
  inputType: ImageInputType;
  confidence: number;
  rationale: string;
  needsDeepExtraction: boolean;
  safePreviewAlready: boolean;
};

// ---------------------------------------------------------------------------
// Deterministic filename hints
// ---------------------------------------------------------------------------

const COMM_FILENAME_HINTS = /whatsapp|viber|messenger|sms|telegram|signal|chat|zprava|message|email/i;
const PAYMENT_FILENAME_HINTS = /platb|payment|invoice|faktura|qr|vs\b|variabilni/i;
const BANK_FILENAME_HINTS = /ucet|account|balance|banka|bank|transakce|transaction|vyber|vklad/i;
const DOCUMENT_FILENAME_HINTS = /smlouv|contract|potvrzeni|confirm|dokument|document|scan|foto|img|photo/i;

function classifyByFilenameHint(filename: string | null): ImageInputType | null {
  if (!filename) return null;
  const fn = filename.toLowerCase();
  if (COMM_FILENAME_HINTS.test(fn)) return "screenshot_client_communication";
  if (PAYMENT_FILENAME_HINTS.test(fn)) return "screenshot_payment_details";
  if (BANK_FILENAME_HINTS.test(fn)) return "screenshot_bank_or_finance_info";
  if (DOCUMENT_FILENAME_HINTS.test(fn)) return "photo_or_scan_document";
  return null;
}

// ---------------------------------------------------------------------------
// Deterministic accompanying text hints
// ---------------------------------------------------------------------------

const COMM_TEXT_HINTS = /zpráv|message|chat|napsal|napsal|poslal|whatsapp|sms|e-mail/i;
const PAYMENT_TEXT_HINTS = /platb|zaplatit|platební|platební údaje|QR|variabilní symbol|číslo účtu|IBAN/i;
const BANK_TEXT_HINTS = /stav účtu|zůstatek|transakce|banka|bankovní výpis|výpis/i;
const DOCUMENT_TEXT_HINTS = /smlouva|potvrzení|dokument|sken|scan|formulář|dopis/i;
const CRM_EXTRACTION_TEXT_HINTS = /(?:přiřaď|doplň|ulož|vyplň|přiřadit|doplnit|uložit).*(?:údaj|klient|CRM|kontakt|portál|rodné|adres|telefon|email)/i;
const NOTE_TASK_TEXT_HINTS = /(?:udělej|vytvoř|zapiš|založ).*(?:poznámk|úkol|follow|záznam)/i;

function classifyByTextHints(text: string | null): ImageInputType | null {
  if (!text || text.trim().length < 3) return null;
  if (COMM_TEXT_HINTS.test(text) && !CRM_EXTRACTION_TEXT_HINTS.test(text)) return "screenshot_client_communication";
  if (PAYMENT_TEXT_HINTS.test(text)) return "screenshot_payment_details";
  if (BANK_TEXT_HINTS.test(text)) return "screenshot_bank_or_finance_info";
  if (CRM_EXTRACTION_TEXT_HINTS.test(text)) return "photo_or_scan_document";
  if (DOCUMENT_TEXT_HINTS.test(text)) return "photo_or_scan_document";
  if (NOTE_TASK_TEXT_HINTS.test(text)) return "screenshot_client_communication";
  return null;
}

// ---------------------------------------------------------------------------
// Layer 1: Deterministic classifier (free)
// ---------------------------------------------------------------------------

/**
 * Returns a classification if deterministic signals are strong enough.
 * Returns null if uncertain — triggers Layer 2.
 */
function classifyDeterministic(
  asset: NormalizedImageAsset,
  accompanyingText: string | null,
): { result: InputClassificationResult; skipModelCall: boolean } | null {
  // Unusable MIME: already caught by preflight, but double-check
  if (asset.mimeType === "application/pdf" || asset.mimeType.startsWith("video/")) {
    return null; // let preflight handle this
  }

  // Obvious unusable quality (very tiny)
  const pixels = (asset.width ?? 0) * (asset.height ?? 0);
  if (asset.width !== null && asset.height !== null && pixels < 40_000) {
    return {
      result: makeResult("general_unusable_image", 0.95, "Image je příliš malý pro smysluplnou klasifikaci.", false, false),
      skipModelCall: true,
    };
  }

  // Try strong filename signal
  const fromFilename = classifyByFilenameHint(asset.originalFilename);
  // Try text signal
  const fromText = classifyByTextHints(accompanyingText);

  if (fromFilename && fromText && fromFilename === fromText) {
    // Both agree — high confidence, skip model
    return {
      result: makeResult(fromFilename, 0.88, "Shodný signál z názvu souboru i doprovodného textu.", true, true),
      skipModelCall: true,
    };
  }

  if (fromFilename && !fromText) {
    // Filename hint only — skip model for very specific patterns (cost optimization)
    return {
      result: makeResult(fromFilename, 0.75, "Signál z názvu souboru.", true, false),
      skipModelCall: true,
    };
  }

  if (fromText && !fromFilename) {
    // Text hint only — medium confidence
    return {
      result: makeResult(fromText, 0.70, "Signál z doprovodného textu poradce.", true, false),
      skipModelCall: false,
    };
  }

  if (fromFilename && fromText && fromFilename !== fromText) {
    // Conflicting signals — uncertain
    return {
      result: makeResult("mixed_or_uncertain_image", 0.40, "Konfliktní signály z názvu souboru a textu.", false, false),
      skipModelCall: false,
    };
  }

  // No deterministic signal — need model
  return null;
}

function makeResult(
  inputType: ImageInputType,
  confidence: number,
  rationale: string,
  needsDeepExtraction: boolean,
  safePreviewAlready: boolean,
): InputClassificationResult {
  return {
    inputType,
    subtype: null,
    confidence,
    containsText:
      inputType !== "general_unusable_image",
    likelyMessageThread: inputType === "screenshot_client_communication",
    likelyDocument: inputType === "photo_or_scan_document",
    likelyPayment: inputType === "screenshot_payment_details",
    likelyFinancialInfo:
      inputType === "screenshot_bank_or_finance_info" || inputType === "screenshot_payment_details",
    uncertaintyFlags: confidence < 0.7 ? ["low_confidence"] : [],
  };
}

// ---------------------------------------------------------------------------
// Layer 2: Light model call (cheap — text metadata only, no image upload)
// ---------------------------------------------------------------------------

function buildClassifierPrompt(
  asset: NormalizedImageAsset,
  accompanyingText: string | null,
  deterministicHint: InputClassificationResult | null,
): string {
  const lines: string[] = [
    "Jsi klasifikátor vstupů finančního poradce. Klasifikuj přiložený obrázek podle jeho metadat.",
    "",
    "Metadata obrázku:",
    `- MIME typ: ${asset.mimeType}`,
    `- Název souboru: ${asset.originalFilename ?? "(neznámý)"}`,
    `- Rozměry: ${asset.width ?? "?"} × ${asset.height ?? "?"} px`,
    `- Velikost: ${(asset.sizeBytes / 1024).toFixed(0)} KB`,
  ];

  if (accompanyingText?.trim()) {
    lines.push(`- Doprovodný text poradce: "${accompanyingText.trim().slice(0, 300)}"`);
  }

  if (deterministicHint) {
    lines.push(`- Předběžný odhad (deterministický): ${deterministicHint.inputType} (confidence ${deterministicHint.confidence.toFixed(2)})`);
  }

  lines.push(
    "",
    "Vrať JSON s těmito poli:",
    "- inputType: jeden z hodnot enum",
    "- confidence: 0.0–1.0",
    "- rationale: 1-2 věty",
    "- needsDeepExtraction: bool (je potřeba hlubší zpracování?)",
    "- safePreviewAlready: bool (lze hned ukázat bezpečný náhled?)",
    "",
    "Dostupné typy:",
    "screenshot_client_communication — WhatsApp, SMS, Messenger, e-mail od klienta",
    "photo_or_scan_document — fotka nebo scan dokumentu, formuláře, dopisu",
    "screenshot_payment_details — platební údaje, QR, IBAN, VS",
    "screenshot_bank_or_finance_info — bankovní dashboard, transakce, zůstatek",
    "supporting_reference_image — referenční podklad, orientační info, ceník",
    "general_unusable_image — nečitelné, nerelevantní, nepoužitelné",
    "mixed_or_uncertain_image — kombinace nebo nejasný vstup",
    "",
    "Při nejistotě preferuj mixed_or_uncertain_image. Nedomýšlej obsah, který z metadat nevyplývá.",
  );

  return lines.join("\n");
}

function fallbackClassification(): InputClassificationResult {
  return makeResult(
    "mixed_or_uncertain_image",
    0.0,
    "Klasifikace selhala nebo není dostupný model.",
    false,
    false,
  );
}

async function classifyWithModel(
  asset: NormalizedImageAsset,
  accompanyingText: string | null,
  deterministicHint: InputClassificationResult | null,
): Promise<InputClassificationResult> {
  const prompt = buildClassifierPrompt(asset, accompanyingText, deterministicHint);
  const config = getImageIntakeClassifierConfig();

  try {
    const result = await createResponseStructured<ClassifierModelOutput>(
      prompt,
      CLASSIFIER_JSON_SCHEMA as Record<string, unknown>,
      {
        model: config.model,
        store: false,
        routing: { category: config.routingCategory },
        schemaName: "image_classifier",
      },
    );

    const parsed = result.parsed;
    if (!IMAGE_INPUT_TYPES.includes(parsed.inputType)) {
      return fallbackClassification();
    }

    return {
      inputType: parsed.inputType,
      subtype: null,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      containsText: parsed.inputType !== "general_unusable_image",
      likelyMessageThread: parsed.inputType === "screenshot_client_communication",
      likelyDocument: parsed.inputType === "photo_or_scan_document",
      likelyPayment: parsed.inputType === "screenshot_payment_details",
      likelyFinancialInfo:
        parsed.inputType === "screenshot_bank_or_finance_info" ||
        parsed.inputType === "screenshot_payment_details",
      uncertaintyFlags: parsed.confidence < 0.6 ? ["low_confidence"] : [],
    };
  } catch {
    return fallbackClassification();
  }
}

// ---------------------------------------------------------------------------
// Main entry: cheap-first pipeline
// ---------------------------------------------------------------------------

export type ClassifierDecision = {
  result: InputClassificationResult;
  /** true when model was called, false for deterministic-only path */
  usedModel: boolean;
  /** Early exit: obvious dead end skipped model and deeper processing */
  earlyExit: boolean;
};

/**
 * Classify an image asset.
 * Cheap-first: deterministic first, model only if needed.
 * Never calls model for obvious unusable cases.
 */
export async function classifyImageInput(
  asset: NormalizedImageAsset,
  accompanyingText: string | null,
): Promise<ClassifierDecision> {
  // Layer 1: deterministic
  const det = classifyDeterministic(asset, accompanyingText);

  if (det?.skipModelCall) {
    const isDeadEnd = det.result.inputType === "general_unusable_image";
    return {
      result: det.result,
      usedModel: false,
      earlyExit: isDeadEnd,
    };
  }

  // Layer 2: model call (only if needed)
  const modelResult = await classifyWithModel(asset, accompanyingText, det?.result ?? null);

  // Merge: if deterministic had a strong filename hint and model agrees, boost confidence
  let finalResult = modelResult;
  if (det?.result && det.result.inputType === modelResult.inputType && det.result.confidence >= 0.65) {
    finalResult = {
      ...modelResult,
      confidence: Math.min(0.95, (det.result.confidence + modelResult.confidence) / 2 + 0.1),
    };
  }

  return { result: finalResult, usedModel: true, earlyExit: false };
}

/**
 * Classify a batch of assets.
 * Only classifies eligible (non-duplicate, non-rejected) assets.
 * Returns primary classification from the first eligible asset.
 * Phase 3 will add multi-image intelligence.
 */
export async function classifyBatch(
  assets: NormalizedImageAsset[],
  accompanyingText: string | null,
): Promise<ClassifierDecision> {
  const eligible = assets.filter((a) => a.sizeBytes > 0);
  if (eligible.length === 0) {
    return {
      result: makeResult("general_unusable_image", 1.0, "Žádné použitelné obrázky.", false, false),
      usedModel: false,
      earlyExit: true,
    };
  }

  // Phase 2: classify primary asset (first eligible)
  return classifyImageInput(eligible[0], accompanyingText);
}
