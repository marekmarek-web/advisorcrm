import * as Sentry from "@sentry/nextjs";

/**
 * Report assistant HTTP handler failures to Sentry with stable tags for triage.
 * Safe no-op if Sentry throws (e.g. init race).
 */
export type AssistantApiErrorContext = {
  traceId: string;
  assistantRunId: string;
  channel?: string;
  orchestration?: "canonical" | "legacy";
  tenantId?: string;
};

export function captureAssistantApiError(error: unknown, ctx: AssistantApiErrorContext): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.withScope((scope) => {
      scope.setTag("api_route", "ai_assistant_chat");
      scope.setTag("trace_id", ctx.traceId.slice(0, 64));
      scope.setTag("assistant_run_id", ctx.assistantRunId.slice(0, 64));
      if (ctx.channel) scope.setTag("assistant_channel", ctx.channel.slice(0, 64));
      if (ctx.orchestration) scope.setTag("assistant_orchestration", ctx.orchestration);
      if (ctx.tenantId) scope.setTag("tenant_id", ctx.tenantId.slice(0, 36));
      scope.setContext("assistant_request", {
        traceId: ctx.traceId,
        assistantRunId: ctx.assistantRunId,
        channel: ctx.channel,
        orchestration: ctx.orchestration,
      });
      Sentry.captureException(err);
    });
  } catch {
    /* ignore */
  }
}
