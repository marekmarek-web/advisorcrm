import { describe, it, expect } from "vitest";
import {
  JOB_RETRY_POLICIES,
  evaluateJobRetry,
  shouldDeadLetter,
  getMaxAttempts,
} from "../job-resilience";

describe("JOB_RETRY_POLICIES", () => {
  it("critical allows more attempts than best_effort", () => {
    expect(JOB_RETRY_POLICIES.critical.maxAttempts).toBeGreaterThan(
      JOB_RETRY_POLICIES.best_effort.maxAttempts
    );
  });
});

describe("evaluateJobRetry", () => {
  it("allows retry when under max", () => {
    const r = evaluateJobRetry("standard", 1, 1_000_000_000_000);
    expect(r.shouldRetry).toBe(true);
    expect(r.delayMs).toBeGreaterThan(0);
  });

  it("denies retry after max attempts", () => {
    const max = getMaxAttempts("standard");
    const r = evaluateJobRetry("standard", max, 1_000_000_000_000);
    expect(r.shouldRetry).toBe(false);
    expect(r.reason).toBe("max_attempts_exceeded");
  });
});

describe("shouldDeadLetter", () => {
  it("true when attempts meet max", () => {
    expect(shouldDeadLetter("best_effort", 3)).toBe(true);
    expect(shouldDeadLetter("best_effort", 2)).toBe(false);
  });
});
