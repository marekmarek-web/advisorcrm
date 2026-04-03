import type { ClientAdvisorInfo } from "@/app/actions/client-dashboard";
import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";
import type { ContractRow } from "@/app/actions/contracts";
import type { DocumentRow } from "@/app/actions/documents";
import type { PaymentInstruction } from "@/app/actions/payment-pdf";
import type { PortalNotificationRow } from "@/app/actions/portal-notifications";
import type { ClientHouseholdDetail } from "@/app/actions/households";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import type { MaterialRequestListItem } from "@/lib/advisor-material-requests/display";
import type { ClientPortalSessionBundle } from "@/lib/client-portal/client-portal-session-bundle.model";

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
  /** Stejný zdroj jako web dashboard (`getPaymentInstructionsForContact`). */
  paymentInstructions: PaymentInstruction[];
  /** Stejný zdroj jako web (`listClientMaterialRequests`). */
  advisorMaterialRequests: MaterialRequestListItem[];
  /** 5G: Stejná finanční analýza jako web dashboard. */
  financialSummaryRaw: ClientFinancialSummaryView | null;
};

export function toClientMobileInitialData(bundle: ClientPortalSessionBundle): ClientMobileInitialData {
  const c = bundle.contact;
  return {
    contactId: bundle.contactId,
    fullName: bundle.fullName,
    advisor: bundle.advisor,
    profile: c
      ? {
          firstName: c.firstName ?? "",
          lastName: c.lastName ?? "",
          email: c.email,
          phone: c.phone,
          street: c.street,
          city: c.city,
          zip: c.zip,
        }
      : null,
    quickStats: bundle.quickStats,
    requests: bundle.requests,
    contracts: bundle.contracts,
    documents: bundle.documents,
    notifications: bundle.notifications,
    household: bundle.household,
    unreadNotificationsCount: bundle.unreadNotificationsCount,
    unreadMessagesCount: bundle.unreadMessagesCount,
    paymentInstructions: bundle.paymentInstructions,
    advisorMaterialRequests: bundle.advisorMaterialRequests,
    financialSummaryRaw: bundle.financialSummaryRaw ?? null,
  };
}
