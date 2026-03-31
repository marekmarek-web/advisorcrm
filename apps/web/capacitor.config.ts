import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || "https://www.aidvisora.cz/prihlaseni?native=1";
const isHttpServer = /^http:\/\//i.test(serverUrl);

/**
 * Hostnames whose URLs should stay inside the WKWebView / Android WebView.
 * Without this, Capacitor's navigation policy does a string prefix match on
 * `server.url` — since that includes a path, any navigation to a different
 * path on the same domain would open Safari instead of staying in-app.
 */
function deriveAllowedHosts(url: string): string[] {
  const hosts = new Set(["www.aidvisora.cz", "aidvisora.cz"]);
  try { hosts.add(new URL(url).hostname); } catch {}
  return [...hosts];
}

const config: CapacitorConfig = {
  appId: "cz.aidvisora.app",
  appName: "Aidvisora",
  webDir: "capacitor-app",
  server: {
    url: serverUrl,
    cleartext: isHttpServer,
    androidScheme: "https",
    allowNavigation: deriveAllowedHosts(serverUrl),
  },
  ios: {
    contentInset: "always",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: isHttpServer,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== "production",
  },
  // Ikony / splash: `pnpm cap:assets` (zdroj `logos/Aidvisora logo new fav.png` v generate-brand-assets.mjs).
};

export default config;
