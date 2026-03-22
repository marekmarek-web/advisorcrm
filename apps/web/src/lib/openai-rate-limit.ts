/**
 * OpenAI rate-limit (429 / TPM) detection and bounded retry helpers.
 * Server-only; used by openai.ts wrappers.
 */

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function getOpenAIHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const o = err as { status?: number; response?: { status?: number } };
  if (typeof o.status === "number") return o.status;
  if (typeof o.response?.status === "number") return o.response.status;
  return undefined;
}

/** True for TPM/RPM style limits from OpenAI Responses API. */
export function isOpenAIRateLimitError(err: unknown): boolean {
  const status = getOpenAIHttpStatus(err);
  const msg = errorMessage(err).toLowerCase();
  const code = (err as { code?: string })?.code;
  return (
    status === 429 ||
    code === "rate_limit_exceeded" ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  );
}

/**
 * Parse "Please try again in 4.131s" from OpenAI error body.
 * Returns seconds, capped for safety.
 */
export function parseOpenAIRetryAfterSeconds(err: unknown): number | null {
  const msg = errorMessage(err);
  const m = msg.match(/try again in\s+([\d.]+)\s*s/i);
  if (m) {
    const sec = Number.parseFloat(m[1]);
    if (!Number.isFinite(sec) || sec < 0) return null;
    return Math.min(Math.max(sec, 0.5), 90);
  }
  const errObj = err as { response?: { headers?: { get?: (k: string) => string | null } } };
  const header = errObj.response?.headers?.get?.("retry-after");
  if (header) {
    const n = Number.parseInt(header, 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 90);
  }
  return null;
}

export type RateLimitRetryOptions = {
  /** Context string for logs only */
  label: string;
  maxAttempts?: number;
};

/**
 * Runs `op` and retries on OpenAI rate limit with backoff from error message when possible.
 */
export async function withOpenAIRateLimitRetry<T>(
  op: () => Promise<T>,
  options: RateLimitRetryOptions
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      const isRl = isOpenAIRateLimitError(err);
      if (!isRl || attempt >= maxAttempts) {
        throw err;
      }
      const parsed = parseOpenAIRetryAfterSeconds(err);
      const baseMs = parsed != null ? Math.ceil(parsed * 1000) : Math.min(2000 * 2 ** (attempt - 1), 30_000);
      const jitter = 150 + attempt * 120;
      const waitMs = Math.min(baseMs + jitter, 95_000);
      // eslint-disable-next-line no-console
      console.warn(
        `[OpenAI] ${options.label}: rate limit (attempt ${attempt}/${maxAttempts}), waiting ${waitMs}ms then retry`
      );
      await sleepMs(waitMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
