import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { requireClientZoneAuth, getCachedSupabaseUser } from "@/lib/auth/require-auth";
import { getPortalNotificationsUnreadCount } from "@/app/actions/portal-notifications";
import { getAssignedAdvisorForClient } from "@/app/actions/client-dashboard";
import { getUnreadAdvisorMessagesForClientCount } from "@/app/actions/messages";
import { getActiveAdvisorProposalCountForClient } from "@/app/actions/advisor-proposals-client";
import { isMobileUiV1EnabledForRequest } from "@/app/shared/mobile-ui/feature-flag";
import { getEffectiveTenantSettingsForWorkspaceResolved } from "@/lib/billing/effective-workspace";
import { db, contacts, and, eq } from "db";
import { ClientPortalShell } from "./ClientPortalShell";
import { ClientMobileApp } from "./mobile/ClientMobileApp";
import { MaintenanceBanner } from "@/app/components/MaintenanceBanner";
import { isClientMobileSpaPath } from "@/lib/client-portal/client-mobile-spa-paths";
import "./client-portal.css";

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

export default async function ClientZoneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let auth;
  try {
    auth = await requireClientZoneAuth();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect("/prihlaseni?error=auth_error");
  }

  const headerList = await headers();
  const cookieStore = await cookies();
  const mobileUiEnabled = isMobileUiV1EnabledForRequest({
    userAgent: headerList.get("user-agent"),
    cookieStore,
  });
  const pathname = headerList.get("x-pathname") ?? "";
  const useMobileSpa = pathname === "" || isClientMobileSpaPath(pathname);

  if (mobileUiEnabled && auth.contactId && useMobileSpa) {
    return <ClientMobileApp />;
  }

  const supabaseUser = await getCachedSupabaseUser().catch(() => null);
  const portalSettingsResult = await getEffectiveTenantSettingsForWorkspaceResolved({
    tenantId: auth.tenantId,
    userId: auth.userId,
    email: supabaseUser?.email ?? null,
  }).catch(() => null);
  const portalFeatures = {
    messagingEnabled: portalSettingsResult?.settings?.["client_portal.allow_messaging"] ?? true,
    serviceRequestsEnabled: portalSettingsResult?.settings?.["client_portal.allow_service_requests"] ?? true,
  };

  let unreadNotificationsCount = 0;
  let unreadMessagesCount = 0;
  let activeProposalsCount = 0;
  let contact: { firstName: string | null; lastName: string | null } | null = null;
  let advisor: Awaited<ReturnType<typeof getAssignedAdvisorForClient>> = null;
  try {
    [unreadNotificationsCount, unreadMessagesCount, activeProposalsCount, contact, advisor] = await Promise.all([
      getPortalNotificationsUnreadCount(),
      // 5F: include unread messages in bell total
      auth.contactId ? getUnreadAdvisorMessagesForClientCount().catch(() => 0) : Promise.resolve(0),
      auth.contactId ? getActiveAdvisorProposalCountForClient().catch(() => 0) : Promise.resolve(0),
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
  } catch {
    unreadNotificationsCount = 0;
    unreadMessagesCount = 0;
    activeProposalsCount = 0;
    contact = null;
    advisor = null;
  }

  const fullName = contact
    ? `${contact.firstName} ${contact.lastName}`.trim()
    : "Klient";

  return (
    <>
      {/* Delta A23 — client portal maintenance banner (Edge Config kill-switch). */}
      <MaintenanceBanner />
      <ClientPortalShell
        unreadNotificationsCount={unreadNotificationsCount + unreadMessagesCount}
        unreadMessagesCount={unreadMessagesCount}
        activeProposalsCount={activeProposalsCount}
        fullName={fullName}
        advisor={advisor}
        portalFeatures={portalFeatures}
      >
        {children}
      </ClientPortalShell>
    </>
  );
}
