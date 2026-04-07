/**
 * Opt-in verbose logging for AI Review pipeline, UI mappers, and related OpenAI helpers.
 *
 * Flags (see `.env.example`):
 *   AI_REVIEW_DEBUG=true
 *   AI_REVIEW_DEBUG_LOG=1          (alias — same effect as AI_REVIEW_DEBUG for opt-in pipeline console)
 *   AI_REVIEW_PROVIDER_DEBUG=true  (see review-llm-provider.ts)
 *   AIDVISORA_DEBUG_AI_REVIEW=1    (alias / umbrella for review-related console.info)
 */

function envTruthy(name: string): boolean {
  const v = process.env[name];
  return v === "1" || v === "true";
}

export function isAiReviewPipelineDebug(): boolean {
  return (
    process.env.AI_REVIEW_DEBUG === "true" ||
    envTruthy("AI_REVIEW_DEBUG_LOG") ||
    process.env.AI_REVIEW_PROVIDER_DEBUG === "true" ||
    envTruthy("AIDVISORA_DEBUG_AI_REVIEW")
  );
}

/**
 * Local Next dev or explicit debug flags — never in production.
 * Use for non-hot-path console.info (classifier shape, contract pipeline events, etc.).
 */
export function isAiReviewDevOrDebugFlags(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NODE_ENV === "development" || isAiReviewPipelineDebug();
}
