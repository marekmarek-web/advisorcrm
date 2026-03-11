/**
 * Financial analysis – selectors and derived data.
 * Extracted from financni-analyza.html (Phase 1).
 */

import type { FinancialAnalysisData } from './types';
import {
  totalIncome,
  totalExpense,
  surplus,
  reserveTarget,
  reserveGap,
  isReserveMet,
  totalAssetsFromValues,
  totalLiabilitiesFromValues,
  netWorth,
  strategyTotals,
  loansListBalanceSum,
  loansListPaymentsSum,
} from './calculations';

export function selectTotalIncome(data: FinancialAnalysisData): number {
  return totalIncome(data.cashflow?.incomes ?? {});
}

export function selectTotalExpense(data: FinancialAnalysisData): number {
  return totalExpense(data.cashflow?.expenses ?? {});
}

export function selectSurplus(data: FinancialAnalysisData): number {
  return surplus(data.cashflow?.incomes ?? {}, data.cashflow?.expenses ?? {});
}

export function selectReserveTarget(data: FinancialAnalysisData): number {
  const monthly = selectTotalExpense(data);
  const months = data.cashflow?.reserveTargetMonths ?? 6;
  return reserveTarget(monthly, months);
}

export function selectReserveGap(data: FinancialAnalysisData): number {
  const cash = data.cashflow?.reserveCash ?? 0;
  const target = selectReserveTarget(data);
  return reserveGap(cash, target);
}

export function selectIsReserveMet(data: FinancialAnalysisData): boolean {
  const cash = data.cashflow?.reserveCash ?? 0;
  const target = selectReserveTarget(data);
  return isReserveMet(cash, target);
}

export function selectTotalAssets(data: FinancialAnalysisData): number {
  return totalAssetsFromValues(data.assets ?? {});
}

export function selectTotalLiabilities(data: FinancialAnalysisData): number {
  return totalLiabilitiesFromValues(data.liabilities ?? {});
}

export function selectNetWorth(data: FinancialAnalysisData): number {
  return netWorth(data.assets ?? {}, data.liabilities ?? {});
}

export function selectLoansTotal(data: FinancialAnalysisData): number {
  return loansListBalanceSum(data.liabilities?.loansList ?? []);
}

export function selectLoansPaymentsTotal(data: FinancialAnalysisData): number {
  return loansListPaymentsSum(data.liabilities?.loansList ?? []);
}

/** Total monthly savings needed (sum of goals' PMT). */
export function selectTotalMonthlySavings(data: FinancialAnalysisData): number {
  return (data.goals ?? []).reduce((acc, g) => acc + (g.computed?.pmt ?? 0), 0);
}

/** Total target capital (sum of goals' fvTarget). */
export function selectTotalTargetCapital(data: FinancialAnalysisData): number {
  return (data.goals ?? []).reduce((acc, g) => acc + (g.computed?.fvTarget ?? 0), 0);
}

/** Strategy totals (FV, lump, monthly, invested). */
export function selectStrategyTotals(data: FinancialAnalysisData) {
  const invs = data.investments ?? [];
  const conservative = data.strategy?.conservativeMode ?? false;
  return strategyTotals(invs, conservative);
}

/** Portfolio FV (sum of investments computed FV). */
export function selectPortfolioFv(data: FinancialAnalysisData): number {
  return (data.investments ?? []).reduce((acc, i) => acc + (i.computed?.fv ?? 0), 0);
}
