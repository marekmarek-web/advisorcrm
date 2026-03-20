/**
 * Mortgage calculator – types (1:1 with hypotecni.html state and config).
 */

export type ProductType = "mortgage" | "loan";

export type MortgageSubType = "standard" | "investment" | "american";
export type LoanSubType = "consumer" | "auto" | "consolidation";

export type TabType = "new" | "refi";

export interface MortgageState {
  product: ProductType;
  mortgageType: MortgageSubType;
  loanType: LoanSubType;
  loan: number;
  own: number;
  extra: number;
  term: number;
  fix: number;
  type: TabType;
  ltvLock: number | null;
}

export interface BankEntry {
  id: string;
  name: string;
  baseRate: number;
  loanRate: number;
  apr?: number;
  logoUrl: string;
  source?: string;
  sourceUrl?: string;
  fetchedAt?: string;
}

export interface ProductSubType {
  id: MortgageSubType | LoanSubType;
  label: string;
  info: string;
}

export interface MortgageResult {
  monthlyPayment: number;
  finalRate: number;
  totalPaid: number;
  borrowingAmount: number;
  displayLtv: number;
  propertyValue: number;
  showLtvRow: boolean;
  ltvLabel: string;
  showLtvWarning: boolean;
  ltvWarningValue: number;
}

export interface BankOffer {
  bank: BankEntry;
  rate: number;
  apr?: number;
  monthlyPayment: number;
}
