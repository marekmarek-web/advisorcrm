/**
 * Financial analysis – default state and initial data.
 * Extracted from financni-analyza.html (Phase 1).
 */

import type { FinancialAnalysisData, InvestmentEntry } from './types';
import { TOTAL_STEPS } from './constants';

/** Default investments list (pre-populated in init). */
export function getDefaultInvestments(): InvestmentEntry[] {
  return [
    { id: 1, productKey: 'imperial', type: 'lump', amount: 0, years: 10, annualRate: 0.12, computed: { fv: 0 } },
    { id: 2, productKey: 'creif', type: 'lump', amount: 0, years: 10, annualRate: 0.06, computed: { fv: 0 } },
    { id: 3, productKey: 'atris', type: 'lump', amount: 0, years: 10, annualRate: 0.06, computed: { fv: 0 } },
    { id: 4, productKey: 'penta', type: 'lump', amount: 0, years: 10, annualRate: 0.09, computed: { fv: 0 } },
    { id: 5, productKey: 'ishares', type: 'monthly', amount: 0, years: 20, annualRate: 0.12, computed: { fv: 0 } },
    { id: 6, productKey: 'fidelity2040', type: 'monthly', amount: 0, years: 20, annualRate: 0.07, computed: { fv: 0 } },
    { id: 7, productKey: 'atris', type: 'monthly', amount: 0, years: 10, annualRate: 0.06, computed: { fv: 0 } },
    { id: 8, productKey: 'conseq', type: 'pension', amount: 0, years: 30, annualRate: 0.06, computed: { fv: 0 } },
  ];
}

/** Full default data structure for a new analysis. */
export function getDefaultState(): FinancialAnalysisData {
  return {
    client: {
      name: '',
      birthDate: '',
      age: '',
      email: '',
      phone: '',
      occupation: '',
      sports: '',
      hasPartner: false,
    },
    partner: { name: '', birthDate: '' },
    children: [],
    cashflow: {
      incomeType: 'zamestnanec',
      incomeGross: 0,
      incomes: { otherDetails: [] },
      expenses: { otherDetails: [] },
      reserveCash: 0,
      reserveTargetMonths: 6,
      reserveGap: 0,
      isReserveMet: false,
    },
    assets: {
      cash: 0,
      realEstate: 0,
      investments: 0,
      investmentsList: [],
      pension: 0,
      pensionList: [],
      other: 0,
    },
    liabilities: {
      mortgage: 0,
      mortgageDetails: { rate: 0, fix: 0, pay: 0 },
      mortgageProvider: '',
      loans: 0,
      loansDetails: { rate: 0, pay: 0 },
      loansList: [],
      other: 0,
      otherDesc: '',
      otherProvider: '',
    },
    goals: [],
    newCreditWishList: [],
    strategy: { profile: 'balanced', conservativeMode: false },
    investments: getDefaultInvestments(),
    insurance: { riskJob: 'low', invalidity50Plus: false },
  };
}

/** Initial wizard step. */
export const DEFAULT_CURRENT_STEP = 1;

/** Total number of steps (for reference). */
export { TOTAL_STEPS };
