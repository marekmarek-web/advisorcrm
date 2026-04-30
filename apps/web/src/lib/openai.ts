import OpenAI from "openai";
import { withOpenAIRateLimitRetry } from "@/lib/openai-rate-limit";
import {
  clipForLangfuse,
  OpenAiResponsesLangfuseObservation,
} from "@/lib/observability/langfuse-openai";
import { buildAiReviewResponsesCreateExtras } from "./openai-ai-review-params";
import {
  coerceNonEmptyAiReviewVariables,
  findMissingAiReviewPromptVariables,
} from "./ai/ai-review-prompt-variables";
import type { AiReviewPromptKey } from "./ai/prompt-model-registry";
import { isAiReviewPipelineDebug } from "./ai/ai-review-debug";

const defaultModel = "gpt-5-mini";
const fallbackModel = "gpt-4o-mini";

type ResponsesCreateBody = {
  model: string;
  input?: unknown;
  prompt?: unknown;
  store: boolean;
  temperature?: number;
  reasoning?: { effort: string };
  text?: {
    verbosity?: string;
    format?: {
      type: "json_schema";
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };
  };
  max_output_tokens?: number;
};

type OpenAIRequestOptions = {
  signal?: AbortSignal;
};

type JsonSchemaFormat = NonNullable<NonNullable<ResponsesCreateBody["text"]>["format"]>;

/** Model routing for copilot, AI Review and advisor assistant paths (env overrides). */
export type OpenAIModelRoutingCategory =
  | "default"
  | "copilot"
  | "ai_review"
  | "advisor_chat"
  | "advisor_chat_fast"
  | "advisor_intent";

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

function isAiReviewRouting(routing: OpenAICallRoutingOptions | undefined): boolean {
  return routing?.category === "ai_review";
}

function resolveOpenAIRetryAttempts(routing: OpenAICallRoutingOptions | undefined): number {
  return isAiReviewRouting(routing) ? 2 : 6;
}

function buildOpenAIRequestOptions(
  routing: OpenAICallRoutingOptions | undefined
): OpenAIRequestOptions | undefined {
  if (!isAiReviewRouting(routing)) return undefined;
  return {
    signal: AbortSignal.timeout(60_000),
  };
}

function buildResponsesCreateBody(params: {
  model: string;
  store: boolean;
  routing?: OpenAICallRoutingOptions;
  input?: unknown;
  prompt?: unknown;
  textFormat?: JsonSchemaFormat;
}): ResponsesCreateBody {
  const augmented = aiReviewResponsesAugmentation(params.routing, params.model) as ResponsesCreateBody;
  const text = params.textFormat
    ? { format: params.textFormat }
    : augmented.text;
  return {
    ...augmented,
    model: params.model,
    store: params.store,
    ...(params.input !== undefined ? { input: params.input } : {}),
    ...(params.prompt !== undefined ? { prompt: params.prompt } : {}),
    ...(text ? { text } : {}),
    ...(params.routing?.maxOutputTokens ? { max_output_tokens: params.routing.maxOutputTokens } : {}),
  };
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
  if (cat === "advisor_chat") {
    return process.env.OPENAI_MODEL_ADVISOR_CHAT?.trim() || fallback;
  }
  if (cat === "advisor_chat_fast") {
    return (
      process.env.OPENAI_MODEL_ADVISOR_CHAT_FAST?.trim() ||
      process.env.OPENAI_MODEL_ADVISOR_CHAT?.trim() ||
      fallback
    );
  }
  if (cat === "advisor_intent") {
    return (
      process.env.OPENAI_MODEL_ADVISOR_INTENT?.trim() ||
      process.env.OPENAI_MODEL_ADVISOR_CHAT_FAST?.trim() ||
      process.env.OPENAI_MODEL_ADVISOR_CHAT?.trim() ||
      fallback
    );
  }
  return fallback;
}

let clientInstance: OpenAI | null = null;

function observabilityUrlHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid_url";
  }
}

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

export type CreateResponseStreamingOptions = {
  model?: string;
  store?: boolean;
  routing?: OpenAICallRoutingOptions;
  onTextDelta?: (delta: string) => void;
};

/**
 * Server-only logging. Never log API key or full document content.
 *
 * L12 retention/PII policy (confirmed 2026-04):
 * - Only fires in `NODE_ENV === "development"` AND when
 *   `isAiReviewPipelineDebug()` is true. In production this function is a
 *   no-op and never touches any log sink.
 * - Payload is strictly non-PII: endpoint name, model id, latency, boolean
 *   success, and an error string which is sanitized upstream. No prompt text,
 *   no response body, no client/contact identifiers, no API keys.
 * - Target is `console.log` only — no structured audit row, no Sentry,
 *   no Langfuse. In dev Next.js streams stdout to the terminal; nothing is
 *   persisted to our DB or observability vendors.
 *
 * If you extend this function, keep those invariants — or move the richer
 * payload to `logAuditAction` where tenant/user scoping and retention are
 * enforced.
 */
export function logOpenAICall(params: {
  endpoint: string;
  model: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  if (!isAiReviewPipelineDebug()) return;
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
  const lfObs = new OpenAiResponsesLangfuseObservation({
    operation: "responses.create",
    model: primaryModel,
    input,
    routingCategory: options?.routing?.category,
  });

  try {
    let response: Awaited<ReturnType<OpenAI["responses"]["create"]>>;
    let usedModel = primaryModel;
    try {
      const createBody = buildResponsesCreateBody({
        model: primaryModel,
        input,
        store,
        routing: options?.routing,
      });
      response = await withOpenAIRateLimitRetry(
        () =>
          client.responses.create(
            createBody as Parameters<OpenAI["responses"]["create"]>[0],
            buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
          ),
        { label: "responses.create", maxAttempts: resolveOpenAIRetryAttempts(options?.routing) }
      );
    } catch (err) {
      if (isModelError(err) && primaryModel !== fallbackModel) {
        lfObs.setModel(fallbackModel);
        const fallbackBody = buildResponsesCreateBody({
          model: fallbackModel,
          input,
          store,
          routing: options?.routing,
        });
        response = await withOpenAIRateLimitRetry(
          () =>
            client.responses.create(
              fallbackBody as Parameters<OpenAI["responses"]["create"]>[0],
              buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
            ),
          {
            label: "responses.create(fallback_model)",
            maxAttempts: resolveOpenAIRetryAttempts(options?.routing),
          }
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
    if (typeof text === "string" && text.trim()) {
      const t = text.trim();
      lfObs.endSuccess(response, t);
      return t;
    }

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
      if (parts.length) {
        const joined = parts.join("\n").trim();
        lfObs.endSuccess(response, joined);
        return joined;
      }
    }

    throw new Error("Prázdná odpověď od OpenAI.");
  } catch (err) {
    lfObs.endFailure(err);
    throw err;
  } finally {
    await lfObs.flush();
  }
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

function extractStreamingTextDelta(event: unknown): string {
  const rec = event as { type?: string; delta?: unknown; text?: unknown };
  if (
    rec?.type === "response.output_text.delta" ||
    rec?.type === "response.refusal.delta" ||
    rec?.type === "response.text.delta"
  ) {
    return typeof rec.delta === "string" ? rec.delta : "";
  }
  return typeof rec?.text === "string" && rec.type === "text_delta" ? rec.text : "";
}

function extractStreamingCompletedResponse(event: unknown): { output_text?: string; output?: unknown[] } | null {
  const rec = event as { type?: string; response?: unknown };
  if (rec?.type !== "response.completed" || typeof rec.response !== "object" || rec.response === null) {
    return null;
  }
  return rec.response as { output_text?: string; output?: unknown[] };
}

async function streamResponseWithModel(params: {
  client: OpenAI;
  input: string;
  model: string;
  store: boolean;
  routing?: OpenAICallRoutingOptions;
  onTextDelta?: (delta: string) => void;
}): Promise<string> {
  const createBody = {
    ...buildResponsesCreateBody({
      model: params.model,
      input: params.input,
      store: params.store,
      routing: params.routing,
    }),
    stream: true,
  };

  const stream = await withOpenAIRateLimitRetry(
    () =>
      params.client.responses.create(
        createBody as Parameters<OpenAI["responses"]["create"]>[0],
        buildOpenAIRequestOptions(params.routing) as Parameters<OpenAI["responses"]["create"]>[1]
      ),
    { label: "responses.stream", maxAttempts: resolveOpenAIRetryAttempts(params.routing) }
  ) as AsyncIterable<unknown>;

  const chunks: string[] = [];
  let completedResponse: { output_text?: string; output?: unknown[] } | null = null;
  for await (const event of stream) {
    const delta = extractStreamingTextDelta(event);
    if (delta) {
      chunks.push(delta);
      params.onTextDelta?.(delta);
      continue;
    }
    completedResponse = extractStreamingCompletedResponse(event) ?? completedResponse;
  }

  const text = chunks.join("").trim();
  if (text) return text;
  if (completedResponse) return extractResponseText(completedResponse);
  throw new Error("Prázdná streamovaná odpověď od OpenAI.");
}

export async function createResponseStreaming(
  input: string,
  options?: CreateResponseStreamingOptions
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
  const lfObs = new OpenAiResponsesLangfuseObservation({
    operation: "responses.stream",
    model: primaryModel,
    input,
    routingCategory: options?.routing?.category,
  });

  try {
    let usedModel = primaryModel;
    let text: string;
    try {
      text = await streamResponseWithModel({
        client,
        input,
        model: primaryModel,
        store,
        routing: options?.routing,
        onTextDelta: options?.onTextDelta,
      });
    } catch (err) {
      if (isModelError(err) && primaryModel !== fallbackModel) {
        usedModel = fallbackModel;
        lfObs.setModel(fallbackModel);
        text = await streamResponseWithModel({
          client,
          input,
          model: fallbackModel,
          store,
          routing: options?.routing,
          onTextDelta: options?.onTextDelta,
        });
      } else {
        const latencyMs = Date.now() - start;
        const message = err instanceof Error ? err.message : String(err);
        logOpenAICall({
          endpoint: "responses.stream",
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
      endpoint: "responses.stream",
      model: usedModel,
      latencyMs,
      success: true,
    });
    lfObs.endSuccess({ output_text: text }, text);
    return text;
  } catch (err) {
    lfObs.endFailure(err);
    throw err;
  } finally {
    await lfObs.flush();
  }
}

export type CreateStructuredResponseResult<T> = {
  text: string;
  parsed: T;
  model: string;
};

export async function createResponseStructured<T>(
  input: string,
  jsonSchema: Record<string, unknown>,
  options?: {
    model?: string;
    store?: boolean;
    routing?: OpenAICallRoutingOptions;
    schemaName?: string;
  }
): Promise<CreateStructuredResponseResult<T>> {
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
  const schemaName = options?.schemaName?.trim() || "extraction";
  const lfObs = new OpenAiResponsesLangfuseObservation({
    operation: "responses.create_structured",
    model: primaryModel,
    input,
    routingCategory: options?.routing?.category,
  });

  try {
    let response: Awaited<ReturnType<OpenAI["responses"]["create"]>>;
    let usedModel = primaryModel;
    try {
      const createBody = buildResponsesCreateBody({
        model: primaryModel,
        input,
        store,
        routing: options?.routing,
        textFormat: {
          type: "json_schema",
          name: schemaName,
          schema: jsonSchema,
        },
      });
      response = await withOpenAIRateLimitRetry(
        () =>
          client.responses.create(
            createBody as Parameters<OpenAI["responses"]["create"]>[0],
            buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
          ),
        {
          label: "responses.create_structured",
          maxAttempts: resolveOpenAIRetryAttempts(options?.routing),
        }
      );
    } catch (err) {
      if (isModelError(err) && primaryModel !== fallbackModel) {
        lfObs.setModel(fallbackModel);
        const fallbackBody = buildResponsesCreateBody({
          model: fallbackModel,
          input,
          store,
          routing: options?.routing,
          textFormat: {
            type: "json_schema",
            name: schemaName,
            schema: jsonSchema,
          },
        });
        response = await withOpenAIRateLimitRetry(
          () =>
            client.responses.create(
              fallbackBody as Parameters<OpenAI["responses"]["create"]>[0],
              buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
            ),
          {
            label: "responses.create_structured(fallback_model)",
            maxAttempts: resolveOpenAIRetryAttempts(options?.routing),
          }
        );
        usedModel = fallbackModel;
      } else {
        const latencyMs = Date.now() - start;
        const message = err instanceof Error ? err.message : String(err);
        logOpenAICall({
          endpoint: "responses.create_structured",
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
      endpoint: "responses.create_structured",
      model: usedModel,
      latencyMs,
      success: true,
    });

    const parsedDirect = (response as { output_parsed?: T }).output_parsed;
    const text = extractResponseText(response as { output_text?: string; output?: unknown[] });
    if (parsedDirect !== undefined) {
      lfObs.endSuccess(response, text);
      return { text, parsed: parsedDirect, model: usedModel };
    }
    const parsed = JSON.parse(text) as T;
    lfObs.endSuccess(response, text);
    return {
      text,
      parsed,
      model: usedModel,
    };
  } catch (err) {
    lfObs.endFailure(err);
    throw err;
  } finally {
    await lfObs.flush();
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

  const lfObs = new OpenAiResponsesLangfuseObservation({
    operation: "responses.create_prompt",
    model: primaryModel,
    input: {
      promptId: trimmedId,
      ...(params.version?.trim() ? { version: params.version.trim() } : {}),
      variableKeys: Object.keys(sanitizedVariables),
    },
    routingCategory: options?.routing?.category,
  });

  try {
    const promptBody = buildResponsesCreateBody({
      model: primaryModel,
      prompt: promptPayload as Parameters<OpenAI["responses"]["create"]>[0]["prompt"],
      store,
      routing: options?.routing,
    });
    const response = await withOpenAIRateLimitRetry(
      () =>
        client.responses.create(
          promptBody as Parameters<OpenAI["responses"]["create"]>[0],
          buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
        ),
      { label: "responses.create_prompt", maxAttempts: resolveOpenAIRetryAttempts(options?.routing) }
    );
    const latencyMs = Date.now() - start;
    logOpenAICall({
      endpoint: "responses.create_prompt",
      model: primaryModel,
      latencyMs,
      success: true,
    });
    const text = extractResponseText(response as { output_text?: string; output?: unknown[] });
    lfObs.endSuccess(response, text);
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
    lfObs.endFailure(err);
    return { ok: false, error: message, code: (err as { code?: string })?.code };
  } finally {
    await lfObs.flush();
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
  if (!isAiReviewPipelineDebug()) return;
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

  const lfObs = new OpenAiResponsesLangfuseObservation({
    operation: "responses.create_with_file",
    model: primaryModel,
    input: {
      fileUrlHost: observabilityUrlHost(fileUrl),
      textPrompt: clipForLangfuse(textPrompt),
    },
    routingCategory: options?.routing?.category,
  });

  try {
    let response: Awaited<ReturnType<OpenAI["responses"]["create"]>>;
    let usedModel = primaryModel;
    try {
      const fileBody = buildResponsesCreateBody({
        model: primaryModel,
        input,
        store,
        routing: options?.routing,
      });
      response = await withOpenAIRateLimitRetry(
        () =>
          client.responses.create(
            fileBody as Parameters<OpenAI["responses"]["create"]>[0],
            buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
          ),
        { label: "responses.create_with_file", maxAttempts: resolveOpenAIRetryAttempts(options?.routing) }
      );
    } catch (err) {
      if (isModelError(err) && primaryModel !== fallbackModel) {
        lfObs.setModel(fallbackModel);
        const fileFallbackBody = buildResponsesCreateBody({
          model: fallbackModel,
          input,
          store,
          routing: options?.routing,
        });
        response = await withOpenAIRateLimitRetry(
          () =>
            client.responses.create(
              fileFallbackBody as Parameters<OpenAI["responses"]["create"]>[0],
              buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
            ),
          {
            label: "responses.create_with_file(fallback_model)",
            maxAttempts: resolveOpenAIRetryAttempts(options?.routing),
          }
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
    if (typeof text === "string" && text.trim()) {
      const t = text.trim();
      lfObs.endSuccess(response, t);
      return t;
    }

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
      if (parts.length) {
        const joined = parts.join("\n").trim();
        lfObs.endSuccess(response, joined);
        return joined;
      }
    }

    throw new Error("Prázdná odpověď od OpenAI.");
  } catch (err) {
    lfObs.endFailure(err);
    throw err;
  } finally {
    await lfObs.flush();
  }
}

/**
 * Structured response with image URL input (multimodal — Responses API).
 * Sends imageUrl as input_image content + textPrompt, returns structured JSON.
 * Used by image-intake multimodal classifier/extractor v2.
 * Server-side only.
 */
export async function createResponseStructuredWithImage<T>(
  imageUrl: string,
  textPrompt: string,
  jsonSchema: Record<string, unknown>,
  options?: {
    model?: string;
    store?: boolean;
    routing?: OpenAICallRoutingOptions;
    schemaName?: string;
  }
): Promise<CreateStructuredResponseResult<T>> {
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
  const schemaName = options?.schemaName?.trim() || "image_extraction";

  const input = [
    {
      role: "user" as const,
      content: [
        { type: "input_image" as const, image_url: imageUrl },
        { type: "input_text" as const, text: textPrompt },
      ],
    },
  ];

  const lfObs = new OpenAiResponsesLangfuseObservation({
    operation: "responses.create_structured_image",
    model: primaryModel,
    input: {
      imageUrlHost: observabilityUrlHost(imageUrl),
      textPrompt: clipForLangfuse(textPrompt),
      schemaName,
    },
    routingCategory: options?.routing?.category,
  });

  try {
    let response: Awaited<ReturnType<OpenAI["responses"]["create"]>>;
    let usedModel = primaryModel;

    try {
      const body = buildResponsesCreateBody({
        model: primaryModel,
        input,
        store,
        routing: options?.routing,
        textFormat: {
          type: "json_schema",
          name: schemaName,
          schema: jsonSchema,
          strict: false,
        },
      });
      response = await withOpenAIRateLimitRetry(
        () =>
          client.responses.create(
            body as Parameters<OpenAI["responses"]["create"]>[0],
            buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
          ),
        { label: "responses.create_structured_image", maxAttempts: resolveOpenAIRetryAttempts(options?.routing) }
      );
    } catch (err) {
      if (isModelError(err) && primaryModel !== fallbackModel) {
        lfObs.setModel(fallbackModel);
        const fallbackBody = buildResponsesCreateBody({
          model: fallbackModel,
          input,
          store,
          routing: options?.routing,
          textFormat: {
            type: "json_schema",
            name: schemaName,
            schema: jsonSchema,
            strict: false,
          },
        });
        response = await withOpenAIRateLimitRetry(
          () =>
            client.responses.create(
              fallbackBody as Parameters<OpenAI["responses"]["create"]>[0],
              buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
            ),
          {
            label: "responses.create_structured_image(fallback_model)",
            maxAttempts: resolveOpenAIRetryAttempts(options?.routing),
          }
        );
        usedModel = fallbackModel;
      } else {
        const latencyMs = Date.now() - start;
        const message = err instanceof Error ? err.message : String(err);
        logOpenAICall({
          endpoint: "responses.create_structured_image",
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
      endpoint: "responses.create_structured_image",
      model: usedModel,
      latencyMs,
      success: true,
    });

    const parsedDirect = (response as { output_parsed?: T }).output_parsed;
    const text = extractResponseText(response as { output_text?: string; output?: unknown[] });
    if (parsedDirect !== undefined) {
      lfObs.endSuccess(response, text);
      return { text, parsed: parsedDirect, model: usedModel };
    }
    lfObs.endSuccess(response, text);
    return {
      text,
      parsed: JSON.parse(text) as T,
      model: usedModel,
    };
  } catch (err) {
    lfObs.endFailure(err);
    throw err;
  } finally {
    await lfObs.flush();
  }
}

/**
 * Structured response with multiple image URL inputs (multimodal — Responses API).
 * Sends up to MAX_IMAGES image URLs as input_image content items + textPrompt.
 * Used by image-intake combined multimodal pass v2 (Phase 7).
 *
 * Images are sent in order: each becomes a separate input_image content block.
 * Hard cap: max 5 images (enforced here, caller should also enforce lower limit).
 * Server-side only.
 */
export async function createResponseStructuredWithImages<T>(
  imageUrls: string[],
  textPrompt: string,
  jsonSchema: Record<string, unknown>,
  options?: {
    model?: string;
    store?: boolean;
    routing?: OpenAICallRoutingOptions;
    schemaName?: string;
    maxImages?: number;
  }
): Promise<CreateStructuredResponseResult<T>> {
  const maxImages = Math.min(options?.maxImages ?? 3, 5);
  const cappedUrls = imageUrls.slice(0, maxImages);

  if (cappedUrls.length === 0) {
    throw new Error("createResponseStructuredWithImages: at least 1 imageUrl required");
  }

  // Single image: delegate to existing single-image function to keep code path simple
  if (cappedUrls.length === 1) {
    return createResponseStructuredWithImage<T>(cappedUrls[0]!, textPrompt, jsonSchema, options);
  }

  const client = getClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY není nastaven.");
  }

  const primaryModel = resolveOpenAIModel({
    explicit: options?.model,
    category: options?.routing?.category,
  });
  const store = options?.store ?? false;
  const start = Date.now();
  const schemaName = options?.schemaName?.trim() || "image_group_extraction";

  // Build content: all images first, then the text prompt
  const imageContent = cappedUrls.map((url) => ({
    type: "input_image" as const,
    image_url: url,
  }));

  const input = [
    {
      role: "user" as const,
      content: [
        ...imageContent,
        { type: "input_text" as const, text: textPrompt },
      ],
    },
  ];

  const usedModel = primaryModel;
  const lfObs = new OpenAiResponsesLangfuseObservation({
    operation: "responses.create_structured_images",
    model: usedModel,
    input: {
      imageCount: cappedUrls.length,
      textPrompt: clipForLangfuse(textPrompt),
      schemaName,
    },
    routingCategory: options?.routing?.category,
  });

  const body = buildResponsesCreateBody({
    model: primaryModel,
    input,
    store,
    routing: options?.routing,
    textFormat: {
      type: "json_schema",
      name: schemaName,
      schema: jsonSchema,
      strict: false,
    },
  });

  try {
    const response = await withOpenAIRateLimitRetry(
      () =>
        client.responses.create(
          body as Parameters<OpenAI["responses"]["create"]>[0],
          buildOpenAIRequestOptions(options?.routing) as Parameters<OpenAI["responses"]["create"]>[1]
        ),
      { label: "responses.create_structured_images", maxAttempts: resolveOpenAIRetryAttempts(options?.routing) }
    );

    const latencyMs = Date.now() - start;
    logOpenAICall({ endpoint: "responses.create_structured_images", model: usedModel, latencyMs, success: true });

    const parsedDirect = (response as { output_parsed?: T }).output_parsed;
    const text = extractResponseText(response as { output_text?: string; output?: unknown[] });
    if (parsedDirect !== undefined) {
      lfObs.endSuccess(response, text);
      return { text, parsed: parsedDirect, model: usedModel };
    }
    lfObs.endSuccess(response, text);
    return { text, parsed: JSON.parse(text) as T, model: usedModel };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logOpenAICall({
      endpoint: "responses.create_structured_images",
      model: usedModel,
      latencyMs: Date.now() - start,
      success: false,
      error: message,
    });
    lfObs.endFailure(err);
    throw err instanceof Error ? err : new Error(message);
  } finally {
    await lfObs.flush();
  }
}

export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export { defaultModel, fallbackModel };
