import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { PortalShell } from "./PortalShell";
import "@/styles/weplan-monday.css";
import "@/styles/board.css";

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
    redirect(`/?error=${encodeURIComponent(safe)}`);
  }
  if (auth.roleName === "Client") {
    redirect("/client");
  }
  return <PortalShell roleName={auth.roleName}>{children}</PortalShell>;
}
