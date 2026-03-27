/**
 * AI Review document classifier v2 — JSON output for routing matrix.
 */

import { z } from "zod";
import { createAiReviewResponseFromPrompt, createResponseWithFile } from "@/lib/openai";
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
  /** When false, pipeline should not run full structured contract extraction (manual / review path). */
  supportedForDirectExtraction: z.boolean().optional().default(true),
});

export type AiClassifierOutput = z.infer<typeof aiClassifierOutputSchema>;

const CLASSIFIER_FILE_PROMPT = `Finanční dokument (ČR). Výstup = jediný platný JSON, žádný markdown, žádný text mimo JSON.

Povinná pole: documentType, productFamily, productSubtype, businessIntent, recommendedRoute (snake_case EN), confidence (0–1), warnings (krátké stringy, cs).
Volitelně: reasons, documentTypeLabel, productFamilyLabel, productSubtypeLabel, businessIntentLabel (cs), documentTypeUncertain (boolean), supportedForDirectExtraction (boolean, default true — false když dokument není vhodný pro plnou automatickou extrakci).`;

function parseClassifierJson(raw: string): AiClassifierOutput {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  const parsed = JSON.parse(jsonStr) as unknown;
  return aiClassifierOutputSchema.parse(parsed);
}

export type RunAiReviewClassifierResult =
  | { ok: true; data: AiClassifierOutput; durationMs: number }
  | { ok: false; error: string; durationMs: number };

/** Prompt Builder doc classifier v2 — variable names must match the deployed prompt. */
export function buildDocClassifierPromptVariables(params: {
  documentTextExcerpt: string;
  filename?: string | null;
  pageCount?: number | null;
  inputMode?: string | null;
  adobeSignals?: string | null;
}): { variables: Record<string, string>; fallbacksApplied: string[] } {
  const fallbacksApplied: string[] = [];

  const fn = params.filename?.trim();
  const filename = fn && fn.length > 0 ? fn : (fallbacksApplied.push("filename"), "unknown");

  let pageNum = params.pageCount;
  if (typeof pageNum !== "number" || !Number.isFinite(pageNum) || pageNum < 1) {
    fallbacksApplied.push("page_count");
    pageNum = 1;
  }
  const page_count = String(Math.floor(pageNum));

  const im = params.inputMode?.trim();
  const input_mode = im && im.length > 0 ? im : (fallbacksApplied.push("input_mode"), "unknown");

  const excerpt = params.documentTextExcerpt.trim();
  let text_excerpt = excerpt.length > 0 ? selectExcerptForExtraction(excerpt).text : "";
  if (!text_excerpt.trim()) {
    fallbacksApplied.push("text_excerpt");
    text_excerpt = "(no excerpt)";
  }

  const ad = params.adobeSignals?.trim();
  const adobe_signals = ad && ad.length > 0 ? ad : (fallbacksApplied.push("adobe_signals"), "none");

  const source_channel = "ai_review";

  return {
    variables: {
      filename,
      page_count,
      input_mode,
      text_excerpt,
      adobe_signals,
      source_channel,
    },
    fallbacksApplied,
  };
}

function logClassifierPromptInputShape(payload: {
  text_excerpt_length: number;
  adobe_signals_length: number;
  filename_length: number;
  page_count: string;
  input_mode: string;
  source_channel: string;
  fallbacks_applied: string[];
}): void {
  console.info("[ai-review-classifier] prompt_input_shape", JSON.stringify(payload));
}

/**
 * Runs classifier: Prompt Builder when ID + enough text, otherwise file + inline JSON instruction.
 */
export async function runAiReviewClassifier(params: {
  fileUrl: string;
  mimeType?: string | null;
  documentTextExcerpt: string;
  filename?: string | null;
  pageCount?: number | null;
  inputMode?: string | null;
  adobeSignals?: string | null;
}): Promise<RunAiReviewClassifierResult> {
  const started = Date.now();
  const promptId = getAiReviewPromptId("docClassifierV2");
  const version = getAiReviewPromptVersion("docClassifierV2");
  const excerpt = params.documentTextExcerpt.trim();

  try {
    let raw: string;
    if (promptId && excerpt.length >= 500) {
      const { variables, fallbacksApplied } = buildDocClassifierPromptVariables({
        documentTextExcerpt: params.documentTextExcerpt,
        filename: params.filename,
        pageCount: params.pageCount,
        inputMode: params.inputMode,
        adobeSignals: params.adobeSignals,
      });
      logClassifierPromptInputShape({
        text_excerpt_length: variables.text_excerpt.length,
        adobe_signals_length: variables.adobe_signals.length,
        filename_length: variables.filename.length,
        page_count: variables.page_count,
        input_mode: variables.input_mode,
        source_channel: variables.source_channel,
        fallbacks_applied: fallbacksApplied,
      });
      const res = await createAiReviewResponseFromPrompt(
        {
          promptKey: "docClassifierV2",
          promptId,
          version,
          variables,
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
