import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "db";
import { contacts } from "db";
import { eq, and } from "db";
import { getClientPortfolioForContact } from "@/app/actions/contracts";
import { getDocumentsForClient } from "@/app/actions/documents";
import { getPaymentInstructionsForContact } from "@/app/actions/payment-pdf";
import { getClientRequests } from "@/app/actions/client-portal-requests";
import { getPortalNotificationsForClient } from "@/app/actions/portal-notifications";
import { formatPortalNotificationBody } from "@/lib/client-portal/format-portal-notification-body";
import { getClientDashboardMetrics } from "@/app/actions/client-dashboard";
import { getClientFinancialSummaryForContact } from "@/app/actions/client-financial-summary";
import { getAssignedAdvisorForClient } from "@/app/actions/client-dashboard";
import { listClientMaterialRequests } from "@/app/actions/advisor-material-requests";
import { ClientDashboardLayout } from "./ClientDashboardLayout";
import { ClientWelcomeView } from "./ClientWelcomeView";

export default async function ClientZonePage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const [contact] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      notificationUnsubscribedAt: contacts.notificationUnsubscribedAt,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, auth.contactId)))
    .limit(1);

  const isUnsubscribed = !!contact?.notificationUnsubscribedAt;

  const [
    contractsList,
    documentsList,
    paymentInstructions,
    requestsList,
    quickStats,
    notifications,
    financialSummaryRaw,
    advisor,
    advisorMaterialRequests,
  ] = await Promise.all([
    getClientPortfolioForContact(auth.contactId),
    getDocumentsForClient(auth.contactId),
    getPaymentInstructionsForContact(auth.contactId),
    getClientRequests(),
    getClientDashboardMetrics(auth.contactId),
    getPortalNotificationsForClient(),
    getClientFinancialSummaryForContact(auth.contactId),
    getAssignedAdvisorForClient(auth.contactId).catch(() => null),
    listClientMaterialRequests().catch(() => []),
  ]);

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

  const financialSummary =
    financialSummaryRaw.status === "missing" || !financialSummaryRaw.primaryAnalysisId
      ? null
      : {
          scope: financialSummaryRaw.scope,
          householdName: financialSummaryRaw.householdName,
          income: financialSummaryRaw.income,
          expenses: financialSummaryRaw.expenses,
          surplus: financialSummaryRaw.surplus,
          assets: financialSummaryRaw.assets,
          liabilities: financialSummaryRaw.liabilities,
          netWorth: financialSummaryRaw.netWorth,
          reserveOk: financialSummaryRaw.reserveOk,
          priorities: financialSummaryRaw.priorities,
          gaps: financialSummaryRaw.gaps,
          goalsCount: financialSummaryRaw.goalsCount,
        };

  const openRequests = requestsList.filter(
    (r) => r.statusKey !== "done" && r.statusKey !== "cancelled"
  );
  const latestNotification = notifications[0] ?? null;

  return (
    <ClientDashboardLayout
      contact={contact ?? undefined}
      isUnsubscribed={isUnsubscribed}
      authContactId={auth.contactId}
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
