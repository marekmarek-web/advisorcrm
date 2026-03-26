/**
 * Input mode detection for contract pipeline.
 * Distinguishes text PDF, scanned PDF, image, and unsupported.
 */

import { z } from "zod";
import { createResponseWithFile } from "@/lib/openai";

export const INPUT_MODES = ["text_pdf", "scanned_pdf", "mixed_pdf", "image_document", "unsupported"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export const EXTRACTION_MODES = ["text", "ocr_enhanced", "vision_fallback"] as const;
export type ExtractionMode = (typeof EXTRACTION_MODES)[number];

export type InputModeResult = {
  inputMode: InputMode;
  confidence?: number;
  extractionMode: ExtractionMode;
  ocrRequired: boolean;
  pageCount?: number;
  qualityWarnings: string[];
  extractionWarnings: string[];
};

const responseSchema = z.object({
  inputMode: z.enum(INPUT_MODES),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  qualityIssues: z.array(z.string()).optional(),
});

const DETECTION_PROMPT = `Urči režim dokumentu. Výstup = jediný platný JSON, žádný markdown ani komentáře.

Hodnoty inputMode: text_pdf | scanned_pdf | mixed_pdf | image_document | unsupported

JSON: {"inputMode":"...","confidence":0-1,"reason":"krátký důvod cs","pageCount":N,"qualityIssues":["..."]}
Texty piš česky.`;

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

function resolveExtractionMode(inputMode: InputMode): ExtractionMode {
  switch (inputMode) {
    case "text_pdf":
      return "text";
    case "mixed_pdf":
      return "ocr_enhanced";
    case "scanned_pdf":
    case "image_document":
      return "vision_fallback";
    default:
      return "vision_fallback";
  }
}

function resolveOcrRequired(inputMode: InputMode): boolean {
  return inputMode === "scanned_pdf" || inputMode === "mixed_pdf" || inputMode === "image_document";
}

export async function detectInputMode(
  fileUrl: string,
  mimeType?: string | null
): Promise<InputModeResult> {
  const warnings: string[] = [];
  const qualityWarnings: string[] = [];
  if (mimeType && !ALLOWED_MIMES.has(mimeType)) {
    return {
      inputMode: "unsupported",
      extractionMode: "vision_fallback",
      ocrRequired: false,
      qualityWarnings: [],
      extractionWarnings: [`Nepodporovaný typ souboru: ${mimeType}`],
    };
  }

  try {
    const raw = await createResponseWithFile(fileUrl, DETECTION_PROMPT, {
      routing: { category: "ai_review" },
    });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    const parsed = JSON.parse(jsonStr) as unknown;
    const result = responseSchema.safeParse(parsed);
    if (!result.success) {
      warnings.push("Neplatná odpověď detekce režimu");
      return {
        inputMode: "unsupported",
        confidence: 0,
        extractionMode: "vision_fallback",
        ocrRequired: false,
        qualityWarnings: [],
        extractionWarnings: warnings,
      };
    }
    const { inputMode, confidence, reason, pageCount, qualityIssues } = result.data;
    const extractionMode = resolveExtractionMode(inputMode);
    const ocrRequired = resolveOcrRequired(inputMode);
    if (reason) warnings.push(reason);
    if (qualityIssues?.length) qualityWarnings.push(...qualityIssues);
    return {
      inputMode,
      confidence,
      extractionMode,
      ocrRequired,
      pageCount,
      qualityWarnings,
      extractionWarnings: warnings,
    };
  } catch {
    warnings.push("Detekce režimu selhala, použit vision fallback");
    return {
      inputMode: "unsupported",
      extractionMode: "vision_fallback",
      ocrRequired: false,
      qualityWarnings: [],
      extractionWarnings: warnings,
    };
  }
}
