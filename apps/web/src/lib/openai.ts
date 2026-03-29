import OpenAI from "openai";
import { withOpenAIRateLimitRetry } from "@/lib/openai-rate-limit";
import { buildAiReviewResponsesCreateExtras } from "./openai-ai-review-params";
import {
  coerceNonEmptyAiReviewVariables,
  findMissingAiReviewPromptVariables,
} from "./ai/ai-review-prompt-variables";
import type { AiReviewPromptKey } from "./ai/prompt-model-registry";

const defaultModel = "gpt-5-mini";
const fallbackModel = "gpt-4o-mini";

type ResponsesCreateBody = {
  model: string;
  input?: unknown;
  prompt?: unknown;
  store: boolean;
  temperature?: number;
  reasoning?: { effort: string };
  text?: { verbosity: string };
  max_output_tokens?: number;
};

/** Model routing for copilot vs AI Review (env overrides). */
export type OpenAIModelRoutingCategory = "default" | "copilot" | "ai_review";

export type OpenAICallRoutingOptions = {
  category?: OpenAIModelRoutingCategory;
  /** When category is `ai_review` and the resolved model is GPT-5 family, caps generated tokens. */
  maxOutputTokens?: number;
};

export { isGpt5FamilyResponsesModel, buildAiReviewResponsesCreateExtras } from "./openai-ai-review-params";

function aiReviewResponsesAugmentation(
  routing: OpenAICallRoutingOptions | undefined,
  resolvedModel: string
): Record<string, unknown> {
  if (routing?.category !== "ai_review") return {};
  return buildAiReviewResponsesCreateExtras(resolvedModel, routing.maxOutputTokens);
}

/**
 * Resolves model: explicit options.model wins, then category-specific env, then OPENAI_MODEL, then default.
 */
export function resolveOpenAIModel(options?: {
  explicit?: string | null;
  category?: OpenAIModelRoutingCategory;
}): string {
  const ex = options?.explicit?.trim();
  if (ex) return ex;
  const fallback = process.env.OPENAI_MODEL?.trim() || defaultModel;
  const cat = options?.category ?? "default";
  if (cat === "copilot") {
    return process.env.OPENAI_MODEL_COPILOT_DEFAULT?.trim() || fallback;
  }
  if (cat === "ai_review") {
    return (
      process.env.OPENAI_MODEL_AI_REVIEW_DEFAULT?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      defaultModel
    );
  }
  return fallback;
}

let clientInstance: OpenAI | null = null;

/** Lazy singleton. Never expose API key. */
function getClient(): OpenAI | null {
  if (clientInstance) return clientInstance;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  clientInstance = new OpenAI({ apiKey });
  return clientInstance;
}

function isModelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return (
    code === "invalid_request_error" ||
    message.includes("model") ||
    message.includes("not found")
  );
}

export type CreateResponseSuccess = { ok: true; text: string };
export type CreateResponseError = { ok: false; error: string; code?: string };
export type CreateResponseResult = CreateResponseSuccess | CreateResponseError;

/** Server-only logging. Never log API key or full document content. */
export function logOpenAICall(params: {
  endpoint: string;
  model: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}): void {
  console.log("[OpenAI]", {
    endpoint: params.endpoint,
    model: params.model,
    latencyMs: params.latencyMs,
    success: params.success,
    ...(params.error ? { error: params.error } : {}),
  });
}

/**
 * Create a text response using the OpenAI Responses API (e.g. gpt-5-mini).
 * Uses OPENAI_API_KEY and optionally OPENAI_MODEL from env.
 * Falls back to gpt-4o-mini if the primary model is not available.
 * Server-side only. Returns plain text or throws.
 */
export async function createResponse(
  input: string,
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions }
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error(
      "OPENAI_API_KEY není nastaven. Nastavte ho v Nastavení nebo v .env."
    );
  }

  const primaryModel = resolveOpenAIModel({
    explicit: options?.model,
    category: options?.routing?.category,
  });
  const store = options?.store ?? false;
  const start = Date.now();

  let response: Awaited<ReturnType<OpenAI["responses"]["create"]>>;
  let usedModel = primaryModel;
  try {
    const createBody: ResponsesCreateBody = {
      model: primaryModel,
      input,
      store,
      ...aiReviewResponsesAugmentation(options?.routing, primaryModel),
    };
    response = await withOpenAIRateLimitRetry(
      () => client.responses.create(createBody as Parameters<OpenAI["responses"]["create"]>[0]),
      { label: "responses.create", maxAttempts: 6 }
    );
  } catch (err) {
    if (isModelError(err) && primaryModel !== fallbackModel) {
      const fallbackBody: ResponsesCreateBody = {
        model: fallbackModel,
        input,
        store,
        ...aiReviewResponsesAugmentation(options?.routing, fallbackModel),
      };
      response = await withOpenAIRateLimitRetry(
        () => client.responses.create(fallbackBody as Parameters<OpenAI["responses"]["create"]>[0]),
        { label: "responses.create(fallback_model)", maxAttempts: 6 }
      );
      usedModel = fallbackModel;
    } else {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      logOpenAICall({
        endpoint: "responses.create",
        model: primaryModel,
        latencyMs,
        success: false,
        error: message,
      });
      throw err instanceof Error ? err : new Error(message, { cause: code });
    }
  }

  const latencyMs = Date.now() - start;
  logOpenAICall({
    endpoint: "responses.create",
    model: usedModel,
    latencyMs,
    success: true,
  });

  const text = (response as { output_text?: string }).output_text;
  if (typeof text === "string" && text.trim()) return text.trim();

  const output = (response as { output?: unknown[] }).output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      const msg = item as { content?: Array<{ type?: string; text?: string }> };
      if (Array.isArray(msg?.content)) {
        for (const block of msg.content) {
          if (block?.type === "output_text" && typeof block.text === "string") {
            parts.push(block.text);
          }
        }
      }
    }
    if (parts.length) return parts.join("\n").trim();
  }

  throw new Error("Prázdná odpověď od OpenAI.");
}

/**
 * Same as createResponse but returns a typed result instead of throwing.
 * Useful when you want to handle errors without try/catch.
 */
export async function createResponseSafe(
  input: string,
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions }
): Promise<CreateResponseResult> {
  try {
    const text = await createResponse(input, options);
    return { ok: true, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    return { ok: false, error: message, code };
  }
}

/** Extract text from Responses API response (shared by createResponse and createResponseFromPrompt). */
function extractResponseText(response: {
  output_text?: string;
  output?: unknown[];
}): string {
  const text = response.output_text;
  if (typeof text === "string" && text.trim()) return text.trim();
  const output = response.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      const msg = item as { content?: Array<{ type?: string; text?: string }> };
      if (Array.isArray(msg?.content)) {
        for (const block of msg.content) {
          if (block?.type === "output_text" && typeof block.text === "string") {
            parts.push(block.text);
          }
        }
      }
    }
    if (parts.length) return parts.join("\n").trim();
  }
  throw new Error("Prázdná odpověď od OpenAI.");
}

/**
 * Create a response using OpenAI Prompt Builder prompt (id + variables).
 * Server-side only. Uses OPENAI_API_KEY and optionally OPENAI_MODEL from env.
 */
export async function createResponseFromPrompt(
  params: {
    promptId: string;
    version?: string | null;
    variables: Record<string, string>;
  },
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions }
): Promise<CreateResponseResult> {
  const client = getClient();
  if (!client) {
    return {
      ok: false,
      error: "OPENAI_API_KEY není nastaven. Nastavte ho v Nastavení nebo v .env.",
    };
  }
  const trimmedId = params.promptId?.trim();
  if (!trimmedId) {
    return { ok: false, error: "Prompt ID chybí." };
  }

  const primaryModel = resolveOpenAIModel({
    explicit: options?.model,
    category: options?.routing?.category,
  });
  const store = options?.store ?? false;
  const start = Date.now();

  const sanitizedVariables: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.variables)) {
    if (typeof v !== "string") continue;
    sanitizedVariables[k] = v;
  }

  const promptPayload: { id: string; version?: string; variables: Record<string, string> } = {
    id: trimmedId,
    variables: sanitizedVariables,
  };
  if (params.version?.trim()) {
    promptPayload.version = params.version.trim();
  }

  try {
    const promptBody: ResponsesCreateBody = {
      model: primaryModel,
      prompt: promptPayload as Parameters<OpenAI["responses"]["create"]>[0]["prompt"],
      store,
      ...aiReviewResponsesAugmentation(options?.routing, primaryModel),
    };
    const response = await client.responses.create(
      promptBody as Parameters<OpenAI["responses"]["create"]>[0]
    );
    const latencyMs = Date.now() - start;
    logOpenAICall({
      endpoint: "responses.create_prompt",
      model: primaryModel,
      latencyMs,
      success: true,
    });
    const text = extractResponseText(response as { output_text?: string; output?: unknown[] });
    return { ok: true, text };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    logOpenAICall({
      endpoint: "responses.create_prompt",
      model: primaryModel,
      latencyMs,
      success: false,
      error: message,
    });
    return { ok: false, error: message, code: (err as { code?: string })?.code };
  }
}

/** Centralized AI Review Prompt Builder step log (no variable values / PII). */
export function logAiReviewPromptStep(payload: {
  promptKey: AiReviewPromptKey;
  phase: "preflight" | "complete";
  ok: boolean;
  missing?: string[];
  variableKeys: string[];
  durationMs?: number;
  openaiError?: string;
}): void {
  console.info(
    "[ai-review-prompt]",
    JSON.stringify({
      promptKey: payload.promptKey,
      phase: payload.phase,
      ok: payload.ok,
      ...(payload.missing?.length ? { missing: payload.missing } : {}),
      variableKeys: payload.variableKeys,
      ...(typeof payload.durationMs === "number" ? { durationMs: payload.durationMs } : {}),
      ...(payload.openaiError ? { openaiError: payload.openaiError.slice(0, 200) } : {}),
    })
  );
}

/**
 * Prompt Builder call for AI Review with required-variable validation (avoids OpenAI 400 missing vars).
 */
export async function createAiReviewResponseFromPrompt(
  params: {
    promptKey: AiReviewPromptKey;
    promptId: string;
    version?: string | null;
    variables: Record<string, string>;
  },
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions }
): Promise<CreateResponseResult> {
  const started = Date.now();
  const variables = coerceNonEmptyAiReviewVariables(params.promptKey, params.variables);
  const keys = Object.keys(variables);
  const missing = findMissingAiReviewPromptVariables(params.promptKey, variables);
  logAiReviewPromptStep({
    promptKey: params.promptKey,
    phase: "preflight",
    ok: missing.length === 0,
    ...(missing.length ? { missing } : {}),
    variableKeys: keys,
  });
  if (missing.length) {
    return {
      ok: false,
      error: `MISSING_PROMPT_VARS:${params.promptKey}:${missing.join(",")}`,
    };
  }
  const res = await createResponseFromPrompt(
    {
      promptId: params.promptId,
      version: params.version,
      variables,
    },
    options
  );
  logAiReviewPromptStep({
    promptKey: params.promptKey,
    phase: "complete",
    ok: res.ok,
    variableKeys: keys,
    durationMs: Date.now() - started,
    ...(!res.ok ? { openaiError: res.error } : {}),
  });
  return res;
}

/**
 * Create a response with a file (e.g. PDF) and optional text prompt.
 * Uses input_file with file_url. Server-side only.
 */
export async function createResponseWithFile(
  fileUrl: string,
  textPrompt: string,
  options?: { model?: string; store?: boolean; routing?: OpenAICallRoutingOptions }
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error(
      "OPENAI_API_KEY není nastaven. Nastavte ho v Nastavení nebo v .env."
    );
  }

  const primaryModel = resolveOpenAIModel({
    explicit: options?.model,
    category: options?.routing?.category,
  });
  const store = options?.store ?? false;
  const start = Date.now();

  const input = [
    {
      role: "user" as const,
      content: [
        { type: "input_file" as const, file_url: fileUrl },
        { type: "input_text" as const, text: textPrompt },
      ],
    },
  ];

  let response: Awaited<ReturnType<OpenAI["responses"]["create"]>>;
  let usedModel = primaryModel;
  try {
    const fileBody: ResponsesCreateBody = {
      model: primaryModel,
      input,
      store,
      ...aiReviewResponsesAugmentation(options?.routing, primaryModel),
    };
    response = await withOpenAIRateLimitRetry(
      () => client.responses.create(fileBody as Parameters<OpenAI["responses"]["create"]>[0]),
      { label: "responses.create_with_file", maxAttempts: 6 }
    );
  } catch (err) {
    if (isModelError(err) && primaryModel !== fallbackModel) {
      const fileFallbackBody: ResponsesCreateBody = {
        model: fallbackModel,
        input,
        store,
        ...aiReviewResponsesAugmentation(options?.routing, fallbackModel),
      };
      response = await withOpenAIRateLimitRetry(
        () => client.responses.create(fileFallbackBody as Parameters<OpenAI["responses"]["create"]>[0]),
        { label: "responses.create_with_file(fallback_model)", maxAttempts: 6 }
      );
      usedModel = fallbackModel;
    } else {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      logOpenAICall({
        endpoint: "responses.create_with_file",
        model: primaryModel,
        latencyMs,
        success: false,
        error: message,
      });
      throw err instanceof Error ? err : new Error(message);
    }
  }

  const latencyMs = Date.now() - start;
  logOpenAICall({
    endpoint: "responses.create_with_file",
    model: usedModel,
    latencyMs,
    success: true,
  });

  const text = (response as { output_text?: string }).output_text;
  if (typeof text === "string" && text.trim()) return text.trim();

  const output = (response as { output?: unknown[] }).output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      const msg = item as { content?: Array<{ type?: string; text?: string }> };
      if (Array.isArray(msg?.content)) {
        for (const block of msg.content) {
          if (block?.type === "output_text" && typeof block.text === "string") {
            parts.push(block.text);
          }
        }
      }
    }
    if (parts.length) return parts.join("\n").trim();
  }

  throw new Error("Prázdná odpověď od OpenAI.");
}

export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export { defaultModel, fallbackModel };
