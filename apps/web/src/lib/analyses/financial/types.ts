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
  birthNumber?: string;
}

export interface PartnerInfo {
  name: string;
  birthDate: string;
  age?: string;
  email?: string;
  phone?: string;
  occupation?: string;
  sports?: string;
  birthNumber?: string;
}

export interface ChildEntry {
  id: number;
  name: string;
  birthDate: string;
  sports?: string;
  birthNumber?: string;
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

export type InsuranceItemType = "majetkové" | "odpovědnost" | "životní";

export interface InsuranceExpenseItem {
  id: number;
  type: InsuranceItemType;
  insurer?: string;
  amount: number;
  note?: string;
  forPersonKey?: string;
}

export interface CashflowExpenses {
  housing?: number;
  energy?: number;
  food?: number;
  transport?: number;
  children?: number;
  insurance?: number;
  insuranceItems?: InsuranceExpenseItem[];
  loans?: number;
  otherDetails?: OtherDetailItem[];
}

export interface CashflowState {
  incomeType: string;
  incomeGross: number;
  /** Partner: zamestnanec | osvc | invalidni_duchod | starobni_duchod */
  partnerIncomeType?: string;
  /** Hrubá mzda partnera (pouze když partnerIncomeType === 'zamestnanec'); čistá se odvodí. */
  partnerGross?: number;
  incomes: CashflowIncomes;
  expenses: CashflowExpenses;
  reserveCash: number;
  reserveTargetMonths: number;
  reserveGap?: number;
  isReserveMet?: boolean;
}

/** Finance firmy (krok 2 FA s.r.o.) – výnosy, zisk, rezerva, měsíční splátka úvěrů. */
export interface CompanyFinance {
  /** Roční tržby (Kč) */
  revenue?: number;
  /** Roční zisk / EBITDA (Kč) */
  profit?: number;
  /** Hotovostní rezerva firmy (Kč) */
  reserve?: number;
  /** Úvěry/Leasingy – měsíční splátka (Kč) */
  loanPayment?: number;
}

/** Danové zvýhodnění od státu – limit příspěvku do DIP/DPS a daň zpět (ročně). */
export const STATE_PENSION_TAX_LIMIT_ANNUAL = 48_000;
export const STATE_PENSION_TAX_REFUND_ANNUAL = 7_200;

/** Benefity firmy – DPS/DIP/IŽP, příspěvky, počet zaměstnanců, jednatelé. */
export interface CompanyBenefits {
  dps?: boolean;
  dip?: boolean;
  izp?: boolean;
  /** Příspěvek na osobu (Kč/měs.) */
  amountPerPerson?: number;
  /** Počet zaměstnanců */
  employeeCount?: number;
  /** Příspěvky jednatelům (Kč/měs. celkem) */
  directorsAmount?: number;
  /** Roční náklad (vypočteno nebo zadané) */
  annualCost?: number;
  /** Zahrnout danové zvýhodnění od státu: až 48 000 Kč/rok do DIP/DPS, 7 200 Kč daň zpět */
  statePensionTaxBenefit?: boolean;
  /** Limit příspěvku do DIP/DPS (Kč/rok) – výchozí 48 000 */
  statePensionTaxLimitAnnual?: number;
  /** Daň zpět od státu (Kč/rok) – výchozí 7 200 */
  statePensionTaxRefundAnnual?: number;
}

/** Rizika pojištění firmy – zaškrtávací položky (6 kategorií). */
export interface CompanyRisks {
  property?: boolean;
  interruption?: boolean;
  liability?: boolean;
  director?: boolean;
  fleet?: boolean;
  cyber?: boolean;
}

/** Detail u vybraných rizik (Majetek, Přerušení, Odpovědnost) – pojistný limit, stáří smlouvy. */
export interface CompanyRiskDetails {
  property?: { limit?: number; contractYears?: number };
  interruption?: { limit?: number; contractYears?: number };
  liability?: { limit?: number; contractYears?: number };
}

export interface AssetListItem {
  id: number;
  type: string;
  value: number;
  note?: string;
}

export interface RealEstateItem {
  id: string;
  label: string;
  value: number;
}

export interface AssetsState {
  cash: number;
  realEstate: number;
  realEstateItems?: RealEstateItem[];
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
  useInflationFV?: boolean;
  pensionDeduction?: boolean;
  pensionAmount?: number;
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
  profile: 'dynamic_plus' | 'dynamic' | 'balanced' | 'conservative';
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

/** Income protection step – risk types. */
export type InsuredRiskType =
  | 'death'
  | 'invalidity'
  | 'sickness'
  | 'tn'
  | 'daily_compensation'
  | 'critical_illness'
  | 'hospitalization';

/** Funding source for an insurance plan or risk. */
export type InsuranceFundingSource = 'company' | 'personal' | 'osvc';

export interface InsuredRiskEntry {
  riskType: InsuredRiskType;
  enabled: boolean;
  coverageAmount?: number;
  finalPrice?: number;
  fundingSource?: InsuranceFundingSource;
  note?: string;
}

export interface IncomeProtectionPlan {
  id: string;
  provider: string;
  policyType?: string;
  planType?: 'full' | 'urazovka';
  annualContribution?: number;
  monthlyPremium?: number;
  fundingSource?: InsuranceFundingSource;
  insuredRisks: InsuredRiskEntry[];
  notes?: string;
}

/** Role type for income protection person (drives optimization section). */
export type IncomeProtectionRoleType =
  | 'client'
  | 'partner'
  | 'child'
  | 'director'
  | 'owner'
  | 'partner_company';

export type IncomeProtectionEmploymentType = 'employee' | 'osvc' | 'mixed' | 'invalidni_duchod' | 'starobni_duchod';

export interface BenefitVsSalaryComparison {
  salaryIncreaseGrossEquivalent?: number;
  salaryVariantCompanyCost?: number;
  salaryVariantNetToPerson?: number;
  benefitVariantCompanyCost?: number;
  benefitVariantNetToInsurance?: number;
  estimatedSavings?: number;
  /** Daňová úspora majitelů (ročně) při benefitu – pro jednatele/majitele/společníka. */
  ownerTaxSavingsAnnual?: number;
  explanation?: string;
}

export interface PersonProtectionFunding {
  benefitOptimizationEnabled: boolean;
  companyContributionMonthly?: number;
  companyContributionAnnual?: number;
  personalContributionMonthly?: number;
  osvcContributionMonthly?: number;
  benefitVsSalaryComparison?: BenefitVsSalaryComparison;
  notes?: string;
}

export interface IncomeProtectionPerson {
  personKey: string;
  displayName: string;
  role: string;
  roleType?: IncomeProtectionRoleType;
  employmentType?: IncomeProtectionEmploymentType;
  insurancePlans: IncomeProtectionPlan[];
  funding?: PersonProtectionFunding;
}

export interface IncomeProtectionState {
  persons: IncomeProtectionPerson[];
}

export interface FinancialAnalysisData {
  client: ClientInfo;
  partner: PartnerInfo;
  children: ChildEntry[];
  /** Tato analýza zahrnuje i firmu (s.r.o.) – zobrazí cashflow firmy a krok Benefity & Rizika */
  includeCompany?: boolean;
  /** Finance firmy (výnosy, zisk, rezerva, splátky) – když includeCompany */
  companyFinance?: CompanyFinance;
  /** Benefity firmy (DPS/DIP/IŽP, příspěvky) – když includeCompany */
  companyBenefits?: CompanyBenefits;
  /** Pojištění firmy – rizika (Majetek, Přerušení, …) – když includeCompany */
  companyRisks?: CompanyRisks;
  /** Detail rizik: pojistný limit, stáří smlouvy u property/interruption/liability */
  companyRiskDetails?: CompanyRiskDetails;
  cashflow: CashflowState;
  assets: AssetsState;
  liabilities: LiabilitiesState;
  goals: GoalEntry[];
  newCreditWishList: CreditWishEntry[];
  strategy: StrategyState;
  investments: InvestmentEntry[];
  insurance: InsuranceState;
  /** Zajištění příjmů – modelace pojištění po osobách, plány, zdroj úhrady, optimalizace pro jednatele/majitele */
  incomeProtection?: IncomeProtectionState;
  /** Optional CRM link – set from URL ?clientId= / ?householdId= */
  clientId?: string;
  householdId?: string;
  /** Poznámky k analýze – uložené s analýzou, připravené na převod do úkolů / zápisků */
  notes?: string | null;
}

export interface PersistedState {
  version?: string;
  exportDate?: string;
  clientName?: string;
  data: FinancialAnalysisData;
  currentStep: number;
  timestamp?: string;
}

/** Holding weight entry (name + weight in percent, e.g. 5.47 for 5.47 %) */
export interface HoldingWeight {
  name: string;
  weight: number;
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
  /** Výchozí roční zhodnocení (např. 0.06 = 6 %); pro dropdown průměr ±1 % */
  defaultRate?: number;
  /** Investiční strategie (dlouhý popis) */
  strategy?: string;
  /** Klíčové výhody (odrážky) */
  benefits?: string[];
  /** Základní parametry (měna, min. investice, …) */
  parameters?: Record<string, string>;
  /** Top 10 držených titulů (váha v %) */
  topHoldings?: HoldingWeight[];
  /** Celková váha top 10 v %; počet všech holdingu */
  top10WeightPercent?: number;
  totalHoldingsCount?: number;
  /** Země (váha v %) */
  countries?: HoldingWeight[];
  /** Sektory (váha v %) */
  sectors?: HoldingWeight[];
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
