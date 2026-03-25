"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./primitives";

type Props = { children: ReactNode };

type State = { hasError: boolean; message: string };

export class MobileShellErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Něco se pokazilo." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MobileShellErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-4 pt-4 pb-6">
          <ErrorState
            title={this.state.message}
            onRetry={() => this.setState({ hasError: false, message: "" })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
