import "server-only";

import { cache } from "react";
import { and, contacts, db, eq } from "db";
import { listClientMaterialRequests } from "@/app/actions/advisor-material-requests";
import {
  getAssignedAdvisorForClient,
  getClientDashboardMetrics,
  type ClientAdvisorInfo,
} from "@/app/actions/client-dashboard";
import { getClientFinancialSummaryForContact } from "@/app/actions/client-financial-summary";
import { getClientRequests } from "@/app/actions/client-portal-requests";
import type { ContractRow } from "@/app/actions/contracts";
import { getClientPortfolioForContact } from "@/app/actions/contracts";
import type { DocumentRow } from "@/app/actions/documents";
import { getDocumentsForClient } from "@/app/actions/documents";
import { getClientHouseholdForContact, type ClientHouseholdDetail } from "@/app/actions/households";
import { getUnreadAdvisorMessagesForClientCount } from "@/app/actions/messages";
import type { PaymentInstruction } from "@/app/actions/payment-pdf";
import { getPaymentInstructionsForContact } from "@/app/actions/payment-pdf";
/**
 * Phase 3E — Payment publish bridge integration point.
 *
 * Current state (Phase 3): getPaymentInstructionsForContact() reads from
 * contracts → payment_accounts (legacy static mapping). client_payment_setups
 * (populated by AI Review apply) is NOT yet exposed to the client portal.
 *
 * Phase 5 bridge (future): Replace or supplement getPaymentInstructionsForContact()
 * with a query on client_payment_setups WHERE status = 'active'.
 * The `clientVisibility` field in /api/clients/[id]/payment-setups signals readiness.
 *
 * Acceptance conditions for Phase 5:
 * - client_payment_setups.status = 'active' after advisor approval
 * - client_payment_setups.needsHumanReview = false
 * - Integration test: AI Review apply → payment setup → visible in client portal payments tab
 */
import {
  getPortalNotificationsForClient,
  getPortalNotificationsUnreadCount,
  type PortalNotificationRow,
} from "@/app/actions/portal-notifications";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import type { MaterialRequestListItem } from "@/lib/advisor-material-requests/display";
import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";

const MISSING_FINANCIAL_SUMMARY: ClientFinancialSummaryView = {
  primaryAnalysisId: null,
  scope: "contact",
  householdName: null,
  status: "missing",
  updatedAt: null,
  lastExportedAt: null,
  goals: [],
  goalsCount: 0,
  income: 0,
  expenses: 0,
  surplus: 0,
  assets: 0,
  liabilities: 0,
  netWorth: 0,
  reserveOk: false,
  reserveGap: 0,
  priorities: [],
  gaps: [],
};

/** Jeden řádek kontaktu pro klientský portál (dashboard + mobilní profil). */
export type ClientPortalContactRow = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  notificationUnsubscribedAt: Date | null;
};

/**
 * Jednotný read-model pro klientskou zónu (web + mobil).
 *
 * Source of truth (stejné server actions jako dříve):
 * - Požadavky (opportunities): `getClientRequests`
 * - Oznámení v centru + badge v headeru: `portal_notifications` přes `getPortalNotificationsForClient` / `getPortalNotificationsUnreadCount`
 * - Nepřečtené zprávy od poradce: `getUnreadAdvisorMessagesForClientCount`
 * - Portfolio / dokumenty / domácnost / platby / podklady od poradce: příslušné akce v jednom paralelním načtení
 */
export type ClientPortalSessionBundle = {
  tenantId: string;
  contactId: string;
  fullName: string;
  contact: ClientPortalContactRow | null;
  advisor: ClientAdvisorInfo | null;
  quickStats: {
    assetsUnderManagement: number;
    monthlyInvestments: number;
    monthlyInsurancePremiums: number;
    activeContractCount: number;
  };
  requests: ClientRequestItem[];
  contracts: ContractRow[];
  documents: DocumentRow[];
  notifications: PortalNotificationRow[];
  household: ClientHouseholdDetail | null;
  unreadNotificationsCount: number;
  unreadMessagesCount: number;
  paymentInstructions: PaymentInstruction[];
  advisorMaterialRequests: MaterialRequestListItem[];
  financialSummaryRaw: ClientFinancialSummaryView;
};

const emptyQuickStats = {
  assetsUnderManagement: 0,
  monthlyInvestments: 0,
  monthlyInsurancePremiums: 0,
  activeContractCount: 0,
};

/**
 * Načte kompletní session bundle pro přihlášeného klienta.
 * `cache()` — jedno načtení na HTTP request (např. layout + page v budoucnu).
 */
export const loadClientPortalSessionBundle = cache(async function loadClientPortalSessionBundle(): Promise<ClientPortalSessionBundle> {
  const auth = await requireClientZoneAuth();
  if (auth.roleName !== "Client" || !auth.contactId) {
    throw new Error("Client portal bundle: expected Client role with contactId");
  }
  const contactId = auth.contactId;

  const [
    contactRows,
    quickStats,
    requests,
    contracts,
    documents,
    notifications,
    household,
    unreadMessagesCount,
    unreadNotificationsCount,
    paymentInstructions,
    advisorMaterialRequests,
    financialSummaryRaw,
    advisor,
  ] = await Promise.all([
    db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        street: contacts.street,
        city: contacts.city,
        zip: contacts.zip,
        notificationUnsubscribedAt: contacts.notificationUnsubscribedAt,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getClientDashboardMetrics(contactId).catch(() => emptyQuickStats),
    getClientRequests().catch(() => [] as ClientRequestItem[]),
    getClientPortfolioForContact(contactId).catch(() => [] as ContractRow[]),
    getDocumentsForClient(contactId).catch(() => [] as DocumentRow[]),
    getPortalNotificationsForClient().catch(() => [] as PortalNotificationRow[]),
    getClientHouseholdForContact(contactId).catch(() => null),
    getUnreadAdvisorMessagesForClientCount().catch(() => 0),
    getPortalNotificationsUnreadCount().catch(() => 0),
    getPaymentInstructionsForContact(contactId).catch(() => [] as PaymentInstruction[]),
    listClientMaterialRequests().catch(() => [] as MaterialRequestListItem[]),
    getClientFinancialSummaryForContact(contactId).catch(() => MISSING_FINANCIAL_SUMMARY),
    getAssignedAdvisorForClient(contactId).catch(() => null),
  ]);

  const fullName = contactRows
    ? `${contactRows.firstName ?? ""} ${contactRows.lastName ?? ""}`.trim() || "Klient"
    : "Klient";

  return {
    tenantId: auth.tenantId,
    contactId,
    fullName,
    contact: contactRows,
    advisor,
    quickStats,
    requests,
    contracts,
    documents,
    notifications,
    household,
    unreadNotificationsCount,
    unreadMessagesCount,
    paymentInstructions,
    advisorMaterialRequests,
    financialSummaryRaw,
  };
});
