import { formatPortalNotificationBody } from "@/lib/client-portal/format-portal-notification-body";
import { loadClientPortalSessionBundle } from "@/lib/client-portal/client-portal-session-bundle";
import { mapFinancialSummaryForClientDashboard } from "@/lib/client-portal/map-financial-summary-for-dashboard";
import { getEffectiveTenantSettingsForWorkspaceResolved } from "@/lib/billing/effective-workspace";
import { getCachedSupabaseUser } from "@/lib/auth/require-auth";
import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import { ClientCoverageWidget } from "@/app/components/contacts/ClientCoverageWidget";
import { ClientDashboardLayout } from "./ClientDashboardLayout";
import { ClientWelcomeView } from "./ClientWelcomeView";

export default async function ClientZonePage() {
  const bundle = await loadClientPortalSessionBundle();
  // B2.4: Service requests flag musí respektovat i dashboard CTA, ne jen sidebar/requests page.
  const auth = await requireClientZoneAuth();
  const supabaseUser = await getCachedSupabaseUser().catch(() => null);
  const portalSettingsResult = await getEffectiveTenantSettingsForWorkspaceResolved({
    tenantId: auth.tenantId,
    userId: auth.userId,
    email: supabaseUser?.email ?? null,
  }).catch(() => null);
  const serviceRequestsEnabled =
    portalSettingsResult?.settings?.["client_portal.allow_service_requests"] ?? true;

  const contact = bundle.contact ?? undefined;
  const isUnsubscribed = !!contact?.notificationUnsubscribedAt;

  const contractsList = bundle.contracts;
  const documentsList = bundle.documents;
  const paymentInstructions = bundle.paymentInstructions;
  const requestsList = bundle.requests;
  const quickStats = bundle.quickStats;
  const notifications = bundle.notifications;
  const advisor = bundle.advisor;
  const advisorMaterialRequests = bundle.advisorMaterialRequests;

  const isFirstRun = contractsList.length === 0 && documentsList.length === 0;

  if (isFirstRun) {
    return (
      <ClientWelcomeView
        firstName={contact?.firstName || "Kliente"}
        advisorName={advisor?.fullName}
        advisorEmail={advisor?.email}
        advisorInitials={advisor?.initials}
      />
    );
  }

  const financialSummary = mapFinancialSummaryForClientDashboard(bundle.financialSummaryRaw);

  const openRequests = requestsList.filter(
    (r) => r.statusKey !== "done" && r.statusKey !== "cancelled"
  );
  const latestNotification = notifications[0] ?? null;

  return (
    <ClientDashboardLayout
      contact={
        contact
          ? {
              firstName: contact.firstName ?? "",
              lastName: contact.lastName ?? "",
              email: contact.email,
            }
          : undefined
      }
      isUnsubscribed={isUnsubscribed}
      authContactId={bundle.contactId}
      quickStats={quickStats}
      openRequests={openRequests}
      contractsCount={contractsList.length}
      paymentInstructionsCount={paymentInstructions.length}
      paymentsLoadFailed={bundle.paymentsLoadFailed}
      quickStatsLoadFailed={bundle.quickStatsLoadFailed}
      documentsCount={documentsList.length}
      latestNotification={
        latestNotification
          ? {
              title: latestNotification.title,
              body: formatPortalNotificationBody(
                latestNotification.type,
                latestNotification.body
              ),
              type: latestNotification.type,
              relatedEntityId: latestNotification.relatedEntityId ?? undefined,
            }
          : null
      }
      financialSummary={financialSummary}
      advisorMaterialRequests={advisorMaterialRequests.filter(
        (r) => r.status !== "done" && r.status !== "closed"
      )}
      advisorProposals={bundle.advisorProposals}
      serviceRequestsEnabled={serviceRequestsEnabled}
      coverageSection={<ClientCoverageWidget contactId={bundle.contactId} readOnly />}
    />
  );
}
