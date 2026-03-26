/**
 * Single OpenAI pass for input-mode detection + document classification.
 * Saves one full file round-trip vs sequential detectInputMode + classifyContractDocument.
 */

import { z } from "zod";
import { createResponseWithFile } from "@/lib/openai";
import {
  INPUT_MODES,
  type InputModeResult,
  type ExtractionMode,
} from "./input-mode-detection";
import {
  type ClassificationResult,
  normalizeClassification,
} from "./document-classification";
import {
  DOCUMENT_INTENTS,
  DOCUMENT_LIFECYCLE_STATUSES,
  PRIMARY_DOCUMENT_TYPES,
} from "./document-review-types";

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const combinedSchema = z.object({
  inputMode: z.enum(INPUT_MODES),
  inputConfidence: z.number().min(0).max(1).optional(),
  inputReason: z.string().max(200).optional(),
  primaryType: z.enum(PRIMARY_DOCUMENT_TYPES),
  subtype: z.string().max(120).optional(),
  lifecycleStatus: z.enum(DOCUMENT_LIFECYCLE_STATUSES).optional(),
  documentIntent: z.enum(DOCUMENT_INTENTS).optional(),
  classificationConfidence: z.number().min(0).max(1),
  /** Max 3 short tags; omit if unsure (server derives lifecycle/intent from primaryType). */
  reasons: z.array(z.string().max(120)).max(3).optional(),
});

const COMBINED_PROMPT = `Prohlédni přiložený dokument. Výstup = jediný platný JSON objekt. Žádný markdown, žádný text mimo JSON, žádné odstavce vysvětlení.

Část A — inputMode (režim):
text_pdf | scanned_pdf | mixed_pdf | image_document | unsupported

Část B — rozcestník (jen routing, neextrahuj celá pole smlouvy):
- primaryType: přesně jedna z ${PRIMARY_DOCUMENT_TYPES.map((t) => `"${t}"`).join(", ")}
- subtype: krátký hint instituce/produktu nebo "unknown"
- classificationConfidence: 0–1
- Volitelně (jen pokud jsi jistý): lifecycleStatus z ${DOCUMENT_LIFECYCLE_STATUSES.map((t) => `"${t}"`).join(", ")}, documentIntent z ${DOCUMENT_INTENTS.map((t) => `"${t}"`).join(", ")}
- reasons: nejvýše 3 krátké české tagy (např. "hlavička Allianz"); jinak [] nebo vynech
- inputConfidence, inputReason (max věta)

Příklad tvaru:
{"inputMode":"text_pdf","inputConfidence":0.9,"primaryType":"life_insurance_contract","subtype":"unknown","classificationConfidence":0.85,"reasons":["smlouva životní"]}`;

function mimeBlockedResult(mimeType: string): {
  input: InputModeResult;
  classification: ClassificationResult;
} {
  return {
    input: {
      inputMode: "unsupported",
      extractionMode: "vision_fallback",
      ocrRequired: false,
      qualityWarnings: [],
      extractionWarnings: [`Nepodporovaný typ souboru: ${mimeType}`],
    },
    classification: {
      primaryType: "unsupported_or_unknown",
      subtype: "unknown",
      lifecycleStatus: "unknown",
      documentIntent: "manual_review_required",
      confidence: 0,
      reasons: ["Nepodporovaný MIME typ"],
    },
  };
}

/**
 * Returns both intake results in one model call, or `null` if the response should not be trusted (caller runs sequential fallback).
 */
export async function runCombinedContractIntake(
  fileUrl: string,
  mimeType?: string | null
): Promise<{ input: InputModeResult; classification: ClassificationResult } | null> {
  if (mimeType && !ALLOWED_MIMES.has(mimeType)) {
    return mimeBlockedResult(mimeType);
  }

  try {
    const raw = await createResponseWithFile(fileUrl, COMBINED_PROMPT, {
      routing: { category: "ai_review" },
    });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    let parsedUnknown: unknown;
    try {
      parsedUnknown = JSON.parse(jsonStr);
    } catch {
      return null;
    }
    const parsed = combinedSchema.safeParse(parsedUnknown);
    if (!parsed.success) {
      return null;
    }
    const d = parsed.data;
    const extractionMode: ExtractionMode =
      d.inputMode === "text_pdf" ? "text" : d.inputMode === "mixed_pdf" ? "ocr_enhanced" : "vision_fallback";
    const ocrRequired = d.inputMode === "scanned_pdf" || d.inputMode === "mixed_pdf" || d.inputMode === "image_document";
    const extractionWarnings: string[] = [];
    if (d.inputReason) extractionWarnings.push(d.inputReason);

    const input: InputModeResult = {
      inputMode: d.inputMode,
      confidence: d.inputConfidence,
      extractionMode,
      ocrRequired,
      qualityWarnings: [],
      extractionWarnings,
    };
    const classification: ClassificationResult = normalizeClassification({
      primaryType: d.primaryType,
      subtype: d.subtype,
      lifecycleStatus: d.lifecycleStatus,
      documentIntent: d.documentIntent,
      confidence: d.classificationConfidence,
      reasons: d.reasons?.length ? d.reasons : ["Klasifikace (kombinovaný krok)"],
    });
    return { input, classification };
  } catch {
    return null;
  }
}
