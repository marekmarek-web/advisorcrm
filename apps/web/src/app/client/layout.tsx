import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { requireAuth } from "@/lib/auth/require-auth";
import { getPortalNotificationsUnreadCount } from "@/app/actions/portal-notifications";
import { getAssignedAdvisorForClient } from "@/app/actions/client-dashboard";
import { isMobileUiV1EnabledForRequest } from "@/app/shared/mobile-ui/feature-flag";
import { db, contacts, and, eq } from "db";
import { ClientPortalShell } from "./ClientPortalShell";
import { ClientMobileApp } from "./mobile/ClientMobileApp";
import "./client-portal.css";

export default async function ClientZoneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAuth();
  if (auth.roleName !== "Client") {
    redirect("/portal");
  }

  const [unreadNotificationsCount, contact, advisor] = await Promise.all([
    getPortalNotificationsUnreadCount(),
    auth.contactId
      ? db
          .select({
            firstName: contacts.firstName,
            lastName: contacts.lastName,
          })
          .from(contacts)
          .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, auth.contactId)))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    auth.contactId ? getAssignedAdvisorForClient(auth.contactId).catch(() => null) : Promise.resolve(null),
  ]);

  const fullName = contact
    ? `${contact.firstName} ${contact.lastName}`.trim()
    : "Klient";

  const headerList = await headers();
  const cookieStore = await cookies();
  const mobileUiEnabled = isMobileUiV1EnabledForRequest({
    userAgent: headerList.get("user-agent"),
    cookieStore,
  });

  if (mobileUiEnabled && auth.contactId) {
    return (
      <ClientMobileApp
        contactId={auth.contactId}
        fullName={fullName}
        unreadNotificationsCount={unreadNotificationsCount}
        advisor={advisor}
      />
    );
  }

  return (
    <ClientPortalShell
      unreadNotificationsCount={unreadNotificationsCount}
      fullName={fullName}
      advisor={advisor}
    >
      {children}
    </ClientPortalShell>
  );
}
