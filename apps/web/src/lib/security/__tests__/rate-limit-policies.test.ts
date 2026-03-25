import { describe, it, expect } from "vitest";
import {
  RATE_LIMIT_POLICIES,
  getRateLimitTierForRoute,
  getRateLimitForRoute,
  getRateLimitOptions,
} from "../rate-limit-policies";

describe("RATE_LIMIT_POLICIES", () => {
  it("sensitive tier is stricter than authenticated", () => {
    expect(RATE_LIMIT_POLICIES.sensitive.maxRequests).toBeLessThan(
      RATE_LIMIT_POLICIES.authenticated.maxRequests
    );
  });

  it("bulk tier has longer window", () => {
    expect(RATE_LIMIT_POLICIES.bulk.windowMs).toBeGreaterThan(
      RATE_LIMIT_POLICIES.authenticated.windowMs
    );
  });
});

describe("getRateLimitTierForRoute", () => {
  it("maps cron routes to internal", () => {
    expect(getRateLimitTierForRoute("/api/cron/reminder-check")).toBe("internal");
  });

  it("maps admin to sensitive", () => {
    expect(getRateLimitTierForRoute("/api/admin/settings/effective")).toBe("sensitive");
  });

  it("maps reports export to bulk", () => {
    expect(getRateLimitTierForRoute("/api/reports/export")).toBe("bulk");
  });

  it("maps generic api to authenticated", () => {
    expect(getRateLimitTierForRoute("/api/contacts")).toBe("authenticated");
  });

  it("defaults unknown paths to anonymous", () => {
    expect(getRateLimitTierForRoute("/unknown")).toBe("anonymous");
  });
});

describe("getRateLimitForRoute", () => {
  it("returns policy matching tier", () => {
    const p = getRateLimitForRoute("/api/admin/foo");
    expect(p.tier).toBe("sensitive");
    expect(p.maxRequests).toBe(RATE_LIMIT_POLICIES.sensitive.maxRequests);
  });
});

describe("getRateLimitOptions", () => {
  it("returns window and max for checkRateLimit", () => {
    const o = getRateLimitOptions("/api/documents/upload");
    expect(o.windowMs).toBeGreaterThan(0);
    expect(o.maxRequests).toBeGreaterThan(0);
  });
});
