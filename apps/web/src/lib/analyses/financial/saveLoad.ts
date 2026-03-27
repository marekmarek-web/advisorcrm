/**
 * Financial analysis – persistence (localStorage, export/import JSON).
 * Extracted from financni-analyza.html (Phase 1).
 */

import type { FinancialAnalysisData, PersistedState } from './types';
import { getDefaultState, getDefaultInvestments } from './defaultState';
import { STORAGE_KEY, TOTAL_STEPS } from './constants';
import { computeGoalComputed } from './calculations';
import { exportFilename } from './formatters';

export interface LoadedState {
  data: FinancialAnalysisData;
  currentStep: number;
}

/** Merge parsed JSON from storage/file into default state. Preserves loadState logic 1:1. */
export function mergeLoadedState(
  defaultData: FinancialAnalysisData,
  parsed: { data?: Record<string, unknown>; currentStep?: number }
): LoadedState {
  const data: FinancialAnalysisData = JSON.parse(JSON.stringify(defaultData));

  if (!parsed?.data) {
    const maxStep = data.includeCompany ? TOTAL_STEPS + 1 : TOTAL_STEPS;
    const currentStep = Math.min(Math.max(1, Number(parsed?.currentStep) || 1), maxStep);
    return { data, currentStep };
  }

  const p = parsed.data as Record<string, unknown>;

  if (p.client && typeof p.client === 'object') {
    Object.assign(data.client, p.client);
  }
  if (p.partner && typeof p.partner === 'object') {
    Object.assign(data.partner, p.partner);
  }
  if (Array.isArray(p.children)) {
    data.children = p.children as FinancialAnalysisData['children'];
  }

  if (p.cashflow && typeof p.cashflow === 'object') {
    const cf = p.cashflow as Record<string, unknown>;
    data.cashflow.incomeType = (cf.incomeType as string) || 'zamestnanec';
    data.cashflow.incomeGross = Number(cf.incomeGross) || 0;
    data.cashflow.partnerIncomeType = (cf.partnerIncomeType as string) || 'zamestnanec';
    data.cashflow.partnerGross = Number(cf.partnerGross) || 0;
    data.cashflow.reserveCash = Number(cf.reserveCash) || 0;
    data.cashflow.reserveTargetMonths = Number(cf.reserveTargetMonths) ?? 6;
    if (cf.incomes && typeof cf.incomes === 'object') {
      Object.assign(data.cashflow.incomes, cf.incomes);
      if (!Array.isArray(data.cashflow.incomes.otherDetails)) data.cashflow.incomes.otherDetails = [];
    }
    if (cf.expenses && typeof cf.expenses === 'object') {
      const exp = cf.expenses as Record<string, unknown>;
      Object.assign(data.cashflow.expenses, cf.expenses);
      if (!Array.isArray(data.cashflow.expenses.otherDetails)) data.cashflow.expenses.otherDetails = [];
      if (Array.isArray(exp.insuranceItems)) {
        data.cashflow.expenses.insuranceItems = exp.insuranceItems as FinancialAnalysisData['cashflow']['expenses']['insuranceItems'];
      } else if (typeof exp.insurance === 'number' && exp.insurance > 0) {
        data.cashflow.expenses.insuranceItems = [
          { id: Date.now(), type: 'životní', amount: exp.insurance, insurer: undefined, note: undefined },
        ];
      }
      if (!data.cashflow.expenses.insuranceItems) data.cashflow.expenses.insuranceItems = [];
    }
  }

  if (p.assets && typeof p.assets === 'object') {
    const a = p.assets as Record<string, unknown>;
    if (a.cash !== undefined) data.assets.cash = Number(a.cash) || 0;
    if (a.realEstate !== undefined) data.assets.realEstate = Number(a.realEstate) || 0;
    if (a.investments !== undefined) data.assets.investments = Number(a.investments) || 0;
    if (a.pension !== undefined) data.assets.pension = Number(a.pension) || 0;
    if (a.other !== undefined) data.assets.other = Number(a.other) || 0;
    if (Array.isArray(a.investmentsList)) data.assets.investmentsList = a.investmentsList as FinancialAnalysisData['assets']['investmentsList'];
    if (Array.isArray(a.pensionList)) data.assets.pensionList = a.pensionList as FinancialAnalysisData['assets']['pensionList'];
  }

  if (p.liabilities && typeof p.liabilities === 'object') {
    Object.assign(data.liabilities, p.liabilities);
    if (!data.liabilities.mortgageDetails) data.liabilities.mortgageDetails = { rate: 0, fix: 0, pay: 0 };
    if (!data.liabilities.loansDetails) data.liabilities.loansDetails = { rate: 0, pay: 0 };
    if (!Array.isArray(data.liabilities.loansList)) data.liabilities.loansList = [];
  }

  if (Array.isArray(p.goals)) {
    data.goals = (p.goals as Array<Record<string, unknown>>).map((g) => {
      const type = (g.type as string) || 'renta';
      const amount = Number(g.amount) || 0;
      const years = Number(g.years ?? g.horizon) || 1;
      const annualRate = Number(g.annualRate ?? g.strategy) || 0.07;
      const initial = Number(g.initialAmount) || 0;
      const lumpSum = Number(g.lumpSumNow) || 0;
      const { fvTarget, pmt, netNeeded } = computeGoalComputed(type, amount, years, annualRate, initial, lumpSum);
      return {
        ...g,
        years,
        annualRate,
        computed: { fvTarget, pmt, netNeeded },
      } as FinancialAnalysisData['goals'][0];
    });
  }

  if (p.strategy && typeof p.strategy === 'object') {
    const s = p.strategy as Record<string, unknown>;
    data.strategy.profile = (s.profile as FinancialAnalysisData['strategy']['profile']) || 'balanced';
    data.strategy.conservativeMode = Boolean(s.conservativeMode);
  }

  if (Array.isArray(p.newCreditWishList)) {
    data.newCreditWishList = p.newCreditWishList as FinancialAnalysisData['newCreditWishList'];
  } else if (p.newCreditWish && typeof p.newCreditWish === 'object') {
    const old = p.newCreditWish as Record<string, unknown>;
    const amt = Number(old.amount) || 0;
    const purpose = old.purpose;
    if (amt > 0 || purpose) {
      const monthly = Number(old.estimatedMonthly) || 0;
      const term = Number(old.termYears) || 25;
      data.newCreditWishList = [
        {
          id: Date.now(),
          ...old,
          estimatedTotal: monthly * term * 12,
        } as FinancialAnalysisData['newCreditWishList'][0],
      ];
    }
  }

  if (Array.isArray(p.investments)) {
    const loaded = p.investments as FinancialAnalysisData['investments'];
    data.investments = loaded.filter((inv) => inv.productKey !== 'imperial');
  }

  if (p.insurance && typeof p.insurance === 'object') {
    Object.assign(data.insurance, p.insurance);
  }

  if (p.incomeProtection && typeof p.incomeProtection === 'object') {
    const ip = p.incomeProtection as Record<string, unknown>;
    if (Array.isArray(ip.persons)) {
      data.incomeProtection = { persons: ip.persons as NonNullable<FinancialAnalysisData['incomeProtection']>['persons'] };
    }
  }

  if (p.includeCompany !== undefined) data.includeCompany = Boolean(p.includeCompany);
  if (p.companyFinance && typeof p.companyFinance === 'object') {
    const cf = p.companyFinance as Record<string, unknown>;
    data.companyFinance = {
      revenue: Number(cf.revenue) || 0,
      profit: Number(cf.profit) || 0,
      reserve: Number(cf.reserve) || 0,
      loanPayment: Number(cf.loanPayment) || 0,
    };
  }
  if (p.companyBenefits && typeof p.companyBenefits === 'object') {
    const b = p.companyBenefits as Record<string, unknown>;
    data.companyBenefits = {
      dps: Boolean(b.dps),
      dip: Boolean(b.dip),
      izp: Boolean(b.izp),
      amountPerPerson: Number(b.amountPerPerson) || 0,
      employeeCount: Number(b.employeeCount) || 0,
      directorsAmount: Number(b.directorsAmount) || 0,
      annualCost: Number(b.annualCost) || 0,
      statePensionTaxBenefit: Boolean(b.statePensionTaxBenefit),
      statePensionTaxLimitAnnual: Number(b.statePensionTaxLimitAnnual) || undefined,
      statePensionTaxRefundAnnual: Number(b.statePensionTaxRefundAnnual) || undefined,
    };
  }
  if (p.companyRisks && typeof p.companyRisks === 'object') {
    const r = p.companyRisks as Record<string, unknown>;
    data.companyRisks = {
      property: Boolean(r.property),
      interruption: Boolean(r.interruption),
      liability: Boolean(r.liability),
      director: Boolean(r.director),
      fleet: Boolean(r.fleet),
      cyber: Boolean(r.cyber),
    };
  }
  if (p.companyRiskDetails && typeof p.companyRiskDetails === 'object') {
    const rd = p.companyRiskDetails as Record<string, unknown>;
    data.companyRiskDetails = {};
    ['property', 'interruption', 'liability'].forEach((key) => {
      const item = rd[key];
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        (data.companyRiskDetails as Record<string, { limit?: number; contractYears?: number }>)[key] = {
          limit: Number(obj.limit) || undefined,
          contractYears: Number(obj.contractYears) || undefined,
        };
      }
    });
  }
  if (p.clientId != null) data.clientId = String(p.clientId);
  if (p.householdId != null) data.householdId = String(p.householdId);
  if (p.notes !== undefined) data.notes = p.notes == null ? null : String(p.notes);

  if (p._provenance && typeof p._provenance === 'object') {
    (data as unknown as Record<string, unknown>)._provenance = { ...(p._provenance as Record<string, string>) };
  }

  const maxStep = data.includeCompany ? TOTAL_STEPS + 1 : TOTAL_STEPS;
  const currentStep = Math.min(Math.max(1, Number(parsed?.currentStep) || 1), maxStep);
  return { data, currentStep };
}

export function loadFromStorage(): LoadedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { data?: Record<string, unknown>; currentStep?: number };
    const defaultData = getDefaultState();
    if (!parsed?.data) {
      return { data: defaultData, currentStep: 1 };
    }
    return mergeLoadedState(defaultData, parsed);
  } catch {
    return null;
  }
}

export function saveToStorage(data: FinancialAnalysisData, currentStep: number): void {
  if (typeof window === 'undefined') return;
  try {
    const toSave: PersistedState = {
      data,
      currentStep,
      timestamp: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // ignore
  }
}

export function exportToFile(data: FinancialAnalysisData, currentStep: number): { json: string; filename: string } {
  const clientName = data.client?.name || 'klient';
  const filename = exportFilename(clientName);
  const exportData: PersistedState = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    clientName,
    data,
    currentStep,
  };
  const json = JSON.stringify(exportData, null, 2);
  return { json, filename };
}

export function importFromFile(jsonString: string): LoadedState | null {
  try {
    const parsed = JSON.parse(jsonString) as { data?: Record<string, unknown>; currentStep?: number };
    const defaultData = getDefaultState();
    return mergeLoadedState(defaultData, parsed);
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** True when the wizard has enough content to create/update a server draft (avoids empty rows). */
export function hasPersistableFinancialDraft(data: FinancialAnalysisData, currentStep: number): boolean {
  if (currentStep > 1) return true;
  return Boolean(
    data.client?.name?.trim()
      || data.notes?.trim()
      || data.clientId
      || data.householdId
  );
}
