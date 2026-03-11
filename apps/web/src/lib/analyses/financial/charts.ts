/**
 * Financial analysis – chart data preparation (no Chart.js dependency).
 * Extracted from financni-analyza.html (Phase 1). Returns config/data for growth, allocation, goals chart.
 */

import type { FinancialAnalysisData, GoalEntry, InvestmentEntry } from './types';
import { investmentFv } from './calculations';
import { getProductName } from './formatters';

/** Growth chart: year-by-year projected portfolio value. */
export function getGrowthChartData(data: FinancialAnalysisData): {
  labels: number[];
  values: number[];
  maxYears: number;
} {
  const investments = (data.investments || []).filter((i) => (i.amount || 0) > 0);
  const rentaGoals = (data.goals || []).filter((g) => g.type === 'renta');
  const maxRentaYears = rentaGoals.length ? Math.max(...rentaGoals.map((g) => g.years ?? g.horizon ?? 0)) : 0;
  const maxFromInvestments = investments.length ? Math.max(...investments.map((i) => i.years ?? 10)) : 0;
  const maxFromOtherGoals = (data.goals || [])
    .filter((g) => g.type !== 'renta')
    .reduce((m, g) => Math.max(m, g.years ?? g.horizon ?? 0), 0);
  const baseHorizon = maxRentaYears > 0 ? maxRentaYears + 10 : Math.max(maxFromInvestments, maxFromOtherGoals, 5);
  const maxYears = Math.min(30, Math.max(5, baseHorizon) || 15);
  const labels = Array.from({ length: maxYears + 1 }, (_, i) => i);
  const conservative = data.strategy?.conservativeMode ?? false;

  const values = labels.map((year) => {
    let total = 0;
    investments.forEach((inv) => {
      const amt = inv.amount ?? 0;
      let r = inv.annualRate ?? 0.07;
      if (conservative) r = Math.max(0, r - 0.02);
      const maxY = inv.years ?? 10;
      const n = Math.min(year, maxY);
      if (inv.type === 'lump') {
        total += amt * Math.pow(1 + r, n);
      } else {
        if (n > 0) {
          const rMonthly = r / 12;
          total += r > 0 ? amt * ((Math.pow(1 + rMonthly, 12 * n) - 1) / rMonthly) : amt * 12 * n;
        }
      }
    });
    return total;
  });

  return { labels, values, maxYears };
}

/** Allocation chart: by product (lump value or monthly*12*years as proxy for weight). */
export function getAllocationChartData(data: FinancialAnalysisData): {
  labels: string[];
  values: number[];
  total: number;
} {
  const strategyInvs = (data.investments || []).filter((i) => (i.amount || 0) > 0);
  const byProduct: Record<string, number> = {};
  strategyInvs.forEach((inv) => {
    const val = inv.type === 'lump' ? (inv.amount ?? 0) : (inv.amount ?? 0) * 12 * (inv.years ?? 10);
    byProduct[inv.productKey] = (byProduct[inv.productKey] || 0) + val;
  });
  const labels = Object.keys(byProduct).map((k) => getProductName(k));
  const values = Object.values(byProduct);
  const total = values.reduce((a, b) => a + b, 0);
  return { labels, values, total };
}

/** Single goal projection: target line (constant) and projection curve (initial + monthly contributions). */
export function getGoalChartData(goal: GoalEntry): {
  labels: number[];
  targetData: number[];
  projectionData: number[];
} {
  const years = goal.years ?? goal.horizon ?? 1;
  const labels = Array.from({ length: years + 1 }, (_, i) => i);
  const target = goal.computed?.fvTarget ?? 0;
  const targetData = new Array(years + 1).fill(target);
  const monthly = goal.computed?.pmt ?? 0;
  const r = goal.annualRate ?? 0.07;
  const monthlyRate = r / 12;
  const initialTotal = (goal.initialAmount ?? 0) + (goal.lumpSumNow ?? 0);

  const projectionData = labels.map((_, year) => {
    const monthsPassed = year * 12;
    const valInit = initialTotal * Math.pow(1 + monthlyRate, monthsPassed);
    let valMonthly = 0;
    if (monthlyRate > 0) {
      valMonthly = monthly * (Math.pow(1 + monthlyRate, monthsPassed) - 1) / monthlyRate;
    } else {
      valMonthly = monthly * monthsPassed;
    }
    return valInit + valMonthly;
  });

  return { labels, targetData, projectionData };
}

/** Recompute FV for each investment and return updated list (mutates computed). */
export function recomputeInvestmentsFv(
  investments: InvestmentEntry[],
  conservativeMode: boolean
): InvestmentEntry[] {
  return investments.map((inv) => ({
    ...inv,
    computed: { fv: investmentFv(inv, conservativeMode) },
  }));
}
