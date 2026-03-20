import { and, contacts, db, eq } from "db";
import { getClientDashboardMetrics, type ClientAdvisorInfo } from "@/app/actions/client-dashboard";
import { getClientRequests } from "@/app/actions/client-portal-requests";
import { getContractsByContact, type ContractRow } from "@/app/actions/contracts";
import { getDocumentsForClient, type DocumentRow } from "@/app/actions/documents";
import {
  getPortalNotificationsForClient,
  getPortalNotificationsUnreadCount,
  type PortalNotificationRow,
} from "@/app/actions/portal-notifications";
import { getClientHouseholdForContact, type ClientHouseholdDetail } from "@/app/actions/households";
import { getUnreadAdvisorMessagesForClientCount } from "@/app/actions/messages";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import { Suspense } from "react";
import { ClientMobileClient } from "./ClientMobileClient";

export type ClientMobileInitialData = {
  contactId: string;
  fullName: string;
  advisor: ClientAdvisorInfo | null;
  profile: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    street: string | null;
    city: string | null;
    zip: string | null;
  } | null;
  quickStats: {
    assetsUnderManagement: number;
    monthlyInvestments: number;
    riskCoveragePercent: number;
  };
  requests: ClientRequestItem[];
  contracts: ContractRow[];
  documents: DocumentRow[];
  notifications: PortalNotificationRow[];
  household: ClientHouseholdDetail | null;
  unreadNotificationsCount: number;
  unreadMessagesCount: number;
};

export async function ClientMobileApp({
  contactId,
  fullName,
  unreadNotificationsCount,
  advisor,
}: {
  contactId: string;
  fullName: string;
  unreadNotificationsCount: number;
  advisor: ClientAdvisorInfo | null;
}) {
  const [profile, quickStats, requests, contracts, documents, notifications, household, unreadMessagesCount] =
    await Promise.all([
      db
        .select({
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          street: contacts.street,
          city: contacts.city,
          zip: contacts.zip,
        })
        .from(contacts)
        .where(and(eq(contacts.id, contactId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getClientDashboardMetrics(contactId).catch(() => ({
        assetsUnderManagement: 0,
        monthlyInvestments: 0,
        riskCoveragePercent: 0,
      })),
      getClientRequests().catch(() => []),
      getContractsByContact(contactId).catch(() => []),
      getDocumentsForClient(contactId).catch(() => []),
      getPortalNotificationsForClient().catch(() => []),
      getClientHouseholdForContact(contactId).catch(() => null),
      getUnreadAdvisorMessagesForClientCount().catch(() => 0),
    ]);

  const unreadNotifications = await getPortalNotificationsUnreadCount().catch(() => unreadNotificationsCount);

  const initialData: ClientMobileInitialData = {
    contactId,
    fullName,
    advisor,
    profile,
    quickStats,
    requests,
    contracts,
    documents,
    notifications,
    household,
    unreadNotificationsCount: unreadNotifications,
    unreadMessagesCount,
  };

  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-slate-500 text-sm p-6">
          Načítám…
        </div>
      }
    >
      <ClientMobileClient initialData={initialData} />
    </Suspense>
  );
}
