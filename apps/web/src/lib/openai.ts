import OpenAI from "openai";

const defaultModel = "gpt-4o-mini";
const fallbackModel = "gpt-4o-mini";

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
  options?: { model?: string; store?: boolean }
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error(
      "OPENAI_API_KEY není nastaven. Nastavte ho v Nastavení nebo v .env."
    );
  }

  const primaryModel =
    options?.model ??
    process.env.OPENAI_MODEL ??
    defaultModel;
  const store = options?.store ?? false;
  const start = Date.now();

  let response: Awaited<ReturnType<OpenAI["responses"]["create"]>>;
  let usedModel = primaryModel;
  try {
    response = await client.responses.create({
      model: primaryModel,
      input,
      store,
    });
  } catch (err) {
    if (isModelError(err) && primaryModel !== fallbackModel) {
      response = await client.responses.create({
        model: fallbackModel,
        input,
        store,
      });
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
  options?: { model?: string; store?: boolean }
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
  options?: { model?: string; store?: boolean }
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

  const primaryModel =
    options?.model ?? process.env.OPENAI_MODEL ?? defaultModel;
  const store = options?.store ?? false;
  const start = Date.now();

  const promptPayload: { id: string; version?: string; variables: Record<string, string> } = {
    id: trimmedId,
    variables: params.variables,
  };
  if (params.version?.trim()) {
    promptPayload.version = params.version.trim();
  }

  try {
    const response = await client.responses.create({
      model: primaryModel,
      prompt: promptPayload as Parameters<OpenAI["responses"]["create"]>[0]["prompt"],
      store,
    });
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

/**
 * Create a response with a file (e.g. PDF) and optional text prompt.
 * Uses input_file with file_url. Server-side only.
 */
export async function createResponseWithFile(
  fileUrl: string,
  textPrompt: string,
  options?: { model?: string; store?: boolean }
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error(
      "OPENAI_API_KEY není nastaven. Nastavte ho v Nastavení nebo v .env."
    );
  }

  const primaryModel =
    options?.model ??
    process.env.OPENAI_MODEL ??
    defaultModel;
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
    response = await client.responses.create({
      model: primaryModel,
      input,
      store,
    });
  } catch (err) {
    if (isModelError(err) && primaryModel !== fallbackModel) {
      response = await client.responses.create({
        model: fallbackModel,
        input,
        store,
      });
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
