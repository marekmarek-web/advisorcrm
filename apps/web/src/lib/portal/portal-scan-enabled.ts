/**
 * Vypnutí vícestránkového skenu v portálu (menu + /portal/scan).
 * Vercel: NEXT_PUBLIC_PORTAL_SCAN_ENABLED=false — základní nahrání v dokumentech zůstane.
 */
export function isPortalMultiPageScanEnabled(): boolean {
  if (typeof process.env.NEXT_PUBLIC_PORTAL_SCAN_ENABLED === "undefined") return true;
  const v = process.env.NEXT_PUBLIC_PORTAL_SCAN_ENABLED.trim().toLowerCase();
  if (v === "" || v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}
