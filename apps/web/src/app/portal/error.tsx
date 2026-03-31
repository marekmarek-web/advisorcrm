"use client";

import { useEffect } from "react";
import { captureAppError, getPortalFriendlyErrorMessage } from "@/lib/observability/production-error-ui";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const displayMessage = getPortalFriendlyErrorMessage(error);

  useEffect(() => {
    const route = typeof window !== "undefined" ? window.location.pathname : undefined;
    captureAppError(error, {
      boundary: "portal-route",
      route,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="rounded-lg border border-monday-border bg-monday-surface p-8 max-w-md text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <span className="text-red-500 text-xl">!</span>
        </div>
        <h2 className="text-lg font-semibold text-monday-text mb-2">Něco se pokazilo</h2>
        <p className="text-monday-text-muted text-sm mb-4">{displayMessage}</p>
        {process.env.NODE_ENV !== "production" && error.digest ? (
          <p className="text-[10px] text-monday-text-muted mb-4 font-mono break-all">digest: {error.digest}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90"
          >
            Zkusit znovu
          </button>
          <a
            href="/portal/today"
            className="rounded-[6px] px-4 py-2 text-sm font-semibold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)]"
          >
            Přehled portálu
          </a>
          <a
            href="/"
            className="rounded-[6px] px-4 py-2 text-sm font-semibold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)]"
          >
            Úvodní stránka
          </a>
        </div>
      </div>
    </div>
  );
}
