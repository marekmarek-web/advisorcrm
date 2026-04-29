/**
 * Base URL for full document navigations from native (Capacitor) OAuth handlers.
 *
 * On iOS, `window.location.origin` returns `capacitor://localhost` while the
 * WebView actually serves a remote HTTPS page via Capacitor's `server.url` —
 * navigating to that origin yields a blank WebView.
 *
 * Priority order:
 *   1. Current local WebView http(s) origin for native dev builds
 *   2. NEXT_PUBLIC_APP_URL  (build-time env, set this on Vercel)
 *   3. NEXT_PUBLIC_SITE_URL (build-time env, fallback)
 *   4. window.location.origin only if it is a real http(s) origin
 *   5. Hard-coded production domain
 */
export function getNativeWebAppBaseUrl(): string {
  const runtimeHttpOrigin =
    typeof window !== "undefined" && (window.location.protocol === "http:" || window.location.protocol === "https:")
      ? window.location.origin
      : "";
  const runtimeHostname = typeof window !== "undefined" ? window.location.hostname : "";
  if (runtimeHttpOrigin && isLocalHostname(runtimeHostname)) {
    return runtimeHttpOrigin;
  }

  for (const raw of [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    const s = (raw ?? "").trim().replace(/\/$/, "");
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
  }

  if (runtimeHttpOrigin) {
    return runtimeHttpOrigin;
  }

  if (typeof window !== "undefined") {
    const { protocol, origin } = window.location;
    // Explicitly reject capacitor:// and ionic:// origins from WKWebView
    if (protocol === "capacitor:" || protocol === "ionic:") {
      console.warn(
        "[NativeWebApp] window.location.protocol is",
        protocol,
        "— falling back to hardcoded production URL. Set NEXT_PUBLIC_APP_URL on Vercel to fix this."
      );
    }
  }

  return "https://www.aidvisora.cz";
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
