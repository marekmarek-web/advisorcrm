"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./primitives";
import { captureAppError, getPortalFriendlyErrorMessage } from "@/lib/observability/production-error-ui";

type Props = { children: ReactNode };

type State = { hasError: boolean; error: (Error & { digest?: string }) | null };

export class MobileShellErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error as Error & { digest?: string } };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MobileShellErrorBoundary]", error, info.componentStack);
    const route = typeof window !== "undefined" ? window.location.pathname : undefined;
    captureAppError(error, {
      boundary: "mobile-shell",
      route,
      digest: (error as Error & { digest?: string }).digest,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const friendly = getPortalFriendlyErrorMessage(this.state.error);
      return (
        <div className="px-4 pt-4 pb-6 space-y-3">
          <ErrorState
            title="Nepodařilo se načíst tuto obrazovku"
            description={friendly}
            onRetry={() => this.setState({ hasError: false, error: null })}
          />
          <p className="text-center text-[11px] text-[color:var(--wp-text-tertiary)] px-2">
            Pokud problém přetrvává, obnovte celou stránku — někdy pomůže vyprázdnění rozbitého stavu v prohlížeči.
          </p>
          <div className="flex justify-center">
            <button
              type="button"
              className="min-h-[40px] px-4 rounded-xl border border-[color:var(--wp-surface-card-border)] text-xs font-bold text-[color:var(--wp-text-secondary)]"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Obnovit celou stránku
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
