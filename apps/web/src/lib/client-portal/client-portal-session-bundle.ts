import "server-only";

import { cache } from "react";
import { advisorPreferences, and, contacts, eq } from "db";
import { withTenantContext } from "@/lib/db/with-tenant-context";
import { listClientMaterialRequests } from "@/app/actions/advisor-material-requests";
import {
  listClientAdvisorProposals,
  type ClientAdvisorProposal,
} from "@/app/actions/advisor-proposals-client";
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
import { getClientVisiblePortfolioDocumentNames, getDocumentsForClient } from "@/app/actions/documents";
import { getClientHouseholdForContact, type ClientHouseholdDetail } from "@/app/actions/households";
import { getUnreadAdvisorMessagesForClientCount } from "@/app/actions/messages";
import type { PaymentInstruction } from "@/app/actions/payment-pdf";
import { getPaymentInstructionsForContact } from "@/app/actions/payment-pdf";
import {
  getPortalNotificationsForClient,
  getPortalNotificationsUnreadCount,
  type PortalNotificationRow,
} from "@/app/actions/portal-notifications";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import type { MaterialRequestListItem } from "@/lib/advisor-material-requests/display";
import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";
import { buildPortalFvContractAuxMap } from "@/lib/client-portfolio/portal-portfolio-fv-precompute";
import type { ClientPortalSessionBundle } from "./client-portal-session-bundle.model";

export type {
  ClientPortalContactRow,
  ClientPortalSessionBundle,
} from "./client-portal-session-bundle.model";

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
    paymentsResult,
    advisorMaterialRequests,
    financialSummaryRaw,
    advisor,
    advisorProposals,
  ] = await Promise.all([
    withTenantContext({ tenantId: auth.tenantId, userId: auth.userId }, (tx) =>
      tx
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
    ),
    getClientDashboardMetrics(contactId)
      .then((rows) => ({ ok: true as const, rows }))
      .catch(() => ({ ok: false as const, rows: emptyQuickStats })),
    getClientRequests().catch(() => [] as ClientRequestItem[]),
    getClientPortfolioForContact(contactId).catch(() => [] as ContractRow[]),
    getDocumentsForClient(contactId).catch(() => [] as DocumentRow[]),
    getPortalNotificationsForClient().catch(() => [] as PortalNotificationRow[]),
    // Household read-only projection: returns null if contact has no household membership.
    // Company contacts (organizations table) cannot reach Client Zone, so no cross-entity guard needed.
    getClientHouseholdForContact(contactId).catch(() => null),
    getUnreadAdvisorMessagesForClientCount().catch(() => 0),
    getPortalNotificationsUnreadCount().catch(() => 0),
    getPaymentInstructionsForContact(contactId).then((rows) => ({ ok: true as const, rows })).catch(() => ({ ok: false as const, rows: [] as PaymentInstruction[] })),
    listClientMaterialRequests().catch(() => [] as MaterialRequestListItem[]),
    getClientFinancialSummaryForContact(contactId).catch(() => MISSING_FINANCIAL_SUMMARY),
    getAssignedAdvisorForClient(contactId).catch(() => null),
    listClientAdvisorProposals().catch(() => [] as ClientAdvisorProposal[]),
  ]);

  const fullName = contactRows
    ? `${contactRows.firstName ?? ""} ${contactRows.lastName ?? ""}`.trim() || "Klient"
    : "Klient";

  const portfolioSourceDocIds = [
    ...new Set(contracts.map((c) => c.sourceDocumentId).filter((id): id is string => Boolean(id))),
  ];
  const visiblePortfolioSourceDocs =
    portfolioSourceDocIds.length > 0
      ? await getClientVisiblePortfolioDocumentNames(contactId, portfolioSourceDocIds).catch(
          () => ({}) as Record<string, { name: string }>,
        )
      : {};
  const advisorBookingRow = advisor
    ? await withTenantContext({ tenantId: auth.tenantId, userId: auth.userId }, (tx) =>
        tx
          .select({
            enabled: advisorPreferences.publicBookingEnabled,
            token: advisorPreferences.publicBookingToken,
          })
          .from(advisorPreferences)
          .where(
            and(
              eq(advisorPreferences.tenantId, auth.tenantId),
              eq(advisorPreferences.userId, advisor.userId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0] ?? null),
      ).catch(() => null)
    : null;
  const advisorBookingToken =
    advisorBookingRow?.enabled && advisorBookingRow.token?.trim()
      ? advisorBookingRow.token.trim()
      : null;

  return {
    tenantId: auth.tenantId,
    contactId,
    fullName,
    contact: contactRows,
    advisor,
    advisorBookingPath: advisorBookingToken ? `/rezervace/${encodeURIComponent(advisorBookingToken)}` : null,
    quickStats: quickStats.rows,
    quickStatsLoadFailed: !quickStats.ok,
    requests,
    contracts,
    documents,
    notifications,
    household,
    unreadNotificationsCount,
    unreadMessagesCount,
    paymentInstructions: paymentsResult.rows,
    paymentsLoadFailed: !paymentsResult.ok,
    advisorMaterialRequests,
    financialSummaryRaw,
    visiblePortfolioSourceDocs,
    advisorProposals,
    fvContractAux: buildPortalFvContractAuxMap(contracts),
  };
});
