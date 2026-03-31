"use client";

import { useEffect } from "react";
import { captureAppError, getPortalFriendlyErrorMessage } from "@/lib/observability/production-error-ui";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const displayMessage = getPortalFriendlyErrorMessage(error);

  useEffect(() => {
    const route = typeof window !== "undefined" ? window.location.pathname : undefined;
    captureAppError(error, {
      boundary: "global",
      route,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="cs">
      <body className="min-h-dvh bg-background text-foreground antialiased flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-xl">!</span>
          </div>
          <h1 className="text-lg font-semibold mb-2">Něco se pokazilo</h1>
          <p className="text-sm text-muted-foreground mb-6">{displayMessage}</p>
          {process.env.NODE_ENV !== "production" && error.digest ? (
            <p className="text-[10px] text-muted-foreground mb-4 font-mono break-all">digest: {error.digest}</p>
          ) : null}
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              className="rounded-md px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90"
              onClick={() => window.location.reload()}
            >
              Obnovit stránku
            </button>
            <a
              href="/portal/today"
              className="rounded-md px-4 py-2 text-sm font-semibold text-muted-foreground bg-muted hover:bg-muted/80 inline-flex items-center justify-center"
            >
              Přehled portálu
            </a>
            <a
              href="/"
              className="rounded-md px-4 py-2 text-sm font-semibold text-muted-foreground bg-muted hover:bg-muted/80 inline-flex items-center justify-center"
            >
              Úvodní stránka
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
