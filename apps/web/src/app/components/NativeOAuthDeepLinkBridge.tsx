"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";

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
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return;
      }

      if (parsed.protocol !== "aidvisor:" && parsed.protocol !== "aidvisora:") {
        return;
      }

      Browser.close().catch(() => {});

      const origin = window.location.origin;

      // ── Auth callback with code → exchange client-side ──
      if (
        parsed.host === "auth" &&
        parsed.pathname.startsWith("/callback")
      ) {
        const code = parsed.searchParams.get("code");
        if (code) {
          try {
            const supabase = createClient();
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              window.location.href = `${origin}/prihlaseni?error=${encodeURIComponent(error.message)}`;
              return;
            }
            window.location.href = `${origin}/register/complete?next=%2Fportal%2Ftoday`;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "session_exchange_failed";
            window.location.href = `${origin}/prihlaseni?error=${encodeURIComponent(msg)}`;
          }
          return;
        }
        // No code – fall through to portal
        window.location.href = `${origin}/portal/today`;
        return;
      }

      // ── Auth error ──
      if (parsed.host === "auth" && parsed.pathname === "/error") {
        const msg = parsed.searchParams.get("message") || "auth_failed";
        window.location.href = `${origin}/prihlaseni?error=${encodeURIComponent(msg)}`;
        return;
      }

      // ── Auth done (legacy deep link) ──
      if (
        parsed.host === "auth" &&
        (parsed.pathname === "/done" || parsed.pathname === "/done/")
      ) {
        window.location.href = `${origin}/portal/today`;
        return;
      }

      // ── Generic deep link → map to in-app path ──
      const hostPart = parsed.host ? `/${parsed.host}` : "";
      const path = `${hostPart}${parsed.pathname}`.replace(/\/{2,}/g, "/");
      const normalized = path.startsWith("/") ? path : `/${path}`;
      const target = `${origin}${normalized}${parsed.search}${parsed.hash}`;
      if (window.location.href !== target) {
        window.location.href = target;
      }
    };

    (async () => {
      try {
        const launchUrl = await App.getLaunchUrl();
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
