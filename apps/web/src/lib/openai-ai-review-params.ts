/**
 * AI Review–specific Responses API parameters (GPT-5 vs GPT-4.x).
 * Split from openai.ts so unit tests do not need to resolve @/ imports through the OpenAI client module.
 */

/** Low temperature for deterministic JSON-style outputs (AI Review, GPT-4.x on Responses API). */
const AI_REVIEW_TEMPERATURE = 0;

/** Default output cap for AI Review when using GPT-5 family (overridable per call via routing.maxOutputTokens). */
const AI_REVIEW_GPT5_DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

/**
 * True for GPT-5 Responses models that reject `temperature` (e.g. gpt-5.4-mini, gpt-5-mini).
 * GPT-4.x / gpt-4.1-mini stay false so we keep temperature: 0.
 */
export function isGpt5FamilyResponsesModel(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  return id.startsWith("gpt-5") || id.includes("gpt-5");
}

/**
 * Extra fields merged into `responses.create` for AI Review only.
 */
export function buildAiReviewResponsesCreateExtras(
  model: string,
  maxOutputTokens?: number
): Record<string, unknown> {
  if (isGpt5FamilyResponsesModel(model)) {
    let cap = AI_REVIEW_GPT5_DEFAULT_MAX_OUTPUT_TOKENS;
    if (typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
      cap = Math.floor(maxOutputTokens);
    }
    // Do NOT set text.verbosity — "low" would truncate JSON extraction output and cause
    // combined extraction to return empty/minimal envelopes with unsupported_or_unknown.
    return {
      reasoning: { effort: "none" },
      max_output_tokens: cap,
    };
  }
  return { temperature: AI_REVIEW_TEMPERATURE };
}
