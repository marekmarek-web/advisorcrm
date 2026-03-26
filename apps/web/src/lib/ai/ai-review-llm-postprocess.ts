/**
 * Optional LLM steps: review decision and client match (Prompt Builder).
 * Disabled by default — enable with AI_REVIEW_LLM_POSTPROCESS=true.
 */

import { createResponseFromPrompt } from "@/lib/openai";

export function isAiReviewLlmPostprocessEnabled(): boolean {
  return process.env.AI_REVIEW_LLM_POSTPROCESS === "true";
}
import { getAiReviewPromptId, getAiReviewPromptVersion } from "./prompt-model-registry";

export async function runAiReviewDecisionLlm(params: {
  classificationJson: string;
  extractionSummaryJson: string;
  validationSummaryJson: string;
}): Promise<{ ok: true; text: string; durationMs: number } | { ok: false; durationMs: number }> {
  const started = Date.now();
  const promptId = getAiReviewPromptId("reviewDecision");
  if (!promptId) return { ok: false, durationMs: Date.now() - started };
  const res = await createResponseFromPrompt(
    {
      promptId,
      version: getAiReviewPromptVersion("reviewDecision"),
      variables: {
        classification_json: params.classificationJson,
        extraction_summary_json: params.extractionSummaryJson,
        validation_summary_json: params.validationSummaryJson,
      },
    },
    { store: false, routing: { category: "ai_review" } }
  );
  const durationMs = Date.now() - started;
  if (!res.ok) return { ok: false, durationMs };
  return { ok: true, text: res.text, durationMs };
}

export async function runAiReviewClientMatchLlm(params: {
  extractionPartiesJson: string;
  dbCandidatesJson: string;
}): Promise<{ ok: true; text: string; durationMs: number } | { ok: false; durationMs: number }> {
  const started = Date.now();
  const promptId = getAiReviewPromptId("clientMatch");
  if (!promptId) return { ok: false, durationMs: Date.now() - started };
  const res = await createResponseFromPrompt(
    {
      promptId,
      version: getAiReviewPromptVersion("clientMatch"),
      variables: {
        extraction_parties_json: params.extractionPartiesJson,
        db_candidates_json: params.dbCandidatesJson,
      },
    },
    { store: false, routing: { category: "ai_review" } }
  );
  const durationMs = Date.now() - started;
  if (!res.ok) return { ok: false, durationMs };
  return { ok: true, text: res.text, durationMs };
}
