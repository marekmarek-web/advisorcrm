import { BANKS_DATA, LIMITS, TERM_LIMITS } from "../mortgage.config";
import { FIX_OPTIONS } from "../mortgage.constants";
import type { RateProvider, NormalizedOffer } from "./types";

const STATIC_FETCHED_AT = new Date().toISOString();

export class StaticRateProvider implements RateProvider {
  async fetchMortgageRates(): Promise<NormalizedOffer[]> {
    return BANKS_DATA.map((bank) => ({
      providerId: bank.id,
      providerName: bank.name,
      productType: "mortgage",
      subtype: null,
      nominalRate: bank.baseRate,
      apr: bank.apr,
      minAmount: LIMITS.mortgage.min,
      maxAmount: LIMITS.mortgage.max,
      minTermMonths: TERM_LIMITS.mortgage.min * 12,
      maxTermMonths: TERM_LIMITS.mortgage.max * 12,
      ltvLimit: 90,
      fixationOptions: [...FIX_OPTIONS],
      source: "static",
      fetchedAt: STATIC_FETCHED_AT,
    }));
  }

  async fetchLoanRates(): Promise<NormalizedOffer[]> {
    return BANKS_DATA.map((bank) => ({
      providerId: bank.id,
      providerName: bank.name,
      productType: "loan",
      subtype: null,
      nominalRate: bank.loanRate,
      apr: bank.apr,
      minAmount: LIMITS.loan.min,
      maxAmount: LIMITS.loan.max,
      minTermMonths: TERM_LIMITS.loanConsumer.min * 12,
      maxTermMonths: TERM_LIMITS.loanConsumer.max * 12,
      ltvLimit: null,
      fixationOptions: [],
      source: "static",
      fetchedAt: STATIC_FETCHED_AT,
    }));
  }
}
