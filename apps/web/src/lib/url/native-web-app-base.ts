/**
 * Base URL for full document navigations from native (Capacitor) OAuth handlers.
 * On iOS, `window.location.origin` can be `capacitor://localhost` (or similar) while
 * the visible app still loads from the remote server — using it yields a blank WebView.
 */
export function getNativeWebAppBaseUrl(): string {
  for (const raw of [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    const s = (raw ?? "").trim().replace(/\/$/, "");
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
  }

  if (typeof window !== "undefined") {
    const { protocol, origin } = window.location;
    if (protocol === "http:" || protocol === "https:") return origin;
  }

  return "https://www.aidvisora.cz";
}
