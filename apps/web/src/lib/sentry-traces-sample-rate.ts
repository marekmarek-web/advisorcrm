/** Optional override for staging diagnostics: SENTRY_TRACES_SAMPLE_RATE / NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE (0–1). */
export function resolveSentryTracesSampleRate(surface: "browser" | "node"): number {
  const raw =
    surface === "browser"
      ? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
      : process.env.SENTRY_TRACES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number.parseFloat(String(raw));
    if (!Number.isNaN(n) && n >= 0 && n <= 1) return n;
  }
  return process.env.NODE_ENV === "development" ? 1.0 : 0.1;
}
