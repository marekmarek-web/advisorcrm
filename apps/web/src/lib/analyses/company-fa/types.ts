/**
 * Types for corporate (company) financial analysis.
 * Aligned with PHASE1_AUDIT and FA s.r.o. hlavní.html payload.
 */

export type CompanyIndustry =
  | "office"
  | "services"
  | "light-manufacturing"
  | "heavy-manufacturing"
  | "construction"
  | "transport";

export interface CompanyFaCompany {
  name: string;
  ico: string;
  industry: CompanyIndustry | string;
  employees: number;
  cat3: number;
  avgWage: number;
  topClient: number;
}

export interface DirectorBenefits {
  dps: boolean;
  dip: boolean;
  izp: boolean;
  amountMonthly: number;
}

export interface CompanyFaDirector {
  name: string;
  age: number | null;
  share: number;
  hasSpouse: boolean;
  childrenCount: number;
  incomeType: "employee" | "osvc";
  netIncome: number;
  savings: number; // 0 | 500000 | 2000000
  goal: "security" | "rent" | "tax";
  benefits: DirectorBenefits;
  paysFromOwn: boolean;
  paysFromOwnAmount: number;
  hasOldPension: boolean;
}

export interface CompanyFaFinance {
  revenue: number;
  profit: number;
  reserve: number;
  loanPayment: number;
}

export interface CompanyFaBenefits {
  dps: boolean;
  dip: boolean;
  izp: boolean;
  amount: number;
  count: number;
  directorsAmount: number;
}

export interface RiskDetail {
  has: boolean;
  limit: number;
  contractYears: number;
}

export interface CompanyFaRisks {
  property: RiskDetail;
  interruption: RiskDetail;
  liability: RiskDetail;
  director: boolean;
  fleet: boolean;
  cyber: boolean;
}

export interface CompanyFaDirectorIns {
  death: number;
  invalidity: number;
  sick: number;
  invalidityDegree: 1 | 2 | 3;
  statePensionMonthly: number;
}

export interface CompanyFaInvestmentLegacy {
  goal: string;
  targetAmount: number;
  targetRentaMonthly: number;
  horizonYears: number;
  currentAssets: number;
  strategy: string;
}

export interface CompanyFaStrategy {
  profile: "conservative" | "balanced" | "dynamic";
  conservativeMode: boolean;
}

export interface CompanyFaInvestmentItem {
  productKey: string;
  type: "lump" | "monthly" | "pension";
  amount: number;
  years: number;
  annualRate: number;
  computed?: { fv: number };
}

export interface CompanyFaPayload {
  company: CompanyFaCompany;
  directors: CompanyFaDirector[];
  finance: CompanyFaFinance;
  benefits: CompanyFaBenefits;
  risks: CompanyFaRisks;
  directorIns: CompanyFaDirectorIns;
  investment?: CompanyFaInvestmentLegacy;
  strategy: CompanyFaStrategy;
  investments: CompanyFaInvestmentItem[];
}

/** Normalized payload as stored in DB (snapshot). */
export type CompanyAnalysisPayload = CompanyFaPayload;

/** Raw import payload (may have legacy shape e.g. single director). */
export type CompanyFaImportPayload = Partial<CompanyFaPayload> & {
  company?: Partial<CompanyFaCompany>;
  director?: unknown;
  directors?: unknown[];
};

export interface Company {
  id: string;
  tenantId: string;
  ico: string | null;
  name: string;
  industry: string | null;
  employees: number | null;
  cat3: number | null;
  avgWage: number | null;
  topClient: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CompanyPersonRoleType = "director" | "owner" | "partner" | "key_person" | "employee";

export interface CompanyPersonLink {
  id: string;
  tenantId: string;
  companyId: string;
  contactId: string | null;
  roleType: CompanyPersonRoleType;
  ownershipPercent: number | null;
  salaryFromCompanyMonthly: number | null;
  dividendRelation: string | null;
  guaranteesCompanyLiabilities: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyAnalysisRow {
  id: string;
  tenantId: string;
  contactId: string | null;
  householdId: string | null;
  companyId: string | null;
  primaryContactId: string | null;
  type: string;
  status: string;
  sourceType: string;
  version: number;
  payload: CompanyFaPayload;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastExportedAt: Date | null;
}

export interface DirectorPreviewItem {
  index: number;
  name: string;
  suggestedContactId: string | null;
  roleType: CompanyPersonRoleType;
}

export interface CompanyFaImportPreview {
  company: {
    name: string;
    ico: string | null;
    displayName: string;
  };
  directorsPreview: DirectorPreviewItem[];
  suggestedCompanyId: string | null;
  createNewCompany: boolean;
  analysisChoice: "new" | "version";
  existingAnalysisId?: string | null;
}

export interface CompanyFaImportResult {
  analysisId: string;
  companyId: string;
  version?: number;
}

export interface CompanyFaImportOptions {
  createNewCompany: boolean;
  suggestedCompanyId?: string | null;
  linkToAnalysisId?: string | null;
  directorContactIds?: Record<number, string>;
}

export type ValidateResult =
  | { success: true; normalized: CompanyFaPayload }
  | { success: false; errors: string[] };
