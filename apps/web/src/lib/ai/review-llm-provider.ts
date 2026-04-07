/**
 * AI Review LLM provider abstraction.
 *
 * Reads AI_REVIEW_PROVIDER=openai|anthropic and routes calls to the correct backend.
 * All other AI paths (AI assistant, CRM actions, copilot) are unaffected.
 *
 * Env variables:
 *   AI_REVIEW_PROVIDER=openai|anthropic        (default: openai)
 *   AI_REVIEW_PROVIDER_FALLBACK_TO_OPENAI=true  (default: false — fail hard in benchmark)
 *   AI_REVIEW_PROVIDER_DEBUG=true               (default: false — rolled into ai-review-debug.ts)
 *   AI_REVIEW_DEBUG=true                        (pipeline + prompt + OpenAI call logs; see ai-review-debug.ts)
 *   AIDVISORA_DEBUG_AI_REVIEW=1|true            (umbrella: same flags as AI_REVIEW_DEBUG for console.info)
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   ANTHROPIC_MODEL=claude-sonnet-4-20250514
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
import {
  anthropicCreateResponse,
  anthropicCreateResponseSafe,
  anthropicCreateAiReviewResponseFromPrompt,
  anthropicCreateResponseWithFile,
  anthropicCreateResponseStructured,
  hasAnthropicKey,
  resolveAnthropicModel,
  getLastAnthropicCallMeta,
} from "./anthropic-review-adapter";
import { isAiReviewPipelineDebug } from "./ai-review-debug";

// ─── Provider resolution ─────────────────────────────────────────────────────

export type AiReviewProviderName = "openai" | "anthropic";

export function getAiReviewProvider(): AiReviewProviderName {
  const raw = process.env.AI_REVIEW_PROVIDER?.trim().toLowerCase();
  if (raw === "anthropic") return "anthropic";
  return "openai";
}

export function isAiReviewProviderDebug(): boolean {
  return isAiReviewPipelineDebug();
}

function isFallbackToOpenAIEnabled(): boolean {
  return process.env.AI_REVIEW_PROVIDER_FALLBACK_TO_OPENAI === "true";
}

function logProviderCall(endpoint: string, provider: AiReviewProviderName): void {
  if (!isAiReviewPipelineDebug()) return;
  console.info("[review-llm-provider]", JSON.stringify({ endpoint, provider }));
}

// ─── Fallback wrapper ─────────────────────────────────────────────────────────

async function withOptionalOpenAIFallback<T>(
  fn: () => Promise<T>,
  openAIFallback: () => Promise<T>,
  endpointLabel: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isFallbackToOpenAIEnabled()) {
      console.warn(
        `[review-llm-provider] Anthropic failed at ${endpointLabel}, falling back to OpenAI`,
        err instanceof Error ? err.message : String(err),
      );
      return openAIFallback();
    }
    throw err;
  }
}

async function withOptionalOpenAIFallbackSafe(
  fn: () => Promise<CreateResponseResult>,
  openAIFallback: () => Promise<CreateResponseResult>,
  endpointLabel: string,
): Promise<CreateResponseResult> {
  const result = await fn().catch((err): CreateResponseResult => ({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  }));
  if (!result.ok && isFallbackToOpenAIEnabled()) {
    console.warn(
      `[review-llm-provider] Anthropic returned error at ${endpointLabel}, falling back to OpenAI:`,
      result.error,
    );
    return openAIFallback();
  }
  return result;
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

  if (provider === "anthropic") {
    if (!hasAnthropicKey()) {
      if (isFallbackToOpenAIEnabled()) {
        console.warn("[review-llm-provider] No ANTHROPIC_API_KEY, falling back to OpenAI");
        return createResponse(input, options);
      }
      throw new Error("ANTHROPIC_API_KEY není nastaven a AI_REVIEW_PROVIDER=anthropic.");
    }
    return withOptionalOpenAIFallback(
      () => anthropicCreateResponse(input),
      () => createResponse(input, options),
      "createResponse",
    );
  }

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

  if (provider === "anthropic") {
    if (!hasAnthropicKey()) {
      if (isFallbackToOpenAIEnabled()) return createResponseSafe(input, options);
      return { ok: false, error: "ANTHROPIC_API_KEY není nastaven a AI_REVIEW_PROVIDER=anthropic." };
    }
    return withOptionalOpenAIFallbackSafe(
      () => anthropicCreateResponseSafe(input),
      () => createResponseSafe(input, options),
      "createResponseSafe",
    );
  }

  return createResponseSafe(input, { ...options, routing: { ...options?.routing, category: "ai_review" } });
}

/**
 * Replacement for `createAiReviewResponseFromPrompt`.
 * On Anthropic path, renders the local template and calls Claude.
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

  if (provider === "anthropic") {
    if (!hasAnthropicKey()) {
      if (isFallbackToOpenAIEnabled()) return createAiReviewResponseFromPrompt(params, options);
      return { ok: false, error: "ANTHROPIC_API_KEY není nastaven a AI_REVIEW_PROVIDER=anthropic." };
    }
    return withOptionalOpenAIFallbackSafe(
      () => anthropicCreateAiReviewResponseFromPrompt(params),
      () => createAiReviewResponseFromPrompt(params, options),
      `promptKey.${params.promptKey}`,
    );
  }

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

  if (provider === "anthropic") {
    if (!hasAnthropicKey()) {
      if (isFallbackToOpenAIEnabled()) return createResponseWithFile(fileUrl, textPrompt, options);
      throw new Error("ANTHROPIC_API_KEY není nastaven a AI_REVIEW_PROVIDER=anthropic.");
    }
    return withOptionalOpenAIFallback(
      () => anthropicCreateResponseWithFile(fileUrl, textPrompt),
      () => createResponseWithFile(fileUrl, textPrompt, options),
      "createResponseWithFile",
    );
  }

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

  if (provider === "anthropic") {
    if (!hasAnthropicKey()) {
      if (isFallbackToOpenAIEnabled()) return createResponseStructured<T>(input, jsonSchema, options);
      throw new Error("ANTHROPIC_API_KEY není nastaven a AI_REVIEW_PROVIDER=anthropic.");
    }
    return withOptionalOpenAIFallback(
      () => anthropicCreateResponseStructured<T>(input, jsonSchema, { schemaName: options?.schemaName }),
      () => createResponseStructured<T>(input, jsonSchema, options),
      `createResponseStructured.${options?.schemaName ?? ""}`,
    );
  }

  return createResponseStructured<T>(input, jsonSchema, {
    ...options,
    routing: { ...options?.routing, category: "ai_review" },
  });
}

/**
 * Provider metadata for extraction trace (stored on every review run).
 * For Anthropic path, also returns last call's input mode and size from adapter module state.
 */
export function getAiReviewProviderMeta(): {
  aiReviewProvider: AiReviewProviderName;
  aiReviewModel: string;
  aiReviewInputMode?: string;
  aiReviewInputSizeChars?: number;
} {
  const provider = getAiReviewProvider();
  const model =
    provider === "anthropic"
      ? resolveAnthropicModel()
      : (process.env.OPENAI_MODEL_AI_REVIEW_DEFAULT?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5-mini");

  if (provider === "anthropic") {
    const lastMeta = getLastAnthropicCallMeta();
    return {
      aiReviewProvider: provider,
      aiReviewModel: model,
      ...(lastMeta.inputMode !== "none" ? { aiReviewInputMode: lastMeta.inputMode } : {}),
      ...(lastMeta.inputSizeChars > 0 ? { aiReviewInputSizeChars: lastMeta.inputSizeChars } : {}),
    };
  }

  return { aiReviewProvider: provider, aiReviewModel: model };
}
