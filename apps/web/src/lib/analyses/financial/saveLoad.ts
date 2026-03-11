/**
 * Financial analysis – persistence (localStorage, export/import JSON).
 * Extracted from financni-analyza.html (Phase 1).
 */

import type { FinancialAnalysisData, PersistedState } from './types';
import { getDefaultState, getDefaultInvestments } from './defaultState';
import { STORAGE_KEY } from './constants';
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
  const currentStep = Math.min(
    Math.max(1, Number(parsed?.currentStep) || 1),
    7
  );

  if (!parsed?.data) return { data, currentStep };

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
    data.cashflow.reserveCash = Number(cf.reserveCash) || 0;
    data.cashflow.reserveTargetMonths = Number(cf.reserveTargetMonths) ?? 6;
    if (cf.incomes && typeof cf.incomes === 'object') {
      Object.assign(data.cashflow.incomes, cf.incomes);
      if (!Array.isArray(data.cashflow.incomes.otherDetails)) data.cashflow.incomes.otherDetails = [];
    }
    if (cf.expenses && typeof cf.expenses === 'object') {
      Object.assign(data.cashflow.expenses, cf.expenses);
      if (!Array.isArray(data.cashflow.expenses.otherDetails)) data.cashflow.expenses.otherDetails = [];
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
    data.investments = p.investments as FinancialAnalysisData['investments'];
  }

  if (p.insurance && typeof p.insurance === 'object') {
    Object.assign(data.insurance, p.insurance);
  }

  if (p.clientId != null) data.clientId = String(p.clientId);
  if (p.householdId != null) data.householdId = String(p.householdId);

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
