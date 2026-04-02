import { formatPortalNotificationBody } from "@/lib/client-portal/format-portal-notification-body";
import { loadClientPortalSessionBundle } from "@/lib/client-portal/client-portal-session-bundle";
import { mapFinancialSummaryForClientDashboard } from "@/lib/client-portal/map-financial-summary-for-dashboard";
import { ClientDashboardLayout } from "./ClientDashboardLayout";
import { ClientWelcomeView } from "./ClientWelcomeView";

export default async function ClientZonePage() {
  const bundle = await loadClientPortalSessionBundle();

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
      documentsCount={documentsList.length}
      latestNotification={
        latestNotification
          ? {
              title: latestNotification.title,
              body: formatPortalNotificationBody(
                latestNotification.type,
                latestNotification.body
              ),
            }
          : null
      }
      financialSummary={financialSummary}
      advisorMaterialRequests={advisorMaterialRequests.filter(
        (r) => r.status !== "done" && r.status !== "closed"
      )}
    />
  );
}
