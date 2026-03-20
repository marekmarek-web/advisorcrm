import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || "https://www.aidvisora.cz/prihlaseni";
const isHttpServer = /^http:\/\//i.test(serverUrl);

const config: CapacitorConfig = {
  appId: "cz.aidvisor.app", // TODO: replace with final production bundle id.
  appName: "Aidvisor",
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
  // TODO(phase-2): configure branded icons/splash/status bar plugin settings.
};

export default config;
