/**
 * AI Review LLM provider abstraction.
 *
 * OpenAI-only runtime provider for AI Review.
 * All other AI paths (AI assistant, CRM actions, copilot) are unaffected.
 *
 * Env variables:
 *   AI_REVIEW_DEBUG=true                        (pipeline + prompt + OpenAI call logs; see ai-review-debug.ts)
 *   AIDVISORA_DEBUG_AI_REVIEW=1|true            (umbrella: same flags as AI_REVIEW_DEBUG for console.info)
 */

import type { CreateResponseResult, OpenAICallRoutingOptions } from "@/lib/openai";
import {
  createResponse,
  createResponseSafe,
  createAiReviewResponseFromPrompt,
  createResponseWithFile,
  createResponseStructured,
  type CreateStructuredResponseResult,
} from "@/lib/openai";
import type { AiReviewPromptKey } from "./prompt-model-registry";
import { isAiReviewPipelineDebug } from "./ai-review-debug";

// ─── Provider resolution ─────────────────────────────────────────────────────

export type AiReviewProviderName = "openai";

export function getAiReviewProvider(): AiReviewProviderName {
  return "openai";
}

export function isAiReviewProviderDebug(): boolean {
  return isAiReviewPipelineDebug();
}

function logProviderCall(endpoint: string, provider: AiReviewProviderName): void {
  if (!isAiReviewPipelineDebug()) return;
  console.info("[review-llm-provider]", JSON.stringify({ endpoint, provider }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Replacement for `createResponse` with `routing.category === "ai_review"`.
 */
export async function aiReviewCreateResponse(
  input: string,
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions },
): Promise<string> {
  const provider = getAiReviewProvider();
  logProviderCall("createResponse", provider);
  return createResponse(input, { ...options, routing: { ...options?.routing, category: "ai_review" } });
}

/**
 * Replacement for `createResponseSafe` with ai_review routing.
 */
export async function aiReviewCreateResponseSafe(
  input: string,
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions },
): Promise<CreateResponseResult> {
  const provider = getAiReviewProvider();
  logProviderCall("createResponseSafe", provider);
  return createResponseSafe(input, { ...options, routing: { ...options?.routing, category: "ai_review" } });
}

/**
 * Replacement for `createAiReviewResponseFromPrompt`.
 */
export async function aiReviewCreateResponseFromPrompt(
  params: {
    promptKey: AiReviewPromptKey;
    promptId: string;
    version?: string | null;
    variables: Record<string, string>;
  },
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions },
): Promise<CreateResponseResult> {
  const provider = getAiReviewProvider();
  logProviderCall(`createAiReviewResponseFromPrompt.${params.promptKey}`, provider);
  return createAiReviewResponseFromPrompt(params, options);
}

/**
 * Replacement for `createResponseWithFile` with ai_review routing.
 */
export async function aiReviewCreateResponseWithFile(
  fileUrl: string,
  textPrompt: string,
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions },
): Promise<string> {
  const provider = getAiReviewProvider();
  logProviderCall("createResponseWithFile", provider);
  return createResponseWithFile(fileUrl, textPrompt, {
    ...options,
    routing: { ...options?.routing, category: "ai_review" },
  });
}

/**
 * Replacement for `createResponseStructured` with ai_review routing.
 */
export async function aiReviewCreateResponseStructured<T>(
  input: string,
  jsonSchema: Record<string, unknown>,
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions; schemaName?: string },
): Promise<CreateStructuredResponseResult<T>> {
  const provider = getAiReviewProvider();
  logProviderCall(`createResponseStructured.${options?.schemaName ?? ""}`, provider);
  return createResponseStructured<T>(input, jsonSchema, {
    ...options,
    routing: { ...options?.routing, category: "ai_review" },
  });
}

/**
 * Provider metadata for extraction trace (stored on every review run).
 */
export function getAiReviewProviderMeta(): {
  aiReviewProvider: AiReviewProviderName;
  aiReviewModel: string;
  aiReviewInputMode?: string;
  aiReviewInputSizeChars?: number;
} {
  const provider = getAiReviewProvider();
  const model = process.env.OPENAI_MODEL_AI_REVIEW_DEFAULT?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
  return { aiReviewProvider: provider, aiReviewModel: model };
}
