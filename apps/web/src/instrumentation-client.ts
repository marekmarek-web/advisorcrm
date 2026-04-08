import * as Sentry from "@sentry/nextjs";
import { resolveSentryTracesSampleRate } from "@/lib/sentry-traces-sample-rate";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    // Na klientu není VERCEL_ENV; volitelně nastav NEXT_PUBLIC_SENTRY_ENVIRONMENT (např. preview / production).
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ?? process.env.NODE_ENV,
    sendDefaultPii: process.env.NODE_ENV !== "production",
    tracesSampleRate: resolveSentryTracesSampleRate("browser"),
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
    // V browser bundle je jen NEXT_PUBLIC_* — pro verbose log v devtools nastav NEXT_PUBLIC_SENTRY_DEBUG=true.
    debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "true",
    integrations: [Sentry.replayIntegration()],
    // Sentry.io injected scripts / browser extensions (not our app).
    ignoreErrors: [/has no method ['"]updateFrom['"]/, /sentry\/scripts\//i],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
