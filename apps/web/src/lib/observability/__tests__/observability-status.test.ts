import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLangfuseObservabilityStatus,
  getSentryObservabilityStatus,
  resolveLangfuseHealthBaseUrl,
} from "../observability-status";

describe("observability-status", () => {
  const env = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("getSentryObservabilityStatus reflects DSN vars", () => {
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    let s = getSentryObservabilityStatus();
    expect(s.serverOrEdgeDsnConfigured).toBe(false);
    expect(s.browserDsnConfigured).toBe(false);

    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://x@o.ingest.sentry.io/y";
    s = getSentryObservabilityStatus();
    expect(s.serverOrEdgeDsnConfigured).toBe(true);
    expect(s.browserDsnConfigured).toBe(true);
  });

  it("getLangfuseObservabilityStatus respects LANGFUSE_ENABLED=false", () => {
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_ENABLED = "false";
    expect(getLangfuseObservabilityStatus().likelyEnabled).toBe(false);
  });

  it("resolveLangfuseHealthBaseUrl uses LANGFUSE_HOST when set", () => {
    process.env.LANGFUSE_HOST = "https://my.langfuse.dev/";
    expect(resolveLangfuseHealthBaseUrl()).toBe("https://my.langfuse.dev");
  });
});
