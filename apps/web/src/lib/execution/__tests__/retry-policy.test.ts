import { describe, it, expect } from "vitest";
import { evaluateDeliveryRetry } from "../retry-policy";

describe("evaluateDeliveryRetry", () => {
  it("allows retry for retryable code on first attempt", () => {
    const decision = evaluateDeliveryRetry("email_send_failed", 0);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.delayMs).toBeGreaterThan(0);
  });

  it("disallows retry when attempts exhausted", () => {
    const decision = evaluateDeliveryRetry("email_send_failed", 2);
    expect(decision.shouldRetry).toBe(false);
  });

  it("disallows retry for non-retryable code", () => {
    const decision = evaluateDeliveryRetry("email_consent_blocked", 0);
    expect(decision.shouldRetry).toBe(false);
  });

  it("applies exponential backoff", () => {
    const d0 = evaluateDeliveryRetry("provider_timeout", 0);
    const d1 = evaluateDeliveryRetry("provider_timeout", 1);
    expect(d1.delayMs).toBeGreaterThan(d0.delayMs);
  });

  it("push_delivery_failed has max 1 retry", () => {
    const d0 = evaluateDeliveryRetry("push_delivery_failed", 0);
    expect(d0.shouldRetry).toBe(true);
    expect(d0.maxAttempts).toBe(1);
    const d1 = evaluateDeliveryRetry("push_delivery_failed", 1);
    expect(d1.shouldRetry).toBe(false);
  });
});
