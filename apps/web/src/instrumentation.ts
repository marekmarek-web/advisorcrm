import * as Sentry from "@sentry/nextjs";

export async function register() {
  await import("./env");

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Zachytí neošetřené chyby requestů na serveru (vyžaduje @sentry/nextjs ≥ 8.28). */
export const onRequestError = Sentry.captureRequestError;
