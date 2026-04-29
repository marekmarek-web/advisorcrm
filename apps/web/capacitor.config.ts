import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Dev přes lokální Next.js (`pnpm dev` na Macu):
 *
 * – Simulátor: často stačí `CAPACITOR_SERVER_URL=http://127.0.0.1:3000/prihlaseni?native=1` + `pnpm cap:sync`.
 * – Fyzický iPhone: `localhost` / `127.0.0.1` odkazuje na telefon samotný → WKWebView hlásí `-1004` (Could not connect).
 *   Nastavte IP vašeho Macu v LAN (např. `http://192.168.1.42:3000/prihlaseni?native=1`), Mac i telefon na stejné Wi‑Fi,
 *   firewall povolit Node :3000, pak znovu `pnpm cap sync` / build v Xcode.
 *
 * Produkční host ve výchozím stavu — viz `NEXT_PUBLIC_SITE_URL` / deployment.
 */

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || "https://www.aidvisora.cz/prihlaseni?native=1";
const isHttpServer = /^http:\/\//i.test(serverUrl);
const isProduction = process.env.NODE_ENV === "production";

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
    /**
     * automatic: méně časté zdvojení safe-area oproti CSS env(safe-area-inset-*), které už používá webový shell.
     * RTIInputSystemClient / WebKit logy v Xcode jsou většinou systémový šum u textarea ve WKWebView, ne stack trace aplikace.
     */
    contentInset: "automatic",
    allowsLinkPreview: false,
    /**
     * false: zakáže nativní scroll/bounce celého WKWebView dokumentu.
     * Elementy s CSS overflow: auto/scroll scrollují dál — WKWebView bounce jen na root scrollu.
     * Tím eliminujeme "gumový" scroll nad/pod app view při overscrollu.
     */
    scrollEnabled: false,
    /**
     * Keep App-Bound Domains disabled. With a remotely hosted Capacitor app,
     * iOS can otherwise refuse Capacitor's user-script injection ("frame is not
     * in an app-bound domain"), which breaks plugin calls and OAuth deep-link
     * handling in the Google sign-in flow.
     */
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: isHttpServer,
    /**
     * captureInput: false — we want the WebView to bubble hardware-keyboard
     * shortcuts (Cmd+F, arrow keys inside native text fields, Bluetooth
     * keyboard shortcuts). The previous `true` value blocked Android IME
     * behaviour in some OEM keyboards that rely on capturing input at the
     * Activity level. The back-button is still handled via the shared
     * native-back-stack on the web side.
     */
    captureInput: false,
    webContentsDebuggingEnabled: !isProduction,
  },
  // Ikony / splash: `pnpm cap:assets` (zdroj `logos/Aidvisora logo new fav.png` v generate-brand-assets.mjs).
};

export default config;
