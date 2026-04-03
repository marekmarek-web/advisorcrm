import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Sentry from "@sentry/nextjs";

vi.mock("@sentry/nextjs", () => {
  const captureException = vi.fn();
  return {
    withScope: (fn: (scope: { setTag: ReturnType<typeof vi.fn>; setContext: ReturnType<typeof vi.fn> }) => void) =>
      fn({ setTag: vi.fn(), setContext: vi.fn() }),
    captureException,
  };
});

import { captureAssistantApiError } from "../assistant-sentry";

describe("captureAssistantApiError", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("reports Error to Sentry with assistant tags", () => {
    captureAssistantApiError(new Error("boom"), {
      traceId: "trace-uuid-1234",
      assistantRunId: "run-uuid-5678",
      channel: "web_drawer",
      orchestration: "canonical",
      tenantId: "tenant-uuid",
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("wraps non-Error values", () => {
    captureAssistantApiError("string fail", {
      traceId: "t",
      assistantRunId: "r",
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(Sentry.captureException).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe("string fail");
  });
});
