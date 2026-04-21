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

const CONSUMED_CODE_KEY = "aidv.native_oauth.consumed_code";
const CONSUMED_CODE_OUTCOME_KEY = "aidv.native_oauth.consumed_code_outcome";

type ConsumedOutcome = { outcome: "ok" | "error"; message?: string };

function readConsumedCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(CONSUMED_CODE_KEY);
  } catch {
    return null;
  }
}

function writeConsumedCode(code: string, outcome: ConsumedOutcome) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CONSUMED_CODE_KEY, code);
    window.sessionStorage.setItem(CONSUMED_CODE_OUTCOME_KEY, JSON.stringify(outcome));
  } catch {
    /* ignore */
  }
}

function readConsumedOutcome(): ConsumedOutcome | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CONSUMED_CODE_OUTCOME_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsumedOutcome;
  } catch {
    return null;
  }
}

function safeReplaceLocation(target: string) {
  if (typeof window === "undefined") return;
  // Avoid firing navigations while tab is backgrounded — causes NSURLErrorDomain -999.
  if (typeof document !== "undefined" && document.visibilityState && document.visibilityState !== "visible") {
    logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] skip navigate — document hidden:", target);
    return;
  }
  if (window.location.href === target) return;
  window.location.replace(target);
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
            // One-shot guard: never re-exchange the same code across WebView reloads.
            const previousCode = readConsumedCode();
            if (previousCode === code) {
              const outcome = readConsumedOutcome();
              logNativeOAuthDebug(
                "[NativeOAuthDeepLinkBridge] code already consumed, short-circuit:",
                outcome?.outcome ?? "unknown",
              );
              if (outcome?.outcome === "ok") {
                // Only redirect if we aren't already on the portal; otherwise stay put.
                try {
                  const supabase = createClient();
                  const { data } = await supabase.auth.getSession();
                  if (data?.session) {
                    // Session exists — do nothing, we're in the app.
                    return;
                  }
                } catch {
                  /* ignore */
                }
                safeReplaceLocation(`${origin}/portal/today`);
              } else if (outcome?.outcome === "error") {
                safeReplaceLocation(
                  `${origin}/prihlaseni?error=${encodeURIComponent(outcome.message ?? "auth_failed")}`,
                );
              }
              return;
            }

            logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] exchanging auth code…");
            try {
              const supabase = createClient();
              const { error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) {
                console.error("[NativeOAuthDeepLinkBridge] exchangeCodeForSession error:", error.message);
                writeConsumedCode(code, { outcome: "error", message: error.message });
                const target = `${origin}/prihlaseni?error=${encodeURIComponent(error.message)}`;
                logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] navigating to error page:", target);
                safeReplaceLocation(target);
                return;
              }
              writeConsumedCode(code, { outcome: "ok" });
              const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
              if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
                const nextPath = "/portal/today";
                const mfaUrl = `${origin}/prihlaseni?pending_mfa=1&native=1&next=${encodeURIComponent(nextPath)}`;
                logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] MFA required, navigating to:", mfaUrl);
                safeReplaceLocation(mfaUrl);
                return;
              }
              const target = `${origin}/register/complete?next=%2Fportal%2Ftoday`;
              logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] session exchanged OK, navigating to:", target);
              safeReplaceLocation(target);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "session_exchange_failed";
              console.error("[NativeOAuthDeepLinkBridge] unexpected error during code exchange:", e);
              writeConsumedCode(code, { outcome: "error", message: msg });
              const target = `${origin}/prihlaseni?error=${encodeURIComponent(msg)}`;
              safeReplaceLocation(target);
            }
            return;
          }
          logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] auth/callback without code, navigating to portal");
          safeReplaceLocation(`${origin}/portal/today`);
          return;
        }

        if (parsed.host === "auth" && parsed.pathname === "/error") {
          const msg = parsed.searchParams.get("message") || "auth_failed";
          console.warn("[NativeOAuthDeepLinkBridge] auth error deep link:", msg);
          safeReplaceLocation(`${origin}/prihlaseni?error=${encodeURIComponent(msg)}`);
          return;
        }

        if (parsed.host === "auth" && (parsed.pathname === "/done" || parsed.pathname === "/done/")) {
          logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] auth/done, navigating to portal");
          safeReplaceLocation(`${origin}/portal/today`);
          return;
        }

        const hostPart = parsed.host ? `/${parsed.host}` : "";
        const path = `${hostPart}${parsed.pathname}`.replace(/\/{2,}/g, "/");
        const normalized = path.startsWith("/") ? path : `/${path}`;
        const target = `${origin}${normalized}${parsed.search}${parsed.hash}`;
        logNativeOAuthDebug("[NativeOAuthDeepLinkBridge] generic deep link, navigating to:", target);
        safeReplaceLocation(target);
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
