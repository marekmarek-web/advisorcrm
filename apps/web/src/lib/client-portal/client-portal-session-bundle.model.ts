/**
 * Read-model types for the client portal session bundle (web + mobile).
 * Kept separate from `client-portal-session-bundle.ts` so tests and client code can import
 * without pulling `server-only` / DB loaders.
 */
import type { ClientAdvisorInfo } from "@/app/actions/client-dashboard";
import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";
import type { ContractRow } from "@/app/actions/contracts";
import type { DocumentRow } from "@/app/actions/documents";
import type { ClientHouseholdDetail } from "@/app/actions/households";
import type { PaymentInstruction } from "@/app/actions/payment-pdf";
import type { PortalNotificationRow } from "@/app/actions/portal-notifications";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import type { MaterialRequestListItem } from "@/lib/advisor-material-requests/display";

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
