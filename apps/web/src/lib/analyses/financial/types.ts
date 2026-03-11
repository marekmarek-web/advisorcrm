/**
 * Financial analysis – data types and structures.
 * Extracted from financni-analyza.html (Phase 1).
 */

export interface ClientInfo {
  name: string;
  birthDate: string;
  age: string;
  email: string;
  phone: string;
  occupation: string;
  sports: string;
  hasPartner: boolean;
}

export interface PartnerInfo {
  name: string;
  birthDate: string;
}

export interface ChildEntry {
  id: number;
  name: string;
  birthDate: string;
}

export interface OtherDetailItem {
  id: number;
  desc: string;
  amount: number;
}

export interface CashflowIncomes {
  main?: number;
  partner?: number;
  otherDetails?: OtherDetailItem[];
}

export interface CashflowExpenses {
  housing?: number;
  energy?: number;
  food?: number;
  transport?: number;
  children?: number;
  insurance?: number;
  loans?: number;
  otherDetails?: OtherDetailItem[];
}

export interface CashflowState {
  incomeType: string;
  incomeGross: number;
  incomes: CashflowIncomes;
  expenses: CashflowExpenses;
  reserveCash: number;
  reserveTargetMonths: number;
  reserveGap?: number;
  isReserveMet?: boolean;
}

export interface AssetListItem {
  id: number;
  type: string;
  value: number;
}

export interface AssetsState {
  cash: number;
  realEstate: number;
  investments: number;
  investmentsList: AssetListItem[];
  pension: number;
  pensionList: AssetListItem[];
  other: number;
}

export interface MortgageDetails {
  rate: number;
  fix: number;
  pay: number;
}

export interface LoanEntry {
  id: number | string;
  type?: string;
  provider?: string;
  desc?: string;
  balance: number | string;
  rate?: number;
  fix?: number;
  pay?: number;
}

export interface LiabilitiesState {
  mortgage: number;
  mortgageDetails: MortgageDetails;
  mortgageProvider: string;
  loans: number;
  loansDetails: { rate: number; pay: number };
  loansList: LoanEntry[];
  other: number;
  otherDesc: string;
  otherProvider: string;
}

export interface GoalComputed {
  fvTarget: number;
  pmt: number;
  netNeeded: number;
}

export interface GoalEntry {
  id: number;
  type: string;
  name: string;
  years?: number;
  horizon?: number;
  strategy?: string;
  annualRate?: number;
  amount?: number;
  targetMonthlyIncome?: number | null;
  targetAmount?: number | null;
  initialAmount?: number;
  lumpSumNow?: number;
  computed: GoalComputed;
}

export interface CreditWishEntry {
  id: number | string;
  product: string;
  subType: string;
  purpose: string;
  selectedBankId: string;
  customRate?: number;
  amount: number;
  ownResources?: number;
  ltvPercent?: number;
  akoPercent?: number;
  extraAmount?: number;
  termYears: number;
  fixYears: number;
  estimatedRate: number;
  estimatedMonthly: number;
  estimatedTotal: number;
}

export interface StrategyState {
  profile: 'dynamic' | 'balanced' | 'conservative';
  conservativeMode: boolean;
}

export interface InvestmentComputed {
  fv: number;
}

export interface InvestmentEntry {
  id: number;
  productKey: string;
  type: 'lump' | 'monthly' | 'pension';
  amount: number;
  years: number;
  annualRate: number;
  computed?: InvestmentComputed;
}

export interface InsuranceState {
  riskJob: 'low' | 'medium' | 'high';
  invalidity50Plus: boolean;
}

export interface FinancialAnalysisData {
  client: ClientInfo;
  partner: PartnerInfo;
  children: ChildEntry[];
  cashflow: CashflowState;
  assets: AssetsState;
  liabilities: LiabilitiesState;
  goals: GoalEntry[];
  newCreditWishList: CreditWishEntry[];
  strategy: StrategyState;
  investments: InvestmentEntry[];
  insurance: InsuranceState;
  /** Optional CRM link – set from URL ?clientId= / ?householdId= */
  clientId?: string;
  householdId?: string;
}

export interface PersistedState {
  version?: string;
  exportDate?: string;
  clientName?: string;
  data: FinancialAnalysisData;
  currentStep: number;
  timestamp?: string;
}

/** Fund detail for report / product cards */
export interface FundDetail {
  name: string;
  manager: string;
  goal: string;
  assets: string;
  yield: string;
  risks: string;
  liquidity: string;
  suitable: string;
  why: string;
}

/** Liability provider group */
export interface LiabilityProviderGroup {
  group: string;
  names: string[];
}

/** Credit wish bank option */
export interface CreditWishBank {
  id: string;
  name: string;
  rateHypo?: number;
  rateLoan?: number;
}
