/**
 * Job classification and retry policy (Plan 9B).
 * Pure logic for backoff and dead-letter eligibility; workers call these helpers.
 */

export type JobClassification = "critical" | "standard" | "best_effort";

export type RetryPolicy = {
  classification: JobClassification;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
};

export const JOB_RETRY_POLICIES: Record<JobClassification, RetryPolicy> = {
  critical: {
    classification: "critical",
    maxAttempts: 8,
    baseDelayMs: 5_000,
    maxDelayMs: 3600_000,
    jitterRatio: 0.2,
  },
  standard: {
    classification: "standard",
    maxAttempts: 5,
    baseDelayMs: 2_000,
    maxDelayMs: 900_000,
    jitterRatio: 0.25,
  },
  best_effort: {
    classification: "best_effort",
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 120_000,
    jitterRatio: 0.3,
  },
};

export type JobRetryEvaluation = {
  classification: JobClassification;
  attemptNumber: number;
  shouldRetry: boolean;
  delayMs: number;
  nextAttemptAt: Date;
  reason?: string;
};

function applyJitter(ms: number, jitterRatio: number): number {
  const span = ms * jitterRatio;
  const delta = (Math.random() * 2 - 1) * span;
  return Math.max(0, Math.round(ms + delta));
}

export function evaluateJobRetry(
  classification: JobClassification,
  attemptNumber: number,
  nowMs: number = Date.now()
): JobRetryEvaluation {
  const policy = JOB_RETRY_POLICIES[classification];
  const nextAttempt = attemptNumber + 1;

  if (nextAttempt > policy.maxAttempts) {
    return {
      classification,
      attemptNumber,
      shouldRetry: false,
      delayMs: 0,
      nextAttemptAt: new Date(nowMs),
      reason: "max_attempts_exceeded",
    };
  }

  const exp = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * Math.pow(2, Math.max(0, attemptNumber - 1))
  );
  const delayMs = applyJitter(exp, policy.jitterRatio);

  return {
    classification,
    attemptNumber,
    shouldRetry: true,
    delayMs,
    nextAttemptAt: new Date(nowMs + delayMs),
  };
}

export function shouldDeadLetter(
  classification: JobClassification,
  attemptsSoFar: number
): boolean {
  const policy = JOB_RETRY_POLICIES[classification];
  return attemptsSoFar >= policy.maxAttempts;
}

export function getMaxAttempts(classification: JobClassification): number {
  return JOB_RETRY_POLICIES[classification].maxAttempts;
}
