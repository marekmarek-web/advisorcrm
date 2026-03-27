import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || "https://www.aidvisora.cz/prihlaseni?native=1";
const isHttpServer = /^http:\/\//i.test(serverUrl);

const config: CapacitorConfig = {
  appId: "cz.aidvisora.app",
  appName: "Aidvisora",
  webDir: "capacitor-app",
  server: {
    url: serverUrl,
    cleartext: isHttpServer,
    androidScheme: "https",
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
  // Ikony / splash: `pnpm cap:assets` (zdroj native loga `logos/Aidvisora logo A.png` v generate-brand-assets.mjs).
};

export default config;
