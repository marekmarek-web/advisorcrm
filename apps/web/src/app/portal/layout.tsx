import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { PortalShell } from "./PortalShell";
import "@/styles/weplan-monday.css";
import "@/styles/board.css";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAuth();
  if (auth.roleName === "Client") {
    redirect("/client");
  }
  return <PortalShell>{children}</PortalShell>;
}
