/**
 * Financial analysis – pure business calculations.
 * Extracted from financni-analyza.html (Phase 1). Preserve formulas 1:1.
 */

import type { FinancialAnalysisData, CashflowIncomes, CashflowExpenses, GoalEntry, InvestmentEntry, InsuranceExpenseItem, BenefitVsSalaryComparison, CompanyFinance } from './types';
import { RENTA_INFLATION, RENTA_WITHDRAWAL_RATE, BENEFIT_OPTIMIZATION } from './constants';

/** Options for benefit vs salary comparison (optional owner tax savings for director/owner). */
export interface ComputeBenefitVsSalaryOptions extends BenefitVsSalaryOptions {
  /** Apply owner tax savings (for director/owner/partner_company). */
  isOwnerRole?: boolean;
}

// ----- Cashflow -----

export function totalIncome(incomes: CashflowIncomes): number {
  const main = Number(incomes?.main) || 0;
  const partner = Number(incomes?.partner) || 0;
  const otherSum = (incomes?.otherDetails || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  return main + partner + otherSum;
}

export function totalExpense(expenses: CashflowExpenses): number {
  const h = Number(expenses?.housing) || 0;
  const e = Number(expenses?.energy) || 0;
  const f = Number(expenses?.food) || 0;
  const t = Number(expenses?.transport) || 0;
  const c = Number(expenses?.children) || 0;
  const insuranceSum = (expenses?.insuranceItems?.length ?? 0) > 0
    ? (expenses.insuranceItems as InsuranceExpenseItem[]).reduce((a, b) => a + (Number(b.amount) || 0), 0)
    : Number(expenses?.insurance) || 0;
  const otherSum = (expenses?.otherDetails || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  return h + e + f + t + c + insuranceSum + otherSum;
}

export function surplus(incomes: CashflowIncomes, expenses: CashflowExpenses): number {
  return totalIncome(incomes) - totalExpense(expenses);
}

export function reserveTarget(monthlyExpense: number, reserveTargetMonths: number): number {
  return monthlyExpense * reserveTargetMonths;
}

export function reserveGap(reserveCash: number, target: number): number {
  return Math.max(0, target - reserveCash);
}

export function isReserveMet(reserveCash: number, target: number): boolean {
  return reserveCash >= target;
}

/** Cash runway firmy (měsíce): rezerva / (měsíční zisk − měsíční splátka). Nula nebo záporný cashflow → null. */
export function companyRunway(cf: CompanyFinance | undefined): number | null {
  if (!cf) return null;
  const reserve = Number(cf.reserve) || 0;
  const profit = Number(cf.profit) || 0;
  const loanPayment = Number(cf.loanPayment) || 0;
  const monthlySurplus = profit / 12 - loanPayment;
  if (monthlySurplus <= 0) return null;
  return reserve / monthlySurplus;
}

// ----- Benefit calculator (FA s.r.o. – varianta mzda vs. benefit) -----
/** Podíl čisté mzdy z hrubé (po odvodech zaměstnance). */
export const BENEFIT_NET_RATIO = 0.67;
/** Náklad firmy na hrubou mzdu (1 + odvody cca 33,8 %). */
export const BENEFIT_EMPLOYER_COST_FACTOR = 1.338;
/** Daňová úspora majitelů na benefit (odhad podílu úspory). */
export const BENEFIT_DIRECTORS_TAX_SAVINGS_RATE = 0.21;

/** Ekvivalent hrubé mzdy pro daný čistý příspěvek (1 osoba, Kč/měs). */
export function benefitGrossEquiv(amountPerPerson: number): number {
  if (amountPerPerson <= 0) return 0;
  return amountPerPerson / BENEFIT_NET_RATIO;
}

/** Náklad firmy na mzdu (1 osoba, Kč/měs) – varianta A. */
export function benefitEmployerCost(grossEquiv: number): number {
  return grossEquiv * BENEFIT_EMPLOYER_COST_FACTOR;
}

/** Čistá mzda zaměstnance (1 osoba, Kč/měs) – varianta A. */
export function benefitNetForEmployee(grossEquiv: number): number {
  return grossEquiv * BENEFIT_NET_RATIO;
}

/** Úspora firmy při benefit vs. mzda (ročně): (náklad mzda − náklad benefit) × počet × 12. */
export function benefitSavingsEmployees(employerCost: number, amountPerPerson: number, count: number): number {
  return (employerCost - amountPerPerson) * count * 12;
}

/** Daňová úspora majitelů (ročně): příspěvek jednatelům × 12 × 0.21. */
export function benefitDirectorsTaxSavings(directorsAmountMonthly: number): number {
  return directorsAmountMonthly * 12 * BENEFIT_DIRECTORS_TAX_SAVINGS_RATE;
}

// ----- Assets / Liabilities -----

export function totalAssetsFromValues(assets: {
  cash?: number;
  realEstate?: number;
  investments?: number;
  pension?: number;
  other?: number;
}): number {
  const c = Number(assets?.cash) || 0;
  const r = Number(assets?.realEstate) || 0;
  const i = Number(assets?.investments) || 0;
  const p = Number(assets?.pension) || 0;
  const o = Number(assets?.other) || 0;
  return c + r + i + p + o;
}

export function totalLiabilitiesFromValues(liabilities: {
  mortgage?: number;
  loans?: number;
  other?: number;
}): number {
  const m = Number(liabilities?.mortgage) || 0;
  const l = Number(liabilities?.loans) || 0;
  const o = Number(liabilities?.other) || 0;
  return m + l + o;
}

export function netWorth(
  assets: Parameters<typeof totalAssetsFromValues>[0],
  liabilities: Parameters<typeof totalLiabilitiesFromValues>[0]
): number {
  return totalAssetsFromValues(assets) - totalLiabilitiesFromValues(liabilities);
}

// ----- Credit: monthly payment (annuity) -----
/** Monthly payment for loan: PMT = P * r * (1+r)^n / ((1+r)^n - 1). */
export function monthlyPayment(principal: number, annualRatePercent: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const rate = annualRatePercent / 100;
  const r = rate / 12;
  const n = termYears * 12;
  if (r <= 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/** Total amount paid over term. */
export function totalRepayment(monthly: number, termYears: number): number {
  return monthly * termYears * 12;
}

// ----- Goals: FV target for renta -----
/** Future value of monthly rent after inflation: FV = P * (1+i)^n. */
export function futureRentMonthly(todayMonthly: number, years: number): number {
  return todayMonthly * Math.pow(1 + RENTA_INFLATION, years);
}

/** Capital needed to sustain rent at withdrawal rate: (FV * 12) / RENTA_WITHDRAWAL_RATE. */
export function capitalForRenta(futureRentMonthly: number): number {
  return (futureRentMonthly * 12) / RENTA_WITHDRAWAL_RATE;
}

/** FV target for a goal: for renta = capitalForRenta(futureRentMonthly), else = amount. */
export function goalFvTarget(goal: { type: string; amount?: number; years?: number; horizon?: number }): number {
  const amt = Number(goal?.amount) || 0;
  if (goal?.type === 'renta') {
    const years = goal.years ?? goal.horizon ?? 1;
    const futureRent = futureRentMonthly(amt, years);
    return capitalForRenta(futureRent);
  }
  return amt;
}

/** PMT to reach FV: netNeeded * r / ((1+r)^n - 1). */
export function pmtToReachFv(
  fvTarget: number,
  initialPlusLump: number,
  annualRate: number,
  years: number
): { pmt: number; netNeeded: number; fvExisting: number } {
  const n = years * 12;
  const r = annualRate / 12;
  const fvExisting = initialPlusLump * Math.pow(1 + r, n);
  const netNeeded = Math.max(0, fvTarget - fvExisting);
  let pmt = 0;
  if (netNeeded > 0 && n > 0 && r > 0) {
    pmt = (netNeeded * r) / (Math.pow(1 + r, n) - 1);
  }
  return { pmt, netNeeded, fvExisting };
}

/** Compute goal's fvTarget, pmt, netNeeded from raw inputs (for addGoal / loadState). */
export function computeGoalComputed(
  type: string,
  amount: number,
  horizonYears: number,
  annualRate: number,
  initial: number,
  lumpsum: number
): { fvTarget: number; pmt: number; netNeeded: number } {
  const fvTarget = goalFvTarget({ type, amount, years: horizonYears, horizon: horizonYears });
  const initialTotal = initial + lumpsum;
  const { pmt, netNeeded } = pmtToReachFv(fvTarget, initialTotal, annualRate, horizonYears);
  return { fvTarget, pmt, netNeeded };
}

// ----- Strategy: FV for investments -----
/** FV of lump sum: P * (1+r)^n. */
export function fvLump(amount: number, years: number, annualRate: number): number {
  return amount * Math.pow(1 + annualRate, years);
}

/** FV of regular monthly payment: PMT * ((1+r)^n - 1) / r, r monthly, n in months. */
export function fvRegular(monthlyAmount: number, years: number, annualRate: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (n <= 0) return 0;
  if (r <= 0) return monthlyAmount * n;
  return monthlyAmount * (Math.pow(1 + r, n) - 1) / r;
}

/** Single investment FV (lump / monthly / pension). */
export function investmentFv(inv: InvestmentEntry, conservativeMode: boolean): number {
  const amt = inv.amount ?? 0;
  let r = inv.annualRate ?? 0.07;
  if (conservativeMode) r = Math.max(0, r - 0.02);
  const years = inv.years ?? 10;
  if (inv.type === 'lump') return fvLump(amt, years, r);
  return fvRegular(amt, years, r);
}

/** Sum of all investments FV and breakdown (lump total, monthly total). */
export function strategyTotals(
  investments: InvestmentEntry[],
  conservativeMode: boolean
): { totalFV: number; totalLump: number; totalMonthly: number; totalInvested: number } {
  let totalFV = 0;
  let totalLump = 0;
  let totalMonthly = 0;
  let totalInvested = 0;
  for (const inv of investments) {
    const fv = investmentFv(inv, conservativeMode);
    totalFV += fv;
    const amt = inv.amount ?? 0;
    const yrs = inv.years ?? 10;
    if (inv.type === 'lump') {
      totalLump += amt;
      totalInvested += amt;
    } else {
      totalMonthly += amt;
      totalInvested += amt * yrs * 12;
    }
  }
  return { totalFV, totalLump, totalMonthly, totalInvested };
}

// ----- Loans list sum -----
export function loansListBalanceSum(loansList: { balance?: number | string }[]): number {
  return (loansList || []).reduce((a, b) => a + (parseFloat(String(b.balance)) || 0), 0);
}

export function loansListPaymentsSum(loansList: { pay?: number }[]): number {
  return (loansList || []).reduce((a, b) => a + (parseFloat(String(b.pay)) || 0), 0);
}

// ----- Credit wish: own resources from LTV / AKO -----
export function ownResourcesFromLtv(amount: number, ltvPercent: number): number {
  if (amount <= 0 || ltvPercent <= 0) return 0;
  const ltv = ltvPercent / 100;
  return Math.round((amount * (1 / ltv - 1)) / 1000) * 1000;
}

export function ownResourcesFromAko(amount: number, akoPercent: number): number {
  if (amount <= 0) return 0;
  return Math.round((amount * akoPercent) / 100 / 1000) * 1000;
}

// ----- Income protection: benefit vs salary comparison -----

export interface BenefitVsSalaryOptions {
  netFromGrossFactor?: number;
  deductionsPercent?: number;
  employerCostFactor?: number;
}

/**
 * Compute Variant A (salary increase) vs Variant B (company benefit) for a given monthly net contribution.
 * Uses configurable rates from BENEFIT_OPTIMIZATION unless overridden.
 */
export function computeBenefitVsSalaryComparison(
  companyContributionMonthly: number,
  options?: ComputeBenefitVsSalaryOptions
): BenefitVsSalaryComparison {
  if (companyContributionMonthly <= 0) {
    return {
      salaryIncreaseGrossEquivalent: 0,
      salaryVariantCompanyCost: 0,
      salaryVariantNetToPerson: 0,
      benefitVariantCompanyCost: 0,
      benefitVariantNetToInsurance: 0,
      estimatedSavings: 0,
      ownerTaxSavingsAnnual: 0,
      explanation: undefined,
    };
  }
  const netFactor = options?.netFromGrossFactor ?? BENEFIT_OPTIMIZATION.netFromGrossFactor;
  const employerFactor = options?.employerCostFactor ?? BENEFIT_OPTIMIZATION.employerCostFactor;
  const isOwnerRole = options?.isOwnerRole ?? false;
  const ownerTaxPct = BENEFIT_OPTIMIZATION.ownerTaxSavingsPercent ?? 0;

  const benefitVariantCompanyCost = companyContributionMonthly;
  const benefitVariantNetToInsurance = companyContributionMonthly;
  const companyContributionAnnual = companyContributionMonthly * 12;

  const salaryVariantNetToPerson = companyContributionMonthly;
  const grossEquivalent = netFactor > 0 ? companyContributionMonthly / netFactor : 0;
  const salaryVariantCompanyCost = Math.round(grossEquivalent * employerFactor * 100) / 100;
  const salaryIncreaseGrossEquivalent = Math.round(grossEquivalent * 100) / 100;

  const estimatedSavingsMonthly = salaryVariantCompanyCost - benefitVariantCompanyCost;
  const estimatedSavingsAnnual = Math.round(estimatedSavingsMonthly * 12 * 100) / 100;

  const ownerTaxSavingsAnnual =
    isOwnerRole && ownerTaxPct > 0
      ? Math.round((companyContributionAnnual * ownerTaxPct) / 100)
      : undefined;

  const explanation =
    estimatedSavingsMonthly > 0
      ? `Při firemním příspěvku ${companyContributionMonthly.toLocaleString('cs-CZ')} Kč/měsíc firma ušetří oproti navýšení mzdy cca ${estimatedSavingsAnnual.toLocaleString('cs-CZ')} Kč ročně. Celá částka jde do pojištění.`
      : undefined;

  return {
    salaryIncreaseGrossEquivalent,
    salaryVariantCompanyCost,
    salaryVariantNetToPerson,
    benefitVariantCompanyCost,
    benefitVariantNetToInsurance,
    estimatedSavings: estimatedSavingsAnnual,
    ownerTaxSavingsAnnual,
    explanation,
  };
}
