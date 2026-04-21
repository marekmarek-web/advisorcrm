"use client";

/**
 * Delta A9+A11 — klientská část version gate.
 *
 * Volat po startu Capacitor shellu — pokud app vrátí `forceUpdate: true`, UI zobrazí
 * non-dismissable modal s odkazem do storu (viz `ForceUpdateGate` komponenta).
 *
 * Call path:
 *   1. App se otevře → Capacitor.getInfo() vrátí version.
 *   2. fetch /api/app-version/check?platform=ios&version=1.2.3.
 *   3. Pokud forceUpdate → vykreslit modal, zablokovat interakci.
 *   4. Pokud softUpdate → vykreslit tenký banner s tlačítkem "Aktualizovat".
 *
 * Platform "web" nikdy netriggeruje gate (env nemá definovány web verze).
 */

import { App as CapacitorApp } from "@capacitor/app";
import { getPlatform, isNativePlatform } from "./platform";

export type VersionCheckResult = {
  ok: true;
  platform: "ios" | "android" | "web";
  clientVersion: string;
  current: string | null;
  minimum: string | null;
  forceUpdate: boolean;
  softUpdate: boolean;
  storeUrl: string | null;
  messageCs: string;
};

export type VersionCheckError = { ok: false; error: string };

export async function getNativeAppVersion(): Promise<string | null> {
  if (!isNativePlatform()) return null;
  try {
    const info = await CapacitorApp.getInfo();
    return info.version ?? null;
  } catch {
    return null;
  }
}

export async function checkAppVersion(
  opts?: { origin?: string },
): Promise<VersionCheckResult | VersionCheckError | null> {
  if (!isNativePlatform()) return null;

  const platform = getPlatform();
  if (platform === "web") return null;

  const version = await getNativeAppVersion();
  if (!version) {
    return { ok: false, error: "Unable to read native app version" };
  }

  const origin =
    opts?.origin ??
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://aidvisora.cz");

  try {
    const res = await fetch(
      `${origin}/api/app-version/check?platform=${platform}&version=${encodeURIComponent(version)}`,
      {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
      },
    );
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return (await res.json()) as VersionCheckResult;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
