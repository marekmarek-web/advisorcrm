import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { requireAuth } from "@/lib/auth/require-auth";
import { getContactsCount } from "@/app/actions/contacts";
import { PortalShell } from "./PortalShell";
import { MobilePortalApp } from "./mobile/MobilePortalApp";
import { isMobileUiV1EnabledForRequest } from "@/app/shared/mobile-ui/feature-flag";
import "@/styles/weplan-monday.css";
import "@/styles/board.css";
import "@/styles/monday.css";
import "@/styles/weplan-calendar.css";

/** Portal je vždy dynamický – vyžaduje auth a DB, neprerenderovat při buildu. */
export const dynamic = "force-dynamic";

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let auth;
  try {
    auth = await requireAuth();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    const isDbError =
      msg.includes("connect") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("authentication") ||
      msg.includes("MaxClients") ||
      msg.includes("max clients") ||
      msg.toLowerCase().includes("pool");
    const safe = isDbError ? "database_error" : "auth_error";
    redirect(`/prihlaseni?error=${encodeURIComponent(safe)}`);
  }
  if (auth.roleName === "Client") {
    redirect("/client");
  }
  const headerList = await headers();
  if (auth.roleName === "Advisor") {
    const pathname = headerList.get("x-pathname");
    let contactsCount = -1;
    try {
      contactsCount = await getContactsCount();
    } catch {
      contactsCount = -1;
    }
    if (pathname && !pathname.startsWith("/portal/setup") && contactsCount === 0) {
      redirect("/portal/setup");
    }
  }
  const showTeamOverview = auth.roleName === "Admin" || auth.roleName === "Director" || auth.roleName === "Manager" || auth.roleName === "Advisor";
  const cookieStore = await cookies();
  const mobileUiEnabled = isMobileUiV1EnabledForRequest({
    userAgent: headerList.get("user-agent"),
    cookieStore,
  });
  if (mobileUiEnabled) {
    return <MobilePortalApp showTeamOverview={showTeamOverview} />;
  }
  return <PortalShell showTeamOverview={showTeamOverview}>{children}</PortalShell>;
}
