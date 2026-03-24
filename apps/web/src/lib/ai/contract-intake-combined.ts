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
  inputReason: z.string().optional(),
  primaryType: z.enum(PRIMARY_DOCUMENT_TYPES),
  subtype: z.string().optional(),
  lifecycleStatus: z.enum(DOCUMENT_LIFECYCLE_STATUSES).optional(),
  documentIntent: z.enum(DOCUMENT_INTENTS).optional(),
  classificationConfidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});

const COMBINED_PROMPT = `Prohlédni přiložený dokument a vrať JEDINĚ platný JSON objekt (žádný markdown, žádný úvod).

Část A — režim dokumentu (inputMode):
- text_pdf: PDF s výběrovým textem (textová vrstva)
- scanned_pdf: naskenované PDF (stránky jako obrázky)
- mixed_pdf: PDF obsahující kombinaci textu a obrázků/scanů
- image_document: obrázek (JPG/PNG/HEIC apod.)
- unsupported: nelze určit nebo nepodporovaný formát

Část B — klasifikace dokumentu:
- primaryType: jedna z hodnot ${PRIMARY_DOCUMENT_TYPES.map((t) => `"${t}"`).join(", ")}
- subtype: krátký produkt/instituce hint (např. "generali_bel_mondo"), jinak "unknown"
- lifecycleStatus: jedna z hodnot ${DOCUMENT_LIFECYCLE_STATUSES.map((t) => `"${t}"`).join(", ")}
- documentIntent: jedna z hodnot ${DOCUMENT_INTENTS.map((t) => `"${t}"`).join(", ")}

JSON tvar:
{
  "inputMode": "...",
  "inputConfidence": 0-1,
  "inputReason": "krátký důvod pro režim",
  "primaryType": "...",
  "subtype": "...",
  "lifecycleStatus": "...",
  "documentIntent": "...",
  "classificationConfidence": 0-1,
  "reasons": ["krátké důvody pro typ dokumentu"]
}`;

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
    const raw = await createResponseWithFile(fileUrl, COMBINED_PROMPT);
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
      reasons: d.reasons.length ? d.reasons : ["Klasifikace z kombinovaného kroku"],
    });
    return { input, classification };
  } catch {
    return null;
  }
}
