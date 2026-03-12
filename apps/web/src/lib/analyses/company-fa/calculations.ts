/**
 * Company FA – pure calculations. Aligned with PHASE1_AUDIT (updateStep1, updateStep2, etc.).
 */

import type { CompanyFaPayload, CompanyFaInvestmentItem, CompanyIndustry } from "./types";

/** Wage fund per month (employees × avgWage). */
export function wageFund(employees: number, avgWage: number): number {
  return employees * avgWage;
}

/** Risk level from industry: office/services = Nízká, light = Střední, heavy/construction/transport = Vysoká. */
export function industryRiskLevel(industry: CompanyIndustry | string): "low" | "medium" | "high" {
  const ind = String(industry || "").toLowerCase();
  if (ind === "office" || ind === "services") return "low";
  if (ind === "light-manufacturing") return "medium";
  if (
    ind === "heavy-manufacturing" ||
    ind === "construction" ||
    ind === "transport"
  ) return "high";
  return "medium";
}

/** Monthly expense: wage cost (employees×avgWage×1.34) + loan payment. */
export function monthlyExp(
  employees: number,
  avgWage: number,
  loanPayment: number
): number {
  return employees * avgWage * 1.34 + loanPayment;
}

/** Cash runway in months (floor(reserve / monthlyExp)). */
export function runway(reserve: number, monthlyExpVal: number): number {
  if (monthlyExpVal <= 0) return 0;
  return Math.floor(reserve / monthlyExpVal);
}

/** Inflation loss at 3.5% of reserve (for warning). */
export const INFLATION_RATE = 0.035;
export function inflationLoss(reserve: number): number {
  return reserve * INFLATION_RATE;
}

/** Step 1 KPI: wage fund and risk level from payload. */
export function step1Kpi(payload: CompanyFaPayload) {
  const { company } = payload;
  const wf = wageFund(company.employees ?? 0, company.avgWage ?? 0);
  const risk = industryRiskLevel(company.industry ?? "office");
  return { wageFund: wf, riskLevel: risk };
}

/** Step 2 KPI: monthlyExp, runway, inflation loss, yearly loan service. */
export function step2Kpi(payload: CompanyFaPayload) {
  const { company, finance } = payload;
  const emp = company.employees ?? 0;
  const wage = company.avgWage ?? 0;
  const reserve = finance.reserve ?? 0;
  const loan = finance.loanPayment ?? 0;
  const me = monthlyExp(emp, wage, loan);
  const run = runway(reserve, me);
  const inf = inflationLoss(reserve);
  const yearlyLoanService = loan * 12;
  return { monthlyExp: me, runway: run, inflationLoss: inf, yearlyLoanService };
}

/** Benefit calculations (updateBenefitCalc). */
export function benefitCalc(payload: CompanyFaPayload) {
  const b = payload.benefits ?? {};
  const amount = b.amount ?? 0;
  const count = b.count ?? (payload.company?.employees ?? 0);
  const yearlyCost = amount * count * 12;
  const grossEquiv = amount > 0 ? amount / 0.67 : 0;
  const employerCost = grossEquiv * 1.338;
  const netForEmployee = grossEquiv * 0.67;
  const savings = (employerCost - amount) * count * 12;
  const directorsAmount = b.directorsAmount ?? 0;
  const directorsYearly = directorsAmount * 12;
  const taxSavingsOwners = directorsYearly * 0.21;
  const totalFromOwn = (payload.directors ?? []).reduce(
    (sum, d) => sum + (d.paysFromOwn ? (d.paysFromOwnAmount ?? 0) : 0),
    0
  );
  const yearlyFromOwn = totalFromOwn * 12;
  const grossEquivFromOwn = totalFromOwn > 0 ? totalFromOwn / 0.67 : 0;
  const companySavings = yearlyFromOwn * 0.19;
  const directorSavings =
    totalFromOwn > 0
      ? (grossEquivFromOwn * 1.338 - totalFromOwn) * 12 * 0.15
      : 0;
  const totalTransferSavings = companySavings + directorSavings;
  return {
    yearlyCost,
    grossEquiv,
    employerCost,
    netForEmployee,
    savings,
    directorsYearly,
    taxSavingsOwners,
    totalFromOwn,
    yearlyFromOwn,
    totalTransferSavings,
  };
}

const RISK_KEYS = ["property", "interruption", "liability", "director", "fleet", "cyber"] as const;

function riskHas(risks: CompanyFaPayload["risks"], key: (typeof RISK_KEYS)[number]): boolean {
  const v = risks?.[key];
  return typeof v === "boolean" ? v : !!(v as { has?: boolean })?.has;
}

/** Risk score: covered count and gaps text (updateRiskScore). */
export function riskScore(payload: CompanyFaPayload) {
  const r = payload.risks ?? {};
  const covered = RISK_KEYS.filter((k) => riskHas(r, k)).length;
  const gaps: string[] = [];
  if (!riskHas(r, "property")) gaps.push("Majetek");
  if (!riskHas(r, "liability")) gaps.push("Odpovědnost");
  if (!r.director) gaps.push("D&O");
  return { covered, total: 6, gaps };
}

/** Risk audit tips (getRiskAuditTips). */
export function getRiskAuditTips(payload: CompanyFaPayload): string[] {
  const r = payload.risks ?? {};
  const revenue = payload.finance?.revenue ?? 0;
  const tips: string[] = [];
  for (const k of ["property", "interruption", "liability"] as const) {
    const obj = r[k] && typeof r[k] === "object" ? (r[k] as { has?: boolean; limit?: number; contractYears?: number }) : null;
    if (obj?.has) {
      if ((obj.contractYears ?? 0) > 3) tips.push("Smlouvy starší 3 let");
      if (k === "liability" && (obj.limit ?? 0) > 0 && revenue > 0 && (obj.limit ?? 0) < revenue)
        tips.push("Nízké limity odpovědnosti");
    }
  }
  return tips;
}

/** Director insurance gap (calculateInsuranceGap). */
export function calculateInsuranceGap(payload: CompanyFaPayload): {
  needed: number;
  gap: number;
  recommended: number;
} {
  const firstDir = payload.directors?.[0] ?? null;
  const income = firstDir ? (firstDir.netIncome ?? 0) : 0;
  const ins = payload.directorIns ?? {};
  const statePension =
    (ins.statePensionMonthly ?? 0) > 0 ? (ins.statePensionMonthly ?? 0) : income * 0.5;
  const requiredMonthly = income;
  if (requiredMonthly <= 0) return { needed: 0, gap: 0, recommended: 0 };
  let neededCapital = (requiredMonthly - statePension) / 0.005;
  if (neededCapital < 0) neededCapital = 0;
  const degree = typeof ins.invalidityDegree === "number" ? ins.invalidityDegree : parseInt(String(ins.invalidityDegree ?? 3), 10) || 3;
  if (degree === 1) neededCapital = neededCapital * 0.25;
  const current = ins.invalidity ?? 0;
  const gap = Math.max(0, neededCapital - current);
  return { needed: neededCapital, gap, recommended: neededCapital };
}

/** Director insurance recommendations (updateInsuranceRec). */
export function directorInsuranceRec(payload: CompanyFaPayload) {
  const firstDir = payload.directors?.[0] ?? null;
  const income = firstDir ? (firstDir.netIncome ?? 0) : 0;
  const yearly = income * 12;
  const recDeath = yearly * 5;
  const invGap = calculateInsuranceGap(payload);
  const recInv = invGap.recommended;
  const recSickPerDay = Math.round(income * 0.6 / 30);
  const ins = payload.directorIns ?? {};
  const belowDeath = (ins.death ?? 0) < recDeath;
  const belowInv = (ins.invalidity ?? 0) < recInv;
  const belowSick = (ins.sick ?? 0) < recSickPerDay;
  const isOsvc = firstDir?.incomeType === "osvc";
  return {
    recDeath,
    recInv,
    recSickPerDay,
    invGap,
    belowDeath,
    belowInv,
    belowSick,
    isOsvc,
  };
}

/** FV for lump sum: amount * (1+rate)^years */
export function calcFVLump(amount: number, years: number, rate: number): number {
  return amount * Math.pow(1 + rate, years);
}

/** FV for regular (monthly) payments: monthly * ((1+r)^n - 1) / r, r = rate/12, n = years*12 */
export function calcFVReg(monthly: number, years: number, rate: number): number {
  const r = rate / 12;
  const n = years * 12;
  if (r === 0) return monthly * n;
  return monthly * (Math.pow(1 + r, n) - 1) / r;
}

/** Recompute investment FV for all items; returns new investments with computed.fv and totals. */
export function recalcStrategy(payload: CompanyFaPayload): {
  investments: CompanyFaInvestmentItem[];
  totalFV: number;
  totalLump: number;
  totalMonthly: number;
} {
  const invs = payload.investments ?? [];
  const conservative = payload.strategy?.conservativeMode ?? false;
  let totalFV = 0;
  let totalLump = 0;
  let totalMonthly = 0;
  const investments: CompanyFaInvestmentItem[] = invs.map((inv) => {
    const rate = Math.max(0, (inv.annualRate ?? 0) - (conservative ? 0.02 : 0));
    let fv = 0;
    if (inv.type === "lump") {
      fv = calcFVLump(inv.amount ?? 0, inv.years ?? 0, rate);
      totalLump += inv.amount ?? 0;
    } else if (inv.type === "monthly" || inv.type === "pension") {
      fv = calcFVReg(inv.amount ?? 0, inv.years ?? 0, rate);
      totalMonthly += inv.amount ?? 0;
    }
    totalFV += fv;
    return {
      ...inv,
      computed: { ...inv.computed, fv },
    };
  });
  return { investments, totalFV, totalLump, totalMonthly };
}
