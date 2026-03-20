export type RatesSource = "static" | "kurzy-cz" | "override";

export interface NormalizedOffer {
  providerId: string;
  providerName: string;
  productType: "mortgage" | "loan";
  subtype: string | null;
  nominalRate: number;
  apr?: number;
  monthlyPayment?: number;
  minAmount: number;
  maxAmount: number;
  minTermMonths: number;
  maxTermMonths: number;
  ltvLimit: number | null;
  fixationOptions: number[];
  source: RatesSource;
  sourceUrl?: string;
  fetchedAt: string;
}

export interface RateProvider {
  fetchMortgageRates(): Promise<NormalizedOffer[]>;
  fetchLoanRates(): Promise<NormalizedOffer[]>;
}
