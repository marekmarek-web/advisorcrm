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
        <div className="px-4 pt-4 pb-6">
          <ErrorState
            title="Nepodařilo se načíst tuto obrazovku"
            description={friendly}
            onRetry={() => this.setState({ hasError: false, error: null })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
