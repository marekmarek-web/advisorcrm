"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";
import { getNativeWebAppBaseUrl } from "@/lib/url/native-web-app-base";

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

    const handleOpenUrl = async (rawUrl: string) => {
      console.log("[NativeOAuthDeepLinkBridge] received URL:", rawUrl);

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        console.warn("[NativeOAuthDeepLinkBridge] failed to parse URL:", rawUrl);
        return;
      }

      if (parsed.protocol !== "aidvisor:" && parsed.protocol !== "aidvisora:") {
        return;
      }

      await Browser.close().catch(() => {});
      // Let SFSafariViewController dismiss before we navigate the main WebView (iOS white screen otherwise).
      if (Capacitor.getPlatform() === "ios") {
        await new Promise((r) => setTimeout(r, 350));
      }

      const origin = getNativeWebAppBaseUrl();
      console.log("[NativeOAuthDeepLinkBridge] resolved origin:", origin, "| window.location.origin:", typeof window !== "undefined" ? window.location.origin : "N/A");

      // ── Auth callback with code → exchange client-side ──
      if (
        parsed.host === "auth" &&
        parsed.pathname.startsWith("/callback")
      ) {
        const code = parsed.searchParams.get("code");
        if (code) {
          console.log("[NativeOAuthDeepLinkBridge] exchanging auth code…");
          try {
            const supabase = createClient();
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              console.error("[NativeOAuthDeepLinkBridge] exchangeCodeForSession error:", error.message);
              const target = `${origin}/prihlaseni?error=${encodeURIComponent(error.message)}`;
              console.log("[NativeOAuthDeepLinkBridge] navigating to error page:", target);
              window.location.replace(target);
              return;
            }
            const target = `${origin}/register/complete?next=%2Fportal%2Ftoday`;
            console.log("[NativeOAuthDeepLinkBridge] session exchanged OK, navigating to:", target);
            window.location.replace(target);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "session_exchange_failed";
            console.error("[NativeOAuthDeepLinkBridge] unexpected error during code exchange:", e);
            const target = `${origin}/prihlaseni?error=${encodeURIComponent(msg)}`;
            window.location.replace(target);
          }
          return;
        }
        // No code – fall through to portal
        console.log("[NativeOAuthDeepLinkBridge] auth/callback without code, navigating to portal");
        window.location.replace(`${origin}/portal/today`);
        return;
      }

      // ── Auth error ──
      if (parsed.host === "auth" && parsed.pathname === "/error") {
        const msg = parsed.searchParams.get("message") || "auth_failed";
        console.warn("[NativeOAuthDeepLinkBridge] auth error deep link:", msg);
        window.location.replace(`${origin}/prihlaseni?error=${encodeURIComponent(msg)}`);
        return;
      }

      // ── Auth done (legacy deep link) ──
      if (
        parsed.host === "auth" &&
        (parsed.pathname === "/done" || parsed.pathname === "/done/")
      ) {
        console.log("[NativeOAuthDeepLinkBridge] auth/done, navigating to portal");
        window.location.replace(`${origin}/portal/today`);
        return;
      }

      // ── Generic deep link → map to in-app path ──
      const hostPart = parsed.host ? `/${parsed.host}` : "";
      const path = `${hostPart}${parsed.pathname}`.replace(/\/{2,}/g, "/");
      const normalized = path.startsWith("/") ? path : `/${path}`;
      const target = `${origin}${normalized}${parsed.search}${parsed.hash}`;
      console.log("[NativeOAuthDeepLinkBridge] generic deep link, navigating to:", target);
      if (window.location.href !== target) {
        window.location.replace(target);
      }
    };

    (async () => {
      try {
        const launchUrl = await App.getLaunchUrl();
        console.log("[NativeOAuthDeepLinkBridge] launch URL:", launchUrl?.url ?? "(none)");
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
