import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Sentry from "@sentry/nextjs";

vi.mock("@sentry/nextjs", () => {
  const captureException = vi.fn();
  const captureMessage = vi.fn();
  return {
    captureException,
    captureMessage,
    withScope: (
      fn: (scope: {
        setTag: ReturnType<typeof vi.fn>;
        setFingerprint: ReturnType<typeof vi.fn>;
        setContext: ReturnType<typeof vi.fn>;
      }) => void
    ) =>
      fn({
        setTag: vi.fn(),
        setFingerprint: vi.fn(),
        setContext: vi.fn(),
      }),
  };
});

import {
  captureEntitlementViolation,
  captureTenantBoundaryViolation,
  capturePermissionViolation,
  captureSubscriptionSyncFailure,
  captureGracePeriodEntry,
} from "../productization-sentry";

describe("productization-sentry — Phase 7 instrumentation", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  describe("captureEntitlementViolation", () => {
    it("sends warning with entitlement key and action", () => {
      captureEntitlementViolation({
        tenantId: "t1",
        userId: "u1",
        entitlementKey: "ai_assistant",
        action: "use_ai_review",
      });
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const [msg, level] = vi.mocked(Sentry.captureMessage).mock.calls[0]!;
      expect(msg).toContain("ai_assistant");
      expect(level).toBe("warning");
    });

    it("is a no-op when Sentry throws", () => {
      vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => { throw new Error("sentry down"); });
      expect(() =>
        captureEntitlementViolation({ tenantId: "t1", userId: "u1", entitlementKey: "ai_review", action: "x" })
      ).not.toThrow();
    });

    it("slices tenantId longer than 36 chars", () => {
      captureEntitlementViolation({
        tenantId: "a".repeat(100),
        userId: "u1",
        entitlementKey: "client_portal",
        action: "access_portal",
      });
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("captureTenantBoundaryViolation", () => {
    it("sends error-level message with resource name", () => {
      captureTenantBoundaryViolation({
        requestTenantId: "t1",
        dataTenantId: "t2",
        userId: "u1",
        resource: "notification_log",
      });
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const [msg, level] = vi.mocked(Sentry.captureMessage).mock.calls[0]!;
      expect(msg).toContain("notification_log");
      expect(level).toBe("error");
    });
  });

  describe("capturePermissionViolation", () => {
    it("sends warning with role and required permission", () => {
      capturePermissionViolation({
        tenantId: "t1",
        userId: "u1",
        roleName: "Advisor",
        requiredPermission: "billing:write",
        action: "update_billing",
      });
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const [msg, level] = vi.mocked(Sentry.captureMessage).mock.calls[0]!;
      expect(msg).toContain("Advisor");
      expect(msg).toContain("billing:write");
      expect(level).toBe("warning");
    });
  });

  describe("captureSubscriptionSyncFailure", () => {
    it("wraps non-Error values", () => {
      captureSubscriptionSyncFailure({ tenantId: "t1", error: "upsert failed" });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const err = vi.mocked(Sentry.captureException).mock.calls[0]![0] as Error;
      expect(err.message).toContain("upsert failed");
    });

    it("passes through Error instances directly", () => {
      captureSubscriptionSyncFailure({ tenantId: null, error: new Error("Stripe timeout") });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const err = vi.mocked(Sentry.captureException).mock.calls[0]![0] as Error;
      expect(err.message).toBe("Stripe timeout");
    });
  });

  describe("captureGracePeriodEntry", () => {
    it("reports remaining days in message", () => {
      captureGracePeriodEntry({
        tenantId: "t1",
        subscriptionStatus: "past_due",
        graceDaysRemaining: 4,
        plan: "pro",
      });
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const [msg] = vi.mocked(Sentry.captureMessage).mock.calls[0]!;
      expect(msg).toContain("4d");
    });

    it("is a no-op when Sentry throws", () => {
      vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => { throw new Error("sentry down"); });
      expect(() =>
        captureGracePeriodEntry({ tenantId: "t1", subscriptionStatus: "past_due", graceDaysRemaining: 2, plan: null })
      ).not.toThrow();
    });
  });
});
