import { describe, it, expect, beforeEach } from "vitest";
import { recordAbuseEvent, checkAbuse, getAbuseSignals, resetAbuseCountersForTests } from "../abuse-detection";

describe("abuse-detection", () => {
  beforeEach(() => {
    resetAbuseCountersForTests();
  });

  it("checkAbuse returns non-abusive when empty", () => {
    const r = checkAbuse("auth_failures", "ip-1");
    expect(r.abusive).toBe(false);
    expect(r.count).toBe(0);
  });

  it("recordAbuseEvent increments count", () => {
    recordAbuseEvent("auth_failures", "ip-1");
    const r = checkAbuse("auth_failures", "ip-1");
    expect(r.count).toBe(1);
  });

  it("marks abusive at threshold", () => {
    for (let i = 0; i < 15; i++) {
      recordAbuseEvent("auth_failures", "ip-burst");
    }
    const r = checkAbuse("auth_failures", "ip-burst");
    expect(r.abusive).toBe(true);
    expect(r.count).toBeGreaterThanOrEqual(15);
  });

  it("getAbuseSignals returns all types", () => {
    const signals = getAbuseSignals("user-x");
    expect(signals.length).toBeGreaterThanOrEqual(6);
    expect(signals.every((s) => s.identity === "user-x")).toBe(true);
  });
});
