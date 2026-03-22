import { describe, expect, it, vi } from "vitest";
import {
  parseOpenAIRetryAfterSeconds,
  withOpenAIRateLimitRetry,
  isOpenAIRateLimitError,
} from "../openai-rate-limit";

describe("openai-rate-limit", () => {
  it("parses try again in Xs from OpenAI message", () => {
    expect(
      parseOpenAIRetryAfterSeconds(
        new Error("429 Rate limit reached ... Please try again in 4.131s. Visit https://...")
      )
    ).toBeCloseTo(4.131, 3);
  });

  it("detects rate limit from message", () => {
    expect(
      isOpenAIRateLimitError(new Error("Rate limit reached for gpt-4o-mini in organization"))
    ).toBe(true);
  });

  it("retries then succeeds", async () => {
    let n = 0;
    const op = vi.fn(async () => {
      n += 1;
      if (n < 2) {
        throw new Error("429 Rate limit ... try again in 0.01s");
      }
      return "ok";
    });
    const result = await withOpenAIRateLimitRetry(op, { label: "test", maxAttempts: 4 });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });
});
