/**
 * Read-model types for the client portal session bundle (web + mobile).
 * Kept separate from `client-portal-session-bundle.ts` so tests and client code can import
 * without pulling `server-only` / DB loaders.
 */
import type { ClientAdvisorProposal } from "@/app/actions/advisor-proposals-client";
import type { ClientAdvisorInfo } from "@/app/actions/client-dashboard";
import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";
import type { ContractRow } from "@/app/actions/contracts";
import type { DocumentRow } from "@/app/actions/documents";
import type { ClientHouseholdDetail } from "@/app/actions/households";
import type { PaymentInstruction } from "@/app/actions/payment-pdf";
import type { PortalNotificationRow } from "@/app/actions/portal-notifications";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import type { MaterialRequestListItem } from "@/lib/advisor-material-requests/display";
import type { PortalFvContractAuxMap } from "@/lib/client-portfolio/portal-portfolio-fv-precompute.types";

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
  /** Interní cesta na veřejnou rezervaci poradce, jen pokud má poradce booking aktivní. */
  advisorBookingPath: string | null;
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
  /** True when payment instructions failed to load — prevents false empty state in portal. */
  paymentsLoadFailed: boolean;
  /** True when dashboard metrics query failed — prevents silent zero display on dashboard. */
  quickStatsLoadFailed: boolean;
  advisorMaterialRequests: MaterialRequestListItem[];
  financialSummaryRaw: ClientFinancialSummaryView;
  /** Jen dokumenty zveřejněné klientovi — pro odkaz „související dokument“ v portfoliu (web + mobil). */
  visiblePortfolioSourceDocs: Record<string, { name: string }>;
  /** Návrhy od poradce publikované do Klientské zóny (aktivní + historické, bez withdrawn/draft). */
  advisorProposals: ClientAdvisorProposal[];
  /**
   * Server-předpočítané FV/logo pomocné hodnoty pro `contracts` — umožňuje
   * klientskému bundlu obejít se bez `BASE_FUNDS` (viz
   * `portal-portfolio-fv-precompute.ts` a `shared-future-value-pure.ts`).
   * Klíč = `contract.id`.
   */
  fvContractAux: PortalFvContractAuxMap;
};
