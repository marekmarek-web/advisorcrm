import Langfuse from "langfuse";

/** Max stored payload length per Langfuse input/output field (SDK also truncates). */
const MAX_LANGFUSE_TEXT_CHARS = 24_000;

let langfuseSingleton: Langfuse | null | undefined;

function resolveLangfuseEnabled(): boolean {
  return process.env.LANGFUSE_ENABLED?.trim().toLowerCase() !== "false";
}

export function getLangfuseServerClient(): Langfuse | null {
  if (langfuseSingleton !== undefined) return langfuseSingleton;
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  if (!secretKey || !publicKey || !resolveLangfuseEnabled()) {
    langfuseSingleton = null;
    return null;
  }
  langfuseSingleton = new Langfuse({
    secretKey,
    publicKey,
    baseUrl: process.env.LANGFUSE_HOST?.trim() || undefined,
    environment:
      process.env.LANGFUSE_ENVIRONMENT?.trim() ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV,
  });
  return langfuseSingleton;
}

/** True když je v paměti aktivní Langfuse klient (klíče + LANGFUSE_ENABLED). */
export function isLangfuseServerClientActive(): boolean {
  return getLangfuseServerClient() != null;
}

export function clipForLangfuse(text: string): string {
  if (text.length <= MAX_LANGFUSE_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_LANGFUSE_TEXT_CHARS)}\n… [truncated ${text.length - MAX_LANGFUSE_TEXT_CHARS} chars]`;
}

export function usageFromOpenAiResponsesPayload(response: unknown):
  | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  | undefined {
  const u = (response as {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  })?.usage;
  if (!u) return undefined;
  const promptTokens = u.input_tokens ?? u.prompt_tokens;
  const completionTokens = u.output_tokens ?? u.completion_tokens;
  const totalTokens = u.total_tokens;
  if (
    promptTokens == null &&
    completionTokens == null &&
    totalTokens == null
  ) {
    return undefined;
  }
  return {
    promptTokens: promptTokens ?? undefined,
    completionTokens: completionTokens ?? undefined,
    totalTokens: totalTokens ?? undefined,
  };
}

type RoutingCategory = "default" | "copilot" | "ai_review" | "advisor_chat";

/**
 * One observation per OpenAI Responses API invocation (trace + generation).
 * Safe to call endSuccess/endFailure at most once each; guarded internally.
 */
export class OpenAiResponsesLangfuseObservation {
  private readonly client: Langfuse | null;

  private readonly trace: ReturnType<Langfuse["trace"]> | null;

  private readonly generation: ReturnType<
    ReturnType<Langfuse["trace"]>["generation"]
  > | null;

  private ended = false;

  constructor(params: {
    operation: string;
    model: string;
    /** String prompt, or JSON-serializable summary (no secrets / minimal PII). */
    input: string | Record<string, unknown>;
    routingCategory?: RoutingCategory;
  }) {
    this.client = getLangfuseServerClient();
    if (!this.client) {
      this.trace = null;
      this.generation = null;
      return;
    }
    const category = params.routingCategory ?? "default";
    this.trace = this.client.trace({
      name: `openai.${params.operation}`,
      metadata: { routingCategory: category },
      tags: ["openai", "responses-api", category],
    });
    const input =
      typeof params.input === "string"
        ? clipForLangfuse(params.input)
        : params.input;
    this.generation = this.trace.generation({
      name: params.operation,
      model: params.model,
      input,
      metadata: { routingCategory: category },
    });
  }

  setModel(model: string): void {
    this.generation?.update({ model });
  }

  endSuccess(response: unknown, outputText: string): void {
    if (this.ended || !this.generation) return;
    this.ended = true;
    const usage = usageFromOpenAiResponsesPayload(response);
    this.generation.end({
      output: clipForLangfuse(outputText),
      ...(usage ? { usage } : {}),
    });
  }

  endFailure(err: unknown): void {
    if (this.ended || !this.generation) return;
    this.ended = true;
    const message = err instanceof Error ? err.message : String(err);
    this.generation.end({
      level: "ERROR",
      statusMessage: message.slice(0, 2_000),
    });
  }

  async flush(): Promise<void> {
    await this.client?.flushAsync();
  }
}
