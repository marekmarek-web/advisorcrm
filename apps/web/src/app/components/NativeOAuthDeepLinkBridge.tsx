"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

function toAppPath(deepLinkUrl: string): string | null {
  try {
    const parsed = new URL(deepLinkUrl);
    if (parsed.protocol !== "aidvisor:" && parsed.protocol !== "aidvisora:") return null;

    // aidvisora://auth/done → go to portal after OAuth
    if (parsed.host === "auth" && (parsed.pathname === "/done" || parsed.pathname === "/done/")) {
      return "/portal/today";
    }

    // aidvisora://auth/callback → legacy deep link, also go to portal
    if (parsed.host === "auth" && parsed.pathname.startsWith("/callback")) {
      return "/portal/today";
    }

    const hostPart = parsed.host ? `/${parsed.host}` : "";
    const normalizedPath = `${hostPart}${parsed.pathname}`.replace(/\/{2,}/g, "/");
    const path = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
    return `${path}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function NativeOAuthDeepLinkBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let removeListener: (() => void) | null = null;

    const handleOpenUrl = (url: string) => {
      const route = toAppPath(url);
      if (!route) return;
      Browser.close().catch(() => {
        // Browser may already be closed; ignore.
      });
      const target = `${window.location.origin}${route}`;
      if (window.location.href !== target) {
        window.location.href = target;
      }
    };

    (async () => {
      const launchUrl = await App.getLaunchUrl();
      if (launchUrl?.url) handleOpenUrl(launchUrl.url);

      const listener = await App.addListener("appUrlOpen", (event) => {
        handleOpenUrl(event.url);
      });

      if (disposed) listener.remove();
      else removeListener = () => listener.remove();
    })();

    return () => {
      disposed = true;
      if (removeListener) removeListener();
    };
  }, []);

  return null;
}
