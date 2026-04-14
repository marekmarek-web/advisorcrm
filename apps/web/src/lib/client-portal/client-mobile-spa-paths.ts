/**
 * Jednotná logika „mobilní SPA vs. App Router children“ pro klientskou zónu.
 * Musí být shodná s rozhodnutím v `src/app/client/layout.tsx` a s únikem z SPA
 * v `ClientMobileClient` (full-page reload na non-SPA cesty).
 */

/** Bez query, bez koncového lomítka (kromě kořene). */
export function normalizeClientPathname(pathname: string): string {
  const raw = pathname.split("?")[0] || "";
  if (!raw || raw === "/") return "/client";
  let path = raw.startsWith("/") ? raw : `/${raw}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

/**
 * True, pokud má běžet `ClientMobileApp` (mobilní shell bez `children`).
 * Kalkulačky, platby, detaily požadavků poradce atd. → false.
 */
export function isClientMobileSpaPath(pathname: string): boolean {
  const path = normalizeClientPathname(pathname);
  if (path === "/client") return true;
  if (
    path === "/client/messages" ||
    path === "/client/documents" ||
    path === "/client/profile" ||
    path === "/client/notifications" ||
    path === "/client/requests" ||
    path === "/client/payments"
  ) {
    return true;
  }
  if (path.startsWith("/client/portfolio") || path.startsWith("/client/contracts")) {
    return true;
  }
  return false;
}
