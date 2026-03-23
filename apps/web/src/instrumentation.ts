export async function register() {
  await import("./env");

  // When @sentry/nextjs is installed and SENTRY_DSN is set, uncomment:
  // if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
  //   const Sentry = await import("@sentry/nextjs");
  //   Sentry.init({
  //     dsn: process.env.SENTRY_DSN,
  //     environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  //     tracesSampleRate: 0.2,
  //   });
  // }
}
