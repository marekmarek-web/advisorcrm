/**
 * AI Review document classifier v2 — JSON output for routing matrix.
 */

import { z } from "zod";
import { createResponseFromPrompt, createResponseWithFile } from "@/lib/openai";
import { selectExcerptForExtraction } from "./extraction-schemas-by-type";
import { getAiReviewPromptId, getAiReviewPromptVersion } from "./prompt-model-registry";

export const aiClassifierOutputSchema = z.object({
  documentType: z.string(),
  productFamily: z.string(),
  productSubtype: z.string(),
  businessIntent: z.string(),
  recommendedRoute: z.string(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
  reasons: z.array(z.string()).optional(),
  documentTypeLabel: z.string().optional(),
  productFamilyLabel: z.string().optional(),
  productSubtypeLabel: z.string().optional(),
  businessIntentLabel: z.string().optional(),
  documentTypeUncertain: z.boolean().optional(),
});

export type AiClassifierOutput = z.infer<typeof aiClassifierOutputSchema>;

const CLASSIFIER_FILE_PROMPT = `Finanční dokument (ČR). Výstup = jediný platný JSON, žádný markdown, žádný text mimo JSON.

Povinná pole: documentType, productFamily, productSubtype, businessIntent, recommendedRoute (snake_case EN), confidence (0–1), warnings (krátké stringy, cs).
Volitelně: reasons, documentTypeLabel, productFamilyLabel, productSubtypeLabel, businessIntentLabel (cs), documentTypeUncertain (boolean).`;

function parseClassifierJson(raw: string): AiClassifierOutput {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  const parsed = JSON.parse(jsonStr) as unknown;
  return aiClassifierOutputSchema.parse(parsed);
}

export type RunAiReviewClassifierResult =
  | { ok: true; data: AiClassifierOutput; durationMs: number }
  | { ok: false; error: string; durationMs: number };

/**
 * Runs classifier: Prompt Builder when ID + enough text, otherwise file + inline JSON instruction.
 */
export async function runAiReviewClassifier(params: {
  fileUrl: string;
  mimeType?: string | null;
  documentTextExcerpt: string;
}): Promise<RunAiReviewClassifierResult> {
  const started = Date.now();
  const promptId = getAiReviewPromptId("docClassifierV2");
  const version = getAiReviewPromptVersion("docClassifierV2");
  const excerpt = params.documentTextExcerpt.trim();

  try {
    let raw: string;
    if (promptId && excerpt.length >= 500) {
      const res = await createResponseFromPrompt(
        {
          promptId,
          version,
          variables: {
            document_text: selectExcerptForExtraction(excerpt).text,
          },
        },
        { store: false, routing: { category: "ai_review" } }
      );
      if (!res.ok) {
        return { ok: false, error: res.error, durationMs: Date.now() - started };
      }
      raw = res.text;
    } else {
      const ocrCtx =
        promptId && excerpt.length > 0
          ? selectExcerptForExtraction(excerpt, { maxChars: 20_000 }).text
          : "";
      const instruction =
        promptId && excerpt.length > 0
          ? `${CLASSIFIER_FILE_PROMPT}\n\n--- Kontext z OCR/textu ---\n${ocrCtx}`
          : CLASSIFIER_FILE_PROMPT;
      raw = await createResponseWithFile(params.fileUrl, instruction, {
        store: false,
        routing: { category: "ai_review" },
      });
    }
    const data = parseClassifierJson(raw);
    return { ok: true, data, durationMs: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, durationMs: Date.now() - started };
  }
}
