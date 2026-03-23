import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    // Na klientu není VERCEL_ENV; volitelně nastav NEXT_PUBLIC_SENTRY_ENVIRONMENT (např. preview / production).
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ?? process.env.NODE_ENV,
    sendDefaultPii: true,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
    integrations: [Sentry.replayIntegration()],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
