import type { RequestCookies } from "next/dist/compiled/@edge-runtime/cookies";

/**
 * Rozdělení portálu (produktová volba):
 * – Mobile UI v1: vlastní shell ([MobilePortalClient]) + [DashboardScreen] na /portal/today — bez pravého
 *   slide-over kalendáře z desktopové nástěnky; kalendář je /portal/calendar a souhrn „Dnes“ na nástěnce.
 * – Vypnuto: [PortalShell] + [DashboardEditable] včetně [DashboardCalendarSidePanel].
 */
export const MOBILE_UI_BETA_COOKIE = "mobile_ui_v1_beta";

export type MobileUiMode = "off" | "beta" | "on";

export function getMobileUiMode(): MobileUiMode {
  const raw = (process.env.MOBILE_UI_V1_MODE ?? "beta").toLowerCase();
  if (raw === "on" || raw === "beta" || raw === "off") return raw;
  return "beta";
}

export function isLikelyMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  // `; wv)` = Android System WebView (Capacitor / in-app browser) — must count as mobile shell even without "Mobile" in UA.
  // `android(?!.*tablet)` still lets many phones/tablets through; tablets with "Tablet" in model often match `android.+mobile` via "Mobile Safari".
  return /iphone|ipod|ipad|android.+mobile|android(?!.*tablet)|;\s*wv\)|mobile|windows phone|opera mini|blackberry/i.test(ua);
}

export function isMobileUiV1EnabledForRequest({
  userAgent,
  cookieStore,
}: {
  userAgent: string | null | undefined;
  cookieStore: Pick<RequestCookies, "get">;
}): boolean {
  const mode = getMobileUiMode();
  if (mode === "off") return false;
  if (mode === "on") return true;
  if (cookieStore.get(MOBILE_UI_BETA_COOKIE)?.value === "1") return true;
  return isLikelyMobileUserAgent(userAgent);
}
