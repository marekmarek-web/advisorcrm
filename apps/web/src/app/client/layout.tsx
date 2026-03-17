import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { ClientSidebar } from "./ClientSidebar";
import { getPortalNotificationsUnreadCount } from "@/app/actions/portal-notifications";
import "@/styles/weplan-monday.css";

export default async function ClientZoneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAuth();
  if (auth.roleName !== "Client") {
    redirect("/portal");
  }

  const unreadNotificationsCount = await getPortalNotificationsUnreadCount();

  return (
    <div className="flex min-h-screen bg-monday-bg">
      <ClientSidebar unreadNotificationsCount={unreadNotificationsCount} />
      <div className="flex flex-col flex-1 min-w-0 ml-12 md:ml-[200px]">
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
