"use client";

/**
 * Minimal WebView / native shell bridge for Aidvisora embedded in iOS WKWebView,
 * Android WebView, or iframe hosts. No-op safe on plain web.
 *
 * Native side: listen to `window.addEventListener("message", ...)` for
 * `{ source: "aidvisora-web", ... }` payloads, or iOS `WKScriptMessageHandler`.
 */

export const AIDVISORA_WEB_MESSAGE_SOURCE = "aidvisora-web" as const;

export type AidvisoraWebviewOutbound =
  | { source: typeof AIDVISORA_WEB_MESSAGE_SOURCE; type: "route"; pathname: string; search: string }
  | { source: typeof AIDVISORA_WEB_MESSAGE_SOURCE; type: "ready"; href: string };

export function postToNativeShell(payload: AidvisoraWebviewOutbound): void {
  if (typeof window === "undefined") return;
  try {
    window.parent?.postMessage(payload, "*");
  } catch {
    /* ignore */
  }
  try {
    const w = window as Window & {
      ReactNativeWebView?: { postMessage: (msg: string) => void };
      webkit?: { messageHandlers?: { aidvisora?: { postMessage: (msg: unknown) => void } } };
    };
    const serialized = JSON.stringify(payload);
    w.ReactNativeWebView?.postMessage(serialized);
    w.webkit?.messageHandlers?.aidvisora?.postMessage(payload);
  } catch {
    /* ignore */
  }
}

export function notifyRouteForWebview(pathname: string, search: string = ""): void {
  if (typeof window === "undefined") return;
  postToNativeShell({
    source: AIDVISORA_WEB_MESSAGE_SOURCE,
    type: "route",
    pathname,
    search: search.startsWith("?") ? search : search ? `?${search}` : "",
  });
}

export function notifyWebviewReady(): void {
  if (typeof window === "undefined") return;
  postToNativeShell({
    source: AIDVISORA_WEB_MESSAGE_SOURCE,
    type: "ready",
    href: window.location.href,
  });
}
