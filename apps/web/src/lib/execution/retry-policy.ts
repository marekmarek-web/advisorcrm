/**
 * Retry policy engine (Plan 6B.4).
 * Evaluates whether a failed delivery should be retried.
 */

import { isRetryable } from "./delivery-failures";

export type RetryDecision = {
  shouldRetry: boolean;
  delayMs: number;
  maxAttempts: number;
};

type RetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
};

const RETRY_CONFIGS: Record<string, RetryConfig> = {
  email_send_failed: { maxAttempts: 2, baseDelayMs: 5_000 },
  push_delivery_failed: { maxAttempts: 1, baseDelayMs: 5_000 },
  calendar_create_failed: { maxAttempts: 2, baseDelayMs: 10_000 },
  scheduling_failed: { maxAttempts: 2, baseDelayMs: 5_000 },
  provider_timeout: { maxAttempts: 2, baseDelayMs: 3_000 },
};

export function evaluateDeliveryRetry(
  failureCode: string,
  currentAttempt: number,
): RetryDecision {
  if (!isRetryable(failureCode)) {
    return { shouldRetry: false, delayMs: 0, maxAttempts: 0 };
  }

  const config = RETRY_CONFIGS[failureCode] ?? { maxAttempts: 1, baseDelayMs: 5_000 };

  if (currentAttempt >= config.maxAttempts) {
    return { shouldRetry: false, delayMs: 0, maxAttempts: config.maxAttempts };
  }

  const delayMs = config.baseDelayMs * Math.pow(2, currentAttempt);

  return {
    shouldRetry: true,
    delayMs,
    maxAttempts: config.maxAttempts,
  };
}
