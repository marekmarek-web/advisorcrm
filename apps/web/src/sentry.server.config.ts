import * as Sentry from "@sentry/nextjs";
import { resolveSentryTracesSampleRate } from "@/lib/sentry-traces-sample-rate";

const dsn =
  process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: process.env.NODE_ENV !== "production",
    tracesSampleRate: resolveSentryTracesSampleRate("node"),
    includeLocalVariables: true,
    enableLogs: true,
    /** Verbose výstup SDK do konzole (lokálně / staging). */
    debug: process.env.SENTRY_DEBUG === "true",
    ignoreErrors: [/has no method ['"]updateFrom['"]/, /sentry\/scripts\//i],
  });
}
