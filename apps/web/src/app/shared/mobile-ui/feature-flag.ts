import type { RequestCookies } from "next/dist/compiled/@edge-runtime/cookies";

export const MOBILE_UI_BETA_COOKIE = "mobile_ui_v1_beta";

export type MobileUiMode = "off" | "beta" | "on";

export function getMobileUiMode(): MobileUiMode {
  const raw = (process.env.MOBILE_UI_V1_MODE ?? "beta").toLowerCase();
  if (raw === "on" || raw === "beta" || raw === "off") return raw;
  return "beta";
}

export function isLikelyMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /iphone|ipod|android.+mobile|android(?!.*tablet)|mobile|windows phone|opera mini|blackberry/i.test(ua);
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
