import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "db";
import { contacts } from "db";
import { eq, and } from "db";
import { getContractsByContact } from "@/app/actions/contracts";
import { getDocumentsForClient } from "@/app/actions/documents";
import { getPaymentInstructionsForContact } from "@/app/actions/payment-pdf";
import { getClientRequests } from "@/app/actions/client-portal-requests";
import { getPortalNotificationsForClient } from "@/app/actions/portal-notifications";
import { getClientDashboardMetrics } from "@/app/actions/client-dashboard";
import { getClientFinancialSummaryForContact } from "@/app/actions/client-financial-summary";
import { ClientDashboardLayout } from "./ClientDashboardLayout";

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
  ] = await Promise.all([
    getContractsByContact(auth.contactId),
    getDocumentsForClient(auth.contactId),
    getPaymentInstructionsForContact(auth.contactId),
    getClientRequests(),
    getClientDashboardMetrics(auth.contactId),
    getPortalNotificationsForClient(),
    getClientFinancialSummaryForContact(auth.contactId),
  ]);

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

  const openRequests = requestsList.filter((r) => r.statusKey !== "done");
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
              body: latestNotification.body,
            }
          : null
      }
      financialSummary={financialSummary}
    />
  );
}
