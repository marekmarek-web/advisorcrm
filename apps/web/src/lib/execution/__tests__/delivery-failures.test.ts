import { describe, it, expect } from "vitest";
import { getFailureEntry, isRetryable, getUserMessage, FAILURE_CODES } from "../delivery-failures";

describe("delivery-failures", () => {
  it("returns entry for known code", () => {
    const entry = getFailureEntry("email_send_failed");
    expect(entry).toBeDefined();
    expect(entry!.retryable).toBe(true);
  });

  it("returns undefined for unknown code", () => {
    expect(getFailureEntry("nonexistent")).toBeUndefined();
  });

  it("isRetryable returns true for retryable codes", () => {
    expect(isRetryable("provider_timeout")).toBe(true);
    expect(isRetryable("email_send_failed")).toBe(true);
  });

  it("isRetryable returns false for non-retryable codes", () => {
    expect(isRetryable("email_consent_blocked")).toBe(false);
    expect(isRetryable("calendar_auth_expired")).toBe(false);
  });

  it("getUserMessage returns Czech message", () => {
    const msg = getUserMessage("push_invalid_token");
    expect(msg).toContain("znovupřihlašte");
  });

  it("getUserMessage returns fallback for unknown code", () => {
    const msg = getUserMessage("unknown_code");
    expect(msg).toContain("Neočekávaná chyba");
  });

  it("has all expected failure codes", () => {
    expect(FAILURE_CODES.length).toBeGreaterThanOrEqual(13);
  });
});
