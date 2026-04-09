"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";
import { getNativeWebAppBaseUrl } from "@/lib/url/native-web-app-base";

function logNativeOAuthDebug(...args: unknown[]) {
  if (process.env.NODE_ENV !== "development") return;
  console.log(...args);
}

/**
 * Listens for deep-link events on native platforms and handles:
 *
 *   aidvisora://auth/callback?code=…  →  exchange code client-side, navigate to /portal
 *   aidvisora://auth/error?message=…  →  show error on login page
 *   aidvisora://auth/done             →  legacy, navigate to /portal
 *   aidvisora://<any-path>            →  navigate to that path inside the WebView
 *
 * Mounted once in the root layout so it's always active.
 */
export function NativeOAuthDeepLinkBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let removeListener: (() => void) | null = null;
    let handlerInFlight = false;
    let lastHandledUrl = "";
    let lastHandledAt = 0;
    const DEDUPE_MS = 900;

    const handleOpenUrl = async (rawUrl: string) => {
      if (disposed) return;
      const now = Date.now();
      if (rawUrl === lastHandledUrl && now - lastHandledAt < DEDUPE_MS) {
        logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] skip duplicate URL within window");
        return;
      }
      if (handlerInFlight) {
        logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] skip; previous handler still running");
        return;
      }
      handlerInFlight = true;
      logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] received URL:", rawUrl);

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        console.warn("[NativeOAuthDeepLinkBridge] failed to parse URL:", rawUrl);
        handlerInFlight = false;
        return;
      }

      if (parsed.protocol !== "aidvisor:" && parsed.protocol !== "aidvisora:") {
        handlerInFlight = false;
        return;
      }

      lastHandledUrl = rawUrl;
      lastHandledAt = Date.now();

      try {
        await Browser.close().catch(() => {});
        // Let in-app browser / SFSafariViewController finish dismissing before WebView navigates (reduces white screen).
        const platform = Capacitor.getPlatform();
        if (platform === "ios") {
          await new Promise((r) => setTimeout(r, 450));
        } else if (platform === "android") {
          await new Promise((r) => setTimeout(r, 160));
        }

        const origin = getNativeWebAppBaseUrl();
        logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] resolved origin:", origin, "| window.location.origin:", typeof window !== "undefined" ? window.location.origin : "N/A");

        // ── Auth callback with code → exchange client-side ──
        if (parsed.host === "auth" && parsed.pathname.startsWith("/callback")) {
          const code = parsed.searchParams.get("code");
          if (code) {
            logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] exchanging auth code…");
            try {
              const supabase = createClient();
              const { error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) {
                console.error("[NativeOAuthDeepLinkBridge] exchangeCodeForSession error:", error.message);
                const target = `${origin}/prihlaseni?error=${encodeURIComponent(error.message)}`;
                logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] navigating to error page:", target);
                window.location.replace(target);
                return;
              }
              const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
              if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
                const nextPath = "/portal/today";
                const mfaUrl = `${origin}/prihlaseni?pending_mfa=1&native=1&next=${encodeURIComponent(nextPath)}`;
                logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] MFA required, navigating to:", mfaUrl);
                window.location.replace(mfaUrl);
                return;
              }
              const target = `${origin}/register/complete?next=%2Fportal%2Ftoday`;
              logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] session exchanged OK, navigating to:", target);
              window.location.replace(target);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "session_exchange_failed";
              console.error("[NativeOAuthDeepLinkBridge] unexpected error during code exchange:", e);
              const target = `${origin}/prihlaseni?error=${encodeURIComponent(msg)}`;
              window.location.replace(target);
            }
            return;
          }
          logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] auth/callback without code, navigating to portal");
          window.location.replace(`${origin}/portal/today`);
          return;
        }

        if (parsed.host === "auth" && parsed.pathname === "/error") {
          const msg = parsed.searchParams.get("message") || "auth_failed";
          console.warn("[NativeOAuthDeepLinkBridge] auth error deep link:", msg);
          window.location.replace(`${origin}/prihlaseni?error=${encodeURIComponent(msg)}`);
          return;
        }

        if (parsed.host === "auth" && (parsed.pathname === "/done" || parsed.pathname === "/done/")) {
          logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] auth/done, navigating to portal");
          window.location.replace(`${origin}/portal/today`);
          return;
        }

        const hostPart = parsed.host ? `/${parsed.host}` : "";
        const path = `${hostPart}${parsed.pathname}`.replace(/\/{2,}/g, "/");
        const normalized = path.startsWith("/") ? path : `/${path}`;
        const target = `${origin}${normalized}${parsed.search}${parsed.hash}`;
        logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] generic deep link, navigating to:", target);
        if (window.location.href !== target) {
          window.location.replace(target);
        }
      } finally {
        handlerInFlight = false;
      }
    };

    (async () => {
      try {
        const launchUrl = await App.getLaunchUrl();
        logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] launch URL:", launchUrl?.url ?? "(none)");
        if (launchUrl?.url) await handleOpenUrl(launchUrl.url);

        const listener = await App.addListener("appUrlOpen", (event) => {
          void handleOpenUrl(event.url);
        });

        if (disposed) listener.remove();
        else removeListener = () => listener.remove();
      } catch (e) {
        console.error("[NativeOAuthDeepLinkBridge] init failed", e);
      }
    })();

    return () => {
      disposed = true;
      if (removeListener) removeListener();
    };
  }, []);

  return null;
}
