/**
 * Optional LLM steps: review decision, client match, advisor document summary (Prompt Builder).
 * Review decision / client match: enable with AI_REVIEW_LLM_POSTPROCESS=true.
 * Advisor summary: runs when OPENAI_PROMPT_AI_REVIEW_DOCUMENT_SUMMARY_FOR_ADVISOR_ID is set.
 */

import { createAiReviewResponseFromPrompt } from "@/lib/openai";
import { capAiReviewPromptString } from "./ai-review-prompt-variables";
import { getAiReviewPromptId, getAiReviewPromptVersion } from "./prompt-model-registry";

export type { AiReviewClientMatchKind } from "./ai-review-client-match-parse";
export { parseAiReviewClientMatchKind } from "./ai-review-client-match-parse";

export function isAiReviewLlmPostprocessEnabled(): boolean {
  return process.env.AI_REVIEW_LLM_POSTPROCESS === "true";
}

export async function runAiReviewDecisionLlm(params: {
  normalizedDocumentType: string;
  extractionPayloadJson: string;
  validationWarningsJson: string;
  sectionConfidenceSummaryJson: string;
  inputMode: string;
  preprocessWarningsJson: string;
}): Promise<{ ok: true; text: string; durationMs: number } | { ok: false; durationMs: number }> {
  const started = Date.now();
  const promptId = getAiReviewPromptId("reviewDecision");
  if (!promptId) return { ok: false, durationMs: Date.now() - started };
  const conf = capAiReviewPromptString(params.sectionConfidenceSummaryJson.trim() || "{}");
  const res = await createAiReviewResponseFromPrompt(
    {
      promptKey: "reviewDecision",
      promptId,
      version: getAiReviewPromptVersion("reviewDecision"),
      variables: {
        normalized_document_type: params.normalizedDocumentType.trim() || "unknown",
        extraction_payload: capAiReviewPromptString(params.extractionPayloadJson),
        validation_warnings: params.validationWarningsJson.trim() || "[]",
        section_confidence: conf,
        section_confidence_summary: conf,
        input_mode: params.inputMode.trim() || "unknown",
        preprocess_warnings: params.preprocessWarningsJson.trim() || "[]",
      },
    },
    { store: false, routing: { category: "ai_review", maxOutputTokens: 6144 } }
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
  const parties = capAiReviewPromptString(params.extractionPartiesJson);
  const dbs = capAiReviewPromptString(params.dbCandidatesJson);
  const res = await createAiReviewResponseFromPrompt(
    {
      promptKey: "clientMatch",
      promptId,
      version: getAiReviewPromptVersion("clientMatch"),
      variables: {
        extracted_client_payload: parties,
        existing_client_candidates: dbs,
        extraction_parties_json: parties,
        db_candidates_json: dbs,
      },
    },
    { store: false, routing: { category: "ai_review", maxOutputTokens: 6144 } }
  );
  const durationMs = Date.now() - started;
  if (!res.ok) return { ok: false, durationMs };
  return { ok: true, text: res.text, durationMs };
}

/**
 * Narrative advisor summary from extraction + review state + client match (Prompt Builder).
 * Runs only when `OPENAI_PROMPT_AI_REVIEW_DOCUMENT_SUMMARY_FOR_ADVISOR_ID` is set.
 */
export async function runAdvisorDocumentSummaryForAdvisorLlm(params: {
  documentSummaryPayloadJson: string;
  reviewDecisionPayloadJson: string;
  clientMatchPayloadJson: string;
}): Promise<{ ok: true; text: string; durationMs: number } | { ok: false; durationMs: number; error?: string }> {
  const started = Date.now();
  const promptId = getAiReviewPromptId("documentSummaryForAdvisor");
  if (!promptId) return { ok: false, durationMs: Date.now() - started };
  const document_summary_payload = capAiReviewPromptString(params.documentSummaryPayloadJson);
  const review_decision_payload = capAiReviewPromptString(params.reviewDecisionPayloadJson);
  const client_match_payload = capAiReviewPromptString(params.clientMatchPayloadJson);
  const res = await createAiReviewResponseFromPrompt(
    {
      promptKey: "documentSummaryForAdvisor",
      promptId,
      version: getAiReviewPromptVersion("documentSummaryForAdvisor"),
      variables: {
        document_summary_payload,
        review_decision_payload,
        client_match_payload,
      },
    },
    { store: false, routing: { category: "ai_review", maxOutputTokens: 8192 } }
  );
  const durationMs = Date.now() - started;
  if (!res.ok) return { ok: false, durationMs, error: res.error };
  return { ok: true, text: res.text, durationMs };
}
