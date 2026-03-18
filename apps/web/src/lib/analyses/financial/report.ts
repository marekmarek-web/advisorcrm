/**
 * Financial analysis – report generation (HTML string, insurance computation).
 * Extracted from financni-analyza.html (Phase 1). Preserves behavior 1:1.
 */

import type { FinancialAnalysisData, CompanyRisks, FundDetail, IncomeProtectionPlan } from './types';
import { STATE_PENSION_TAX_LIMIT_ANNUAL, STATE_PENSION_TAX_REFUND_ANNUAL } from './types';
import { CREDIT_WISH_BANKS, FUND_DETAILS, FUND_LOGOS, INSURANCE_LOGOS } from './constants';
import { buildPremiumReportHTML } from './report/index';
import {
  totalIncome,
  totalExpense,
  totalAssetsFromValues,
  totalLiabilitiesFromValues,
  futureRentMonthly,
  capitalForRenta,
  investmentFv,
  companyRunway,
} from './calculations';
import {
  formatCzk,
  formatCurrency,
  formatCurrencyDaily,
  formatCurrencyMonthly,
  formatCurrencyYearly,
  formatInteger,
  formatPercent,
  getProductName,
  getStrategyDesc,
  getStrategyProfileLabel,
} from './formatters';
import { getAgeFromBirthDate, getRiskLabel } from './incomeProtection';
import { getGrowthChartData } from './charts';

/* Aidvisor / WePlan theme: --wp-text #1f1c2e, --wp-text-muted #4a4a4a, --wp-border #e9ebf0, --wp-accent #0073ea, --wp-bg #f3f6fd, --wp-font Source Sans 3 */
export const PDF_STYLES = `
@page { size: A4; margin: 10mm; }
.pdf {
  font-family: 'Source Sans 3', system-ui, -apple-system, sans-serif;
  color: #1f1c2e;
  background: #ffffff;
}
.pdf-page {
  width: 210mm;
  min-height: 297mm;
  max-height: 297mm;
  padding: 15mm;
  box-sizing: border-box;
  page-break-after: always;
  page-break-before: auto;
  position: relative;
  background-color: white;
  overflow: visible;
  margin: 0;
  box-shadow: none;
  border-radius: 0;
}
.pdf-page:last-child { page-break-after: auto; }
.pdf-page-content {
  padding-bottom: 22mm;
  box-sizing: border-box;
  min-height: 0;
  max-height: calc(297mm - 15mm - 15mm - 22mm);
  overflow: visible;
}
.pdf-section {
  margin-bottom: 20px;
  page-break-inside: avoid;
  break-inside: avoid;
}
.avoid-break {
  break-inside: avoid;
  page-break-inside: avoid;
  -webkit-column-break-inside: avoid;
}
.force-break { page-break-before: always; }
.h1 { font-size: 22pt; font-weight: 800; letter-spacing: -0.02em; color: #1f1c2e; margin-bottom: 5mm; }
.h2 {
  font-size: 14pt;
  font-weight: 800;
  margin-top: 6mm;
  margin-bottom: 5mm;
  color: #0073ea;
  border-left: 4px solid #0073ea;
  padding-left: 4mm;
  line-height: 1;
  display: flex;
  align-items: center;
  min-height: 18px;
  page-break-after: avoid;
}
.muted { color: #4a4a4a; font-size: 9pt; }
.badge { border: 1px solid #e9ebf0; border-radius: 999px; padding: 1mm 3mm; font-size: 8pt; display: inline-block; white-space: nowrap; }
.inv-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 7pt;
  padding: 1.6mm 3.6mm;
  border-radius: 2mm;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  min-width: 18mm;
  min-height: 6mm;
  height: auto;
  line-height: 1;
  box-sizing: border-box;
  vertical-align: middle;
}
.inv-badge-lump { background: #e8edf7; color: #0073ea; }
.inv-badge-monthly { background: #e0f2e8; color: #00c875; }
.inv-badge-pension { background: #fef0db; color: #fdab3d; }
.yield-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8pt;
  padding: 1.6mm 2.5mm;
  border-radius: 2mm;
  background: #e0f2e8;
  color: #00c875;
  font-weight: 600;
  min-width: 10mm;
  min-height: 5mm;
  height: auto;
  line-height: 1;
}
.table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; page-break-inside: avoid; table-layout: fixed; }
.table th { text-align: left; font-size: 9pt; color: #4a4a4a; border-bottom: 2px solid #e9ebf0; padding: 2.5mm 2mm; font-weight: 700; }
.table td { font-size: 10pt; border-bottom: 1px solid #e9ebf0; padding: 2.5mm 2mm; color: #1f1c2e; vertical-align: middle; font-variant-numeric: tabular-nums; }
.table th:nth-child(2), .table th:nth-child(4), .table td:nth-child(2), .table td:nth-child(4) { text-align: center; }
.table tr { page-break-inside: avoid; }
.table tr:last-child td { border-bottom: none; }
.table-5col { table-layout: fixed; }
.table-5col td { vertical-align: middle; padding: 3mm 2mm; }
.table-5col th:nth-child(1), .table-5col td:nth-child(1) { width: 28%; text-align: left; padding-left: 3mm; }
.table-5col th:nth-child(2), .table-5col td:nth-child(2) { width: 15%; text-align: center; }
.table-5col th:nth-child(3), .table-5col td:nth-child(3) { width: 17%; text-align: right; font-variant-numeric: tabular-nums; }
.table-5col th:nth-child(4), .table-5col td:nth-child(4) { width: 12%; text-align: center; }
.table-5col th:nth-child(5), .table-5col td:nth-child(5) { width: 28%; text-align: right; font-weight: 700; color: #0073ea; font-variant-numeric: tabular-nums; }
.table-5col .fund-name {
  font-weight: 700;
  line-height: 1.15;
  color: #1f1c2e;
  word-break: break-word;
  overflow-wrap: break-word;
}
.total-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4mm;
  background: #f3f6fd;
  padding: 3mm 4mm;
  border-radius: 3mm;
  border: 1px solid #e9ebf0;
}
.total-chip {
  background: white;
  border: 1px solid #e9ebf0;
  border-radius: 2mm;
  padding: 2mm 3mm;
  font-size: 8pt;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.total-chip-label { color: #4a4a4a; font-weight: 500; }
.total-chip-value { color: #1f1c2e; font-weight: 700; margin-left: 1.5mm; }
.total-fv { font-size: 13pt; font-weight: 800; color: #0073ea; white-space: nowrap; }
.kpi { display: flex; gap: 4mm; margin-bottom: 8mm; }
.kpi .box { flex: 1; border: 1px solid #e9ebf0; border-radius: 4mm; padding: 4mm; text-align: center; }
.kpi .val { font-size: 14pt; font-weight: 800; color: #1f1c2e; }
.kpi .lbl { font-size: 8pt; color: #4a4a4a; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 1mm; display: block; }
.interpretation { background-color: #f3f6fd; padding: 4mm; border-radius: 2mm; margin-bottom: 8mm; border-left: 3px solid #0073ea; font-size: 9pt; color: #4a4a4a; }
.interpretation strong { color: #1f1c2e; }
.fund-card { margin-bottom: 5mm; padding: 4mm; border: 1px solid #e9ebf0; border-radius: 3mm; page-break-inside: avoid; background: #fff; }
.fund-card-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2mm; border-bottom: 1px dashed #e9ebf0; padding-bottom: 2mm; }
.fund-title { font-weight: 800; font-size: 11pt; color: #0073ea; }
.fund-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; font-size: 9pt; }
.fund-label { font-size: 8pt; color: #4a4a4a; font-weight: 600; text-transform: uppercase; }
.fund-text { color: #1f1c2e; line-height: 1.4; }
.product-tags { display: flex; gap: 2mm; margin-top: 1mm; }
.tag { font-size: 7pt; padding: 0.5mm 2mm; border-radius: 2px; background: #f1f5f9; color: #475569; }
.assumptions-box { background: #fefce8; border: 1px solid #fef08a; padding: 4mm; border-radius: 2mm; font-size: 9pt; color: #854d0e; margin-top: 5mm; }
.footer { position: absolute; bottom: 10mm; left: 15mm; right: 15mm; font-size: 7pt; color: #7a869e; display: flex; justify-content: space-between; border-top: 1px solid #e9ebf0; padding-top: 2mm; }
.pdf-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ffcc00; padding-bottom: 2mm; margin-bottom: 6mm; font-size: 9pt; }
.pdf-title-page { display: flex; flex-direction: column; justify-content: center; height: 260mm; }
.pdf-title-page .pdf-page-content { padding-bottom: 10mm; }
.keep-together { page-break-inside: avoid; break-inside: avoid; }
.pdf-logo-fallback {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 24px; min-height: 24px; padding: 0 2mm;
  background: #f1f5f9; color: #475569; border-radius: 2mm;
  font-size: 8pt; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;
}
`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Logo for PDF: always render text fallback (no <img>) so PDF/print never shows broken image.
 * When logoUrl is missing or empty, or for safe PDF export, only the fallback label is shown.
 */
function renderLogoOrFallback(logoUrl: string | undefined, fallbackLabel: string, _sizeStyle = 'width: 24px; height: 24px; object-fit: contain; vertical-align: middle; margin-right: 2mm;'): string {
  const label = escapeHtml(fallbackLabel || '');
  const url = (logoUrl || '').trim();
  if (!url) {
    return `<span class="pdf-logo-fallback">${label}</span>`;
  }
  return `<span class="pdf-logo-fallback">${label}</span>`;
}

const PDF_REPORT_AUTHOR_FALLBACK = 'Marek Marek';
const PDF_REPORT_FOOTER_FALLBACK = 'Marek Marek - Privátní finanční plánování | www.marek-marek.cz | +420 778 511 166';

function renderPdfHeader(
  sectionTitle: string,
  clientName: string,
  dateStr: string,
  authorName: string
): string {
  return `<div class="pdf-header" style="border-bottom-color: #0073ea;"><span style="font-weight: 700; color: #1f1c2e;">${escapeHtml(sectionTitle)}</span><span style="color: #4a4a4a;">Vypracoval: ${escapeHtml(authorName)} dne: ${escapeHtml(dateStr)} pro: ${escapeHtml(clientName)}</span></div>`;
}

function renderPdfFooter(footerLine: string): string {
  return `<div class="footer"><span>${escapeHtml(footerLine)}</span><span>Strana ${FOOTER_PAGE_PLACEHOLDER}</span></div>`;
}

const FOOTER_PAGE_PLACEHOLDER = '{{FOOTER_PAGE}}';

// ----- Insurance computation (same constants and logic as HTML) -----
const GROSS_FROM_NET_FACTOR = 0.74;
const RENT_RATE = 0.06;
const RENT_MULTIPLIER = 200;
const INVALIDITY_COST_INCREASE = 1.2;
const RH1 = 1633;
const RH2 = 2449;
const RH3 = 4897;
const MAX_REDUCED_DVZ = 2419;

function calculateReducedDVZ(dvz: number): number {
  let reduced = 0;
  if (dvz <= RH1) reduced = dvz * 0.9;
  else if (dvz <= RH2) reduced = RH1 * 0.9 + (dvz - RH1) * 0.6;
  else if (dvz <= RH3) reduced = RH1 * 0.9 + (RH2 - RH1) * 0.6 + (dvz - RH2) * 0.3;
  else reduced = RH1 * 0.9 + (RH2 - RH1) * 0.6 + (RH3 - RH2) * 0.3;
  return Math.min(reduced, MAX_REDUCED_DVZ);
}

function estimateInvalidityPension(net: number, isOsvc: boolean): number {
  const factor = isOsvc ? 0.7 : 1;
  let pension = 0;
  if (net <= 20000) pension = Math.round(net * 0.45);
  else if (net <= 40000) pension = Math.round(9000 + (net - 20000) * 0.35);
  else if (net <= 60000) pension = Math.round(16000 + (net - 40000) * 0.25);
  else pension = Math.round(21000 + (net - 60000) * 0.15);
  return Math.round(pension * factor);
}

export interface InsuranceResult {
  netIncome: number;
  totalExpenses: number;
  totalLiquidAssets: number;
  liquidReserve: number;
  liquidInvestments: number;
  loansTotal: number;
  hasPartner: boolean;
  childrenCount: number;
  clientAge: number;
  riskJob: string;
  isOSVC: boolean;
  partnerIncome: number;
  totalParentsIncome: number;
  invalidity: {
    needBase: number;
    needMonthly: number;
    statePension: number;
    ownAssetRenta: number;
    gapMonthly: number;
    capital: number;
    rentaFromInsurance: number;
  };
  sickness: {
    DVZ: number;
    reducedDVZ: number;
    sicknessDaily: number;
    sicknessMonthly: number;
    gapMonthly: number;
    dailyBenefit: number;
    totalMonthly: number;
    reserveMonths: number;
    optional: boolean;
    isOSVC: boolean;
  };
  tn: { base: number; progress: number; max: number };
  dailyComp: { daily: number; suggested: boolean; why: string };
  death: {
    liabilities: number;
    familyProtection: number;
    partnerLumpSum: number;
    childrenLumpSum: number;
    incomeReplacementCapital: number;
    survivorStateSupport: number;
    reserves: number;
    coverage: number;
    individual: boolean;
  };
  childInsurance: Array<{
    name: string;
    age: number;
    invalidity: number;
    tn: number;
    tnProgress: number;
    tnMax: number;
    dailyComp: number;
  }>;
  partnerInsurance: {
    name: string;
    income: number;
    invalidity: { capital: number; statePension: number; needMonthly: number };
    sickness: { sicknessMonthly: number; dailyBenefit: number; gapMonthly: number };
    tn: { base: number; progress: number; max: number };
    death: { coverage: number };
  } | null;
}

export function computeInsurance(data: FinancialAnalysisData): InsuranceResult {
  const netIncome = Number(data.cashflow?.incomes?.main) || 0;
  const partnerIncome = Number(data.cashflow?.incomes?.partner) || 0;
  const children = data.children || [];
  const childrenCount = children.length;
  const loansTotal =
    (Number(data.liabilities?.mortgage) || 0) +
    (Number(data.liabilities?.loans) || 0) +
    (Number(data.liabilities?.other) || 0);
  const liquidReserve = Number(data.assets?.cash) || 0;
  const liquidInvestments = Number(data.assets?.investments) || 0;
  const hasPartner = Boolean(data.client?.hasPartner);
  const riskJob = (data.insurance?.riskJob as string) || 'low';
  const invalidity50Plus = Boolean(data.insurance?.invalidity50Plus);
  const clientAge = getAgeFromBirthDate(data.client?.birthDate ?? '') ?? 35;
  const incomeType = data.cashflow?.incomeType || 'zamestnanec';
  const isOSVC = incomeType === 'osvc';

  const totalLiquidAssets = liquidReserve + liquidInvestments;
  const totalExpenses = totalExpense(data.cashflow?.expenses ?? {});
  const totalParentsIncome = netIncome + partnerIncome;
  const currentYear = new Date().getFullYear();

  // Invalidity
  const invalidityNeedBase = Math.max(totalExpenses, netIncome);
  const invalidityNeedMonthly = Math.round(invalidityNeedBase * INVALIDITY_COST_INCREASE);
  const statePensionD3 = estimateInvalidityPension(netIncome, isOSVC);
  const ownAssetRentaMonthly = Math.round((totalLiquidAssets * RENT_RATE) / 12);
  const invalidityGapMonthly = Math.max(0, invalidityNeedMonthly - statePensionD3 - ownAssetRentaMonthly);
  let invalidityCapital = Math.ceil((invalidityGapMonthly * RENT_MULTIPLIER) / 100000) * 100000;
  if (invalidity50Plus) invalidityCapital = Math.ceil((invalidityCapital * 0.5) / 100000) * 100000;
  const invalidityRentaFromInsurance = Math.round(invalidityCapital / RENT_MULTIPLIER);

  // Sickness
  let sicknessDaily = 0,
    sicknessMonthly = 0,
    pnGapMonthly = netIncome,
    DVZ = 0,
    reducedDVZ = 0;
  if (isOSVC) {
    pnGapMonthly = netIncome;
  } else {
    const grossIncome = Math.round(netIncome / GROSS_FROM_NET_FACTOR);
    DVZ = Math.round((grossIncome * 12) / 365);
    reducedDVZ = calculateReducedDVZ(DVZ);
    sicknessDaily = Math.round(reducedDVZ * 0.66);
    sicknessMonthly = sicknessDaily * 30;
    pnGapMonthly = Math.max(0, netIncome - sicknessMonthly);
  }
  const pnDailyBenefit = Math.ceil(pnGapMonthly / 30 / 100) * 100;
  const pnTotalMonthly = sicknessMonthly + pnDailyBenefit * 30;
  const pnReserveMonths = pnGapMonthly > 0 ? Math.floor(liquidReserve / pnGapMonthly) : 999;
  const pnOptional = !isOSVC && pnReserveMonths >= 3;

  // TN
  let tnBase = 1000000;
  if (netIncome >= 100000) tnBase = 3000000;
  else if (netIncome >= 50000) tnBase = 2000000;
  else if (netIncome >= 30000) tnBase = 1500000;
  const tnProgress = 8;
  const tnMax = tnBase * tnProgress;

  // Daily comp
  let doDaily = 0,
    doSuggested = false,
    doWhy = '';
  if (riskJob === 'high') {
    doDaily = 500;
    doSuggested = true;
    doWhy = 'Rizikové povolání (manuální práce)';
  } else if (riskJob === 'medium') {
    doDaily = 300;
    doSuggested = true;
    doWhy = 'Středně rizikové povolání';
  } else {
    doDaily = 150;
    doWhy = 'Volitelné (kancelářská práce)';
  }

  // Death
  const survivorStateSupport = 10000;
  const yearsTo65 = Math.max(0, 65 - clientAge);
  const partnerLumpSum = hasPartner ? 500000 : 0;
  let childrenLumpSum = 0;
  children.forEach((child) => {
    let childAge = 10;
    const yearMatch = String(child.birthDate || '').match(/(\d{4})/);
    if (yearMatch) childAge = currentYear - parseInt(yearMatch[1], 10);
    const yearsTo18 = Math.max(0, 18 - childAge);
    childrenLumpSum += 200000 + yearsTo18 * 12 * 5000;
  });
  const monthlyNeedForFamily = Math.max(0, netIncome - survivorStateSupport);
  const incomeReplacementYears = hasPartner ? Math.min(yearsTo65, 20) : 0;
  const incomeReplacementCapital = monthlyNeedForFamily * 12 * incomeReplacementYears * 0.7;
  const familyProtection = Math.max(incomeReplacementCapital, partnerLumpSum + childrenLumpSum);
  const deathNeedTotal = loansTotal + familyProtection;
  const deathCoverage = Math.ceil(Math.max(0, deathNeedTotal - totalLiquidAssets) / 100000) * 100000;
  const deathIndividual = !hasPartner && childrenCount === 0 && loansTotal === 0;

  // Child insurance
  const childInsurance = children.map((child, idx) => {
    let childAge = 10;
    const yearMatch = String(child.birthDate || '').match(/(\d{4})/);
    if (yearMatch) childAge = currentYear - parseInt(yearMatch[1], 10);
    let invalidityChild: number, tnChild: number, doChild: number;
    if (totalParentsIncome >= 50000) {
      invalidityChild = 5000000;
      tnChild = 2000000;
      doChild = 500;
    } else if (totalParentsIncome >= 30000) {
      invalidityChild = 4000000;
      tnChild = 1500000;
      doChild = 400;
    } else {
      invalidityChild = 3000000;
      tnChild = 1000000;
      doChild = 300;
    }
    return {
      name: child.name || `Dítě ${idx + 1}`,
      age: childAge,
      invalidity: invalidityChild,
      tn: tnChild,
      tnProgress: 8,
      tnMax: tnChild * 8,
      dailyComp: doChild,
    };
  });

  // Partner insurance
  let partnerInsurance: InsuranceResult['partnerInsurance'] = null;
  if (hasPartner && partnerIncome > 0) {
    const partnerGross = Math.round(partnerIncome / GROSS_FROM_NET_FACTOR);
    const partnerDVZ = Math.round((partnerGross * 12) / 365);
    const partnerReducedDVZ = calculateReducedDVZ(partnerDVZ);
    const partnerSicknessDaily = Math.round(partnerReducedDVZ * 0.66);
    const partnerSicknessMonthly = partnerSicknessDaily * 30;
    const partnerPnGap = Math.max(0, partnerIncome - partnerSicknessMonthly);
    const partnerPnDaily = Math.ceil(partnerPnGap / 30 / 100) * 100;
    const partnerInvalidityNeed = Math.round(partnerIncome * INVALIDITY_COST_INCREASE);
    const partnerStatePension = estimateInvalidityPension(partnerIncome, false);
    const partnerInvalidityGap = Math.max(0, partnerInvalidityNeed - partnerStatePension);
    let partnerInvalidityCapital = Math.ceil((partnerInvalidityGap * RENT_MULTIPLIER) / 100000) * 100000;
    const partnerBirthYear = data.partner?.birthDate?.match(/(\d{4})/);
    const partnerAge = partnerBirthYear ? currentYear - parseInt(partnerBirthYear[1], 10) : 35;
    if (invalidity50Plus && partnerAge >= 50) partnerInvalidityCapital = Math.ceil((partnerInvalidityCapital * 0.5) / 100000) * 100000;
    let partnerTnBase = 1000000;
    if (partnerIncome >= 100000) partnerTnBase = 3000000;
    else if (partnerIncome >= 50000) partnerTnBase = 2000000;
    else if (partnerIncome >= 30000) partnerTnBase = 1500000;
    partnerInsurance = {
      name: data.partner?.name || 'Partner',
      income: partnerIncome,
      invalidity: { capital: partnerInvalidityCapital, statePension: partnerStatePension, needMonthly: partnerInvalidityNeed },
      sickness: { sicknessMonthly: partnerSicknessMonthly, dailyBenefit: partnerPnDaily, gapMonthly: partnerPnGap },
      tn: { base: partnerTnBase, progress: 8, max: partnerTnBase * 8 },
      death: { coverage: Math.ceil((loansTotal * 0.5) / 100000) * 100000 },
    };
  }

  return {
    netIncome,
    totalExpenses,
    totalLiquidAssets,
    liquidReserve,
    liquidInvestments,
    loansTotal,
    hasPartner,
    childrenCount,
    clientAge,
    riskJob,
    isOSVC,
    partnerIncome,
    totalParentsIncome,
    invalidity: {
      needBase: invalidityNeedBase,
      needMonthly: invalidityNeedMonthly,
      statePension: statePensionD3,
      ownAssetRenta: ownAssetRentaMonthly,
      gapMonthly: invalidityGapMonthly,
      capital: invalidityCapital,
      rentaFromInsurance: invalidityRentaFromInsurance,
    },
    sickness: {
      DVZ,
      reducedDVZ,
      sicknessDaily,
      sicknessMonthly,
      gapMonthly: pnGapMonthly,
      dailyBenefit: pnDailyBenefit,
      totalMonthly: pnTotalMonthly,
      reserveMonths: pnReserveMonths,
      optional: pnOptional,
      isOSVC,
    },
    tn: { base: tnBase, progress: tnProgress, max: tnMax },
    dailyComp: { daily: doDaily, suggested: doSuggested, why: doWhy },
    death: {
      liabilities: loansTotal,
      familyProtection,
      partnerLumpSum,
      childrenLumpSum,
      incomeReplacementCapital,
      survivorStateSupport,
      reserves: totalLiquidAssets,
      coverage: deathCoverage,
      individual: deathIndividual,
    },
    childInsurance,
    partnerInsurance,
  };
}

// ----- Report HTML builders -----
function renderPasivaDetail(liabilities: FinancialAnalysisData['liabilities']): string {
  if (!liabilities) return '';
  const md = liabilities.mortgageDetails || { rate: 0, fix: 0, pay: 0 };
  const list = liabilities.loansList || [];
  const hasMortgage = (liabilities.mortgage || 0) > 0;
  const hasMortgageDetail = hasMortgage && (md.rate || md.fix || md.pay);
  const otherDesc = liabilities.otherDesc || '';
  const hasOther = (liabilities.other || 0) > 0;
  if (!hasMortgageDetail && list.length === 0 && !hasOther && !otherDesc) return '';
  let html = '<div style="margin-top: 6mm; font-size: 9pt; color: #475569;">';
  if (hasMortgage && hasMortgageDetail) {
    html += `<div style="margin-bottom: 3mm;"><strong>Hypotéka – detail:</strong> Úrok ${formatPercent((Number(md.rate) || 0) / 100, 1)}, Fixace ${Number(md.fix) || 0} let, Splátka ${formatCurrencyMonthly(Number(md.pay) || 0)}</div>`;
  }
  if (list.length > 0) {
    html += '<div style="margin-bottom: 2mm;"><strong>Úvěry – detail:</strong></div><table class="table" style="width: 100%; font-size: 9pt;"><thead><tr><th>Typ / Popis</th><th style="text-align:right">Zůstatek</th><th style="text-align:center">Úrok %</th><th style="text-align:center">Splatnost</th><th style="text-align:right">Splátka</th></tr></thead><tbody>';
    list.forEach((l) => {
      const type = l.type || 'Úvěr';
      const desc = l.desc ? ' – ' + escapeHtml(String(l.desc)) : '';
      const balance = Number(l.balance) || 0;
      const rate = Number(l.rate) || 0;
      const fix = Number(l.fix) || 0;
      const pay = Number(l.pay) || 0;
      html += `<tr><td>${type}${desc}</td><td style="text-align:right">${formatCzk(balance)}</td><td style="text-align:center">${rate}</td><td style="text-align:center">${fix} let</td><td style="text-align:right">${formatCzk(pay)}</td></tr>`;
    });
    html += '</tbody></table>';
  }
  if (hasOther && otherDesc) html += '<div style="margin-top: 3mm;"><strong>Ostatní závazky:</strong> ' + escapeHtml(otherDesc) + '</div>';
  html += '</div>';
  return html;
}

function renderGoalsRows(goals: FinancialAnalysisData['goals']): string {
  if (!goals?.length) return '<tr><td colspan="4" style="text-align:center; color:#94a3b8">Žádné cíle</td></tr>';
  return goals
    .map(
      (g) =>
        `<tr><td><span style="display: inline-block; background: #f1f5f9; color: #1f1c2e; padding: 1.5mm 4mm; border-radius: 2mm; font-weight: 600; font-size: 9pt;">${escapeHtml(g.name)}</span></td><td style="text-align:center">${g.years ?? 0} let</td><td style="text-align:right">${formatCzk(Math.round(g.computed?.fvTarget ?? 0))}</td><td style="text-align:right; font-weight:bold; color:#ffcc00;">${formatCzk(Math.round(g.computed?.pmt ?? 0))}</td></tr>`
    )
    .join('');
}

function renderInvestmentsRows(data: FinancialAnalysisData): string {
  const invs = data.investments || [];
  const conservative = data.strategy?.conservativeMode ?? false;
  const getBadgeClass = (type: string) => {
    if (type === 'lump') return 'inv-badge inv-badge-lump';
    if (type === 'pension') return 'inv-badge inv-badge-pension';
    return 'inv-badge inv-badge-monthly';
  };
  const getTypeName = (type: string) => (type === 'lump' ? 'Jednorázová' : type === 'pension' ? 'Penzijní' : 'Pravidelná');
  return invs
    .filter((i) => (i.amount || 0) > 0)
    .map((i) => {
      const displayRate = Math.max(0, (i.annualRate || 0) - (conservative ? 0.02 : 0));
      const fv = i.computed?.fv ?? 0;
      const logoHtml = renderLogoOrFallback(FUND_LOGOS[i.productKey], getProductName(i.productKey));
      return `<tr><td>${logoHtml}<span class="fund-name">${getProductName(i.productKey)}</span></td><td><span class="${getBadgeClass(i.type)}">${getTypeName(i.type)}</span></td><td style="text-align:right; font-variant-numeric: tabular-nums;">${i.type === 'lump' ? formatCzk(i.amount ?? 0) : formatCurrencyMonthly(i.amount ?? 0)}</td><td><span class="yield-pill">${formatPercent(displayRate)}</span></td><td style="text-align:right; font-weight:700; color:#0073ea; font-variant-numeric: tabular-nums;">${formatCzk(Math.round(fv))}</td></tr>`;
    })
    .join('');
}

function renderInvestmentsTotal(data: FinancialAnalysisData): string {
  const invs = data.investments || [];
  let totalMonthly = 0,
    totalLump = 0,
    totalFV = 0;
  invs.forEach((i) => {
    if (i.type === 'lump') totalLump += i.amount ?? 0;
    else totalMonthly += i.amount ?? 0;
    totalFV += i.computed?.fv ?? 0;
  });
  return `<tr><td colspan="5" style="padding: 3mm;"><div class="total-summary-bar"><strong style="font-size: 10pt; color: #1f1c2e;">CELKEM</strong><div style="display: flex; gap: 3mm;"><div class="total-chip"><span class="total-chip-label">Jednorázově:</span><span class="total-chip-value">${formatCzk(totalLump)}</span></div><div class="total-chip"><span class="total-chip-label">Měsíčně:</span><span class="total-chip-value">${formatCurrencyMonthly(totalMonthly)}</span></div></div><div class="total-fv">${formatCzk(Math.round(totalFV))}</div></div></td></tr>`;
}

function renderCreditWishesPDF(list: FinancialAnalysisData['newCreditWishList']): string {
  if (!Array.isArray(list) || list.length === 0) return '';
  const purposeLabels: Record<string, string> = {
    'bydleni-koupě': 'Bydlení – koupě nemovitosti',
    'bydleni-rekonstrukce': 'Bydlení – rekonstrukce',
    auto: 'Auto / vozidlo',
    konsolidace: 'Konsolidace úvěrů',
    ostatni: 'Ostatní',
  };
  const subTypeLabels: Record<string, string> = {
    standard: 'Klasická',
    investment: 'Investiční',
    american: 'Americká',
    consumer: 'Spotřebitelský',
    auto: 'Auto / Leasing',
    consolidation: 'Konsolidace',
  };
  let html = '<div class="pdf-section" style="margin-top: 10mm;"><div class="h2">Úvěry / hypotéky k vyřízení</div><table class="table" style="width: 100%; font-size: 9pt; margin-top: 5mm;"><thead><tr><th>Typ / Účel</th><th style="text-align:right">Částka</th><th style="text-align:center">LTV / Akontace</th><th style="text-align:center">Úrok %</th><th style="text-align:right">Měsíčně</th><th style="text-align:right">Celkem zaplatíte</th></tr></thead><tbody>';
  list.forEach((item) => {
    const bank = CREDIT_WISH_BANKS.find((b) => b.id === item.selectedBankId);
    const bankName = bank ? bank.name : item.selectedBankId === 'other' ? 'Jiná banka' : 'Nezadáno';
    const productLabel = item.product === 'mortgage' ? 'Hypotéka' : 'Úvěr';
    const subTypeLabel = subTypeLabels[item.subType] ?? item.subType;
    const purposeLabel = purposeLabels[item.purpose] ?? item.purpose;
    let ltvAko = '—';
    if (item.product === 'mortgage' && item.ltvPercent != null) ltvAko = formatPercent(Number(item.ltvPercent) / 100, 0);
    else if (item.product === 'loan' && item.subType === 'auto' && item.akoPercent != null) ltvAko = formatPercent(Number(item.akoPercent) / 100, 0);
    const rateNum = Number(item.estimatedRate ?? item.customRate ?? 0) / 100;
    html += `<tr><td><strong>${productLabel}</strong> (${subTypeLabel})<br/><span style="font-size:8pt; color:#4a4a4a;">${purposeLabel}</span><br/><span style="font-size:8pt; color:#94a3b8;">${bankName}</span></td><td style="text-align:right">${formatCzk(Math.round(item.amount))}</td><td style="text-align:center">${ltvAko}</td><td style="text-align:center">${formatPercent(rateNum, 2)}</td><td style="text-align:right"><strong>${formatCzk(Math.round(item.estimatedMonthly))}</strong></td><td style="text-align:right"><strong>${formatCzk(Math.round(item.estimatedTotal))}</strong></td></tr>`;
  });
  html += '</tbody></table><p style="margin-top: 4mm; font-size: 8pt; color: #4a4a4a;">Poznámka: Úrokové sazby jsou orientační.</p></div>';
  return html;
}

/** Holdings block (Top 10, Countries, Sectors) for fund detail page. */
function renderHoldingsBlock(detail: FundDetail): string {
  const hasHoldings = (detail.topHoldings?.length ?? 0) > 0 || (detail.countries?.length ?? 0) > 0 || (detail.sectors?.length ?? 0) > 0;
  if (!hasHoldings) return '';
  const maxWeight = Math.max(...[(detail.topHoldings ?? []).map((h) => h.weight), (detail.countries ?? []).map((c) => c.weight), (detail.sectors ?? []).map((s) => s.weight)].flat(), 1);
  const bar = (w: number) => `<div style="width: ${(w / maxWeight) * 100}%; min-width: 2px; height: 6px; background: #0073ea; border-radius: 2px;"></div>`;
  let html = '<div class="h2" style="margin-top: 4mm;">Holdings</div>';
  html += '<p style="font-size: 9pt; color: #4a4a4a; margin: 0 0 3mm 0;">Níže najdete informace o složení fondu.</p>';
  if ((detail.topHoldings?.length ?? 0) > 0) {
    html += '<div style="margin-bottom: 4mm;"><div style="font-size: 10pt; font-weight: 700; color: #1f1c2e; margin-bottom: 2mm;">Top 10 Holdings</div>';
    if (detail.top10WeightPercent != null && detail.totalHoldingsCount != null) {
      html += `<p style="font-size: 9pt; color: #4a4a4a; margin: 0 0 2mm 0;">Váha top 10: <strong>${formatPercent((detail.top10WeightPercent ?? 0) / 100, 2)}</strong> z ${formatInteger(detail.totalHoldingsCount ?? 0)} holdingu.</p>`;
    }
    html += '<div style="display: flex; flex-direction: column; gap: 1.5mm;">';
    detail.topHoldings!.forEach((h) => {
      html += `<div style="display: flex; align-items: center; gap: 3mm;"><span style="font-size: 9pt; color: #1f1c2e; min-width: 120px;">${escapeHtml(h.name)}</span><span style="font-size: 9pt; font-weight: 600; color: #0073ea; min-width: 36px;">${formatPercent(h.weight / 100, 2)}</span><div style="flex: 1; background: #e9ebf0; border-radius: 2px; overflow: hidden;">${bar(h.weight)}</div></div>`;
    });
    html += '</div></div>';
  }
  if ((detail.countries?.length ?? 0) > 0) {
    html += '<div style="margin-bottom: 4mm;"><div style="font-size: 10pt; font-weight: 700; color: #1f1c2e; margin-bottom: 2mm;">Země</div><div style="display: flex; flex-direction: column; gap: 1.5mm;">';
    (detail.countries ?? []).forEach((c) => {
      html += `<div style="display: flex; align-items: center; gap: 3mm;"><span style="font-size: 9pt; color: #1f1c2e; min-width: 80px;">${escapeHtml(c.name)}</span><span style="font-size: 9pt; font-weight: 600; color: #0073ea; min-width: 36px;">${formatPercent(c.weight / 100, 2)}</span><div style="flex: 1; background: #e9ebf0; border-radius: 2px; overflow: hidden;">${bar(c.weight)}</div></div>`;
    });
    html += '</div></div>';
  }
  if ((detail.sectors?.length ?? 0) > 0) {
    html += '<div><div style="font-size: 10pt; font-weight: 700; color: #1f1c2e; margin-bottom: 2mm;">Sektory</div><div style="display: flex; flex-direction: column; gap: 1.5mm;">';
    (detail.sectors ?? []).forEach((s) => {
      html += `<div style="display: flex; align-items: center; gap: 3mm;"><span style="font-size: 9pt; color: #1f1c2e; min-width: 100px;">${escapeHtml(s.name)}</span><span style="font-size: 9pt; font-weight: 600; color: #0073ea; min-width: 36px;">${formatPercent(s.weight / 100, 2)}</span><div style="flex: 1; background: #e9ebf0; border-radius: 2px; overflow: hidden;">${bar(s.weight)}</div></div>`;
    });
    html += '</div></div>';
  }
  return html;
}

/** Jedna stránka PDF per vybraný produkt (amount > 0). Pořadí dle HTML: název, badge, investice, popis, riziko/horizont/likvidita, strategie, výhody, parametry, očekávaná FV. */
function renderProductDetailPages(
  data: FinancialAnalysisData,
  clientName: string,
  today: string,
  authorName: string,
  footerLine: string
): string {
  const invs = (data.investments || []).filter((i) => (i.amount || 0) > 0);
  const conservative = data.strategy?.conservativeMode ?? false;
  const getTypeName = (type: string) => (type === 'lump' ? 'Jednorázová' : type === 'pension' ? 'Penzijní spoření' : 'Pravidelná');
  let html = '';
  invs.forEach((inv) => {
    const detail = FUND_DETAILS[inv.productKey];
    if (!detail) return;
    const name = getProductName(inv.productKey);
    const amount = inv.amount ?? 0;
    const typeName = getTypeName(inv.type);
    const fv = inv.computed?.fv ?? 0;
    const displayRate = Math.max(0, (inv.annualRate ?? 0) - (conservative ? 0.02 : 0));
    const badgeClass = inv.type === 'lump' ? 'inv-badge inv-badge-lump' : inv.type === 'pension' ? 'inv-badge inv-badge-pension' : 'inv-badge inv-badge-monthly';
    const productLogoHtml = renderLogoOrFallback(FUND_LOGOS[inv.productKey], getProductName(inv.productKey), 'width: 40px; height: 40px; object-fit: contain; margin-right: 3mm; flex-shrink: 0;');
    html += `
    <section class="pdf-page">
      ${renderPdfHeader('DETAIL PRODUKTU', clientName, today, authorName)}
      <div class="pdf-page-content"><div class="pdf-section">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6mm;">
          <div style="display: flex; align-items: flex-start; gap: 0;">
            ${productLogoHtml}
            <div>
              <h2 class="h2" style="font-size: 18pt; font-weight: 700; color: #1f1c2e; margin: 0 0 2mm 0;">${escapeHtml(name)}</h2>
              <span class="${badgeClass}" style="display: inline-block; padding: 1.5mm 4mm; border-radius: 2mm; font-size: 8pt; font-weight: 600;">${typeName}</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 9pt; color: #4a4a4a;">Vaše investice</div>
            <div style="font-size: 14pt; font-weight: 700; color: #0073ea;">${inv.type === 'lump' ? formatCzk(amount) : formatCurrencyMonthly(amount)}</div>
          </div>
        </div>
        <p style="font-size: 10pt; color: #1f1c2e; line-height: 1.6; margin-bottom: 5mm;">${escapeHtml(detail.why)}</p>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-bottom: 6mm;">
          <div style="background: #f8fafc; padding: 3mm; border-radius: 2mm; text-align: center;">
            <div style="font-size: 8pt; color: #4a4a4a; margin-bottom: 1mm;">Riziko</div>
            <div style="font-size: 11pt; font-weight: 700; color: #1f1c2e;">${escapeHtml(detail.risks)}</div>
          </div>
          <div style="background: #f8fafc; padding: 3mm; border-radius: 2mm; text-align: center;">
            <div style="font-size: 8pt; color: #4a4a4a; margin-bottom: 1mm;">Likvidita</div>
            <div style="font-size: 11pt; font-weight: 700; color: #1f1c2e;">${escapeHtml(detail.liquidity)}</div>
          </div>
          <div style="background: #f8fafc; padding: 3mm; border-radius: 2mm; text-align: center;">
            <div style="font-size: 8pt; color: #4a4a4a; margin-bottom: 1mm;">Výnos</div>
            <div style="font-size: 11pt; font-weight: 700; color: #1f1c2e;">${formatPercent(displayRate)} p.a.</div>
          </div>
        </div>
        <div class="h2">Investiční cíl</div>
        <p style="font-size: 10pt; color: #1f1c2e; line-height: 1.6; margin-bottom: 5mm;">${escapeHtml(detail.goal)}</p>
        <div class="h2">Vhodné pro</div>
        <p style="font-size: 10pt; color: #1f1c2e; line-height: 1.6; margin-bottom: 5mm;">${escapeHtml(detail.suitable)}</p>
        ${detail.strategy ? `<div class="h2">Investiční strategie</div><p style="font-size: 10pt; color: #1f1c2e; line-height: 1.6; margin-bottom: 5mm;">${escapeHtml(detail.strategy)}</p>` : ''}
        ${(detail.benefits?.length ?? 0) > 0 ? `<div class="h2">Klíčové výhody</div><ul style="font-size: 10pt; color: #1f1c2e; line-height: 1.6; margin: 0 0 5mm 0; padding-left: 5mm;">${detail.benefits!.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
        ${detail.parameters && Object.keys(detail.parameters).length > 0 ? `<div class="h2">Základní parametry</div><table class="table" style="margin-bottom: 5mm;"><tbody>${Object.entries(detail.parameters).map(([k, v]) => `<tr><td style="width: 40%; color: #4a4a4a;">${escapeHtml(k)}</td><td style="font-weight: 600;">${escapeHtml(v)}</td></tr>`).join('')}</tbody></table>` : ''}
        <table class="table" style="margin-bottom: 5mm;">
          <tbody>
            <tr><td style="width: 40%; color: #4a4a4a;">Aktiva</td><td style="font-weight: 600;">${escapeHtml(detail.assets)}</td></tr>
            <tr><td style="color: #4a4a4a;">Výnos</td><td style="font-weight: 600;">${escapeHtml(detail.yield)}</td></tr>
          </tbody>
        </table>
        ${renderHoldingsBlock(detail)}
        <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 4mm; border-radius: 3mm; border: 1px solid #bae6fd;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 8pt; color: #4a4a4a;">Očekávaná hodnota na konci horizontu</div>
              <div style="font-size: 14pt; font-weight: 700; color: #0073ea;">${formatCzk(Math.round(fv))}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 8pt; color: #4a4a4a;">Typ investice</div>
              <div style="font-size: 11pt; font-weight: 600; color: #1f1c2e;">${typeName}</div>
            </div>
          </div>
        </div>
      </div></div>
      ${renderPdfFooter(footerLine)}
    </section>`;
  });
  return html;
}

function renderGoalCoverage(data: FinancialAnalysisData): string {
  const totalTarget = (data.goals || []).reduce((acc, g) => acc + (g.computed?.fvTarget ?? 0), 0);
  const totalFV = (data.investments || []).reduce((acc, i) => acc + (i.computed?.fv ?? 0), 0);
  const coverage = totalTarget > 0 ? (totalFV / totalTarget) * 100 : 0;
  const diff = totalFV - totalTarget;
  const status = diff >= 0 ? 'Pokryto' : 'Chybí';
  const color = diff >= 0 ? 'green' : 'red';
  return `<div style="display:flex; justify-content:space-between;"><span>Celkem cíle: <strong>${formatCzk(Math.round(totalTarget))}</strong></span><span>Potenciál portfolia: <strong>${formatCzk(Math.round(totalFV))}</strong></span></div><div style="margin-top:5px; font-weight:bold; color:${color};">${status}: ${formatCzk(Math.abs(Math.round(diff)))} (${formatPercent(coverage / 100, 0)})</div>`;
}

function renderRentaFormula(goals: FinancialAnalysisData['goals']): string {
  const rentaGoals = (goals || []).filter((g) => g.type === 'renta' && ((Number(g.amount) || 0) > 0 || (g.computed?.fvTarget || 0) > 0));
  if (rentaGoals.length === 0) return '';
  const i = 0.03;
  let html =
    '<div style="background: #f1f5f9; border: 1px solid #e9ebf0; border-radius: 6px; padding: 10px 14px; margin-top: 12px; font-size: 10pt; color: #1f1c2e;"><div style="font-weight: 700; margin-bottom: 6px; color: #1f1c2e;">Výpočet cíle „Finanční nezávislost (Renta)“</div><p style="margin: 0 0 6px 0;">Budoucí hodnota měsíční renty s ohledem na inflaci (3 % p.a.):</p><p style="margin: 0 0 4px 0; font-family: monospace; font-size: 11pt;"><strong>FV = P × (1 + i)<sup>n</sup></strong></p><p style="margin: 0 0 8px 0; font-size: 9pt;">kde <strong>P</strong> = dnešní požadovaná měsíční renta (Kč), <strong>i</strong> = 0,03 (3 % inflace), <strong>n</strong> = počet let do cíle.</p><p style="margin: 0 0 6px 0;">Potřebný kapitál k zajištění budoucí renty (předpoklad 6% výnosu):</p><p style="margin: 0 0 8px 0; font-family: monospace; font-size: 10pt;"><strong>Potřebný kapitál = (budoucí renta × 12) / 0,06</strong></p>';
  rentaGoals.forEach((g, idx) => {
    const P = Number(g.amount) || 0;
    const n = Math.max(1, Number(g.years) || Number(g.horizon) || 1);
    if (P <= 0) return;
    const FV = P * Math.pow(1 + i, n);
    const capital = (FV * 12) / 0.06;
    html += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e9ebf0;"><strong>Příklad ${rentaGoals.length > 1 ? idx + 1 + ': ' : ''}</strong>P = ${formatCurrencyMonthly(Math.round(P))}, n = ${n} let → FV = ${formatCurrencyMonthly(Math.round(FV))} → potřebný kapitál <strong>${formatCzk(Math.round(capital))}</strong>.</div>`;
  });
  html += '</div>';
  return html;
}

function pdfClientExtra(client: FinancialAnalysisData['client']): string {
  if (!client) return '';
  const occ = client.occupation ? 'Povolání: ' + client.occupation : '';
  const sport = client.sports ? 'Sporty: ' + client.sports : '';
  if (!occ && !sport) return '';
  return '<p style="margin-bottom: 4px; color: #4a4a4a; font-size: 11px;">' + (occ ? occ + (sport ? '<br/>' : '') : '') + (sport ? sport : '') + '</p>';
}

function buildPages34(
  data: FinancialAnalysisData,
  clientName: string,
  today: string,
  authorName: string,
  footerLine: string
): string {
  const profileLabel = getStrategyProfileLabel(data.strategy?.profile ?? 'balanced');
  const strategyDesc = getStrategyDesc(data.strategy?.profile ?? 'balanced');
  const growthData = getGrowthChartData(data);
  const projStart = growthData.values[0] ?? 0;
  const projEnd = growthData.values[growthData.values.length - 1] ?? 0;
  const projYears = growthData.labels.length - 1;
  const projectionSummary = `Projekce portfolia: od ${formatCzk(Math.round(projStart))} (rok 0) do ${formatCzk(Math.round(projEnd))} (rok ${projYears}) při zvolených vkladech a výnosech.`;

  return `
    <section class="pdf-page">
        ${renderPdfHeader('CÍLE A STRATEGIE', clientName, today, authorName)}
        <div class="pdf-page-content"><div class="pdf-section">
            <div class="h2">Finanční cíle & Pokrytí</div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size:12px;">${renderGoalCoverage(data)}</div>
            <table class="table" style="margin-bottom: 30px;">
                <thead><tr><th>Cíl</th><th style="text-align: center;">Horizont</th><th style="text-align: right;">Cílová částka</th><th style="text-align: right;">Potřeba měsíčně</th></tr></thead>
                <tbody>${renderGoalsRows(data.goals)}</tbody>
            </table>
            ${renderRentaFormula(data.goals)}
        </div>
        ${renderCreditWishesPDF(data.newCreditWishList)}
        <div class="pdf-section">
            <div class="h2">Doporučené portfolio</div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0 0 5px 0; font-size: 14px;"><strong>Strategie:</strong> ${profileLabel}</p>
                <p style="margin: 0; font-size: 12px; color: #4a4a4a;">${strategyDesc}</p>
            </div>
            <table class="table table-5col">
                <thead><tr><th>Produkt</th><th style="text-align: center;">Typ</th><th style="text-align: right;">Vklad</th><th style="text-align: center;">Výnos</th><th style="text-align: right; color:#0073ea;">Předpoklad FV</th></tr></thead>
                <tbody>${renderInvestmentsRows(data)}</tbody>
                <tfoot>${renderInvestmentsTotal(data)}</tfoot>
            </table>
        </div></div>
        ${renderPdfFooter(footerLine)}
    </section>
    ${renderProductDetailPages(data, clientName, today, authorName, footerLine)}
    <section class="pdf-page">
        ${renderPdfHeader('PROJEKCE', clientName, today, authorName)}
        <div class="pdf-page-content"><div class="h2">Vývoj hodnoty majetku</div>
        <p style="margin: 0 0 4mm 0; font-size: 10pt; color: #4a4a4a;">Vývoj hodnoty majetku zobrazuje projekci portfolia v čase podle zvolené strategie a investic.</p>
        <div style="height: 90mm; width: 100%;"><canvas id="pdf-chart-growth"></canvas></div>
        <p style="margin: 4mm 0 0 0; font-size: 9pt; color: #1f1c2e; font-weight: 600;">${projectionSummary}</p>
        <div class="h2" style="margin-top:15px;">Rozložení aktiv</div>
        <p style="margin: 0 0 4mm 0; font-size: 10pt; color: #4a4a4a;">Rozložení aktiv vychází z vaší investiční strategie.</p>
        <div style="height: 70mm; width: 100%;"><canvas id="pdf-chart-allocation"></canvas></div>
        <div style="margin-top: 30px; font-size: 10px; color: #94a3b8; line-height: 1.4; border-top: 1px solid #e9ebf0; padding-top: 10px;"><strong>Upozornění:</strong> Minulé výnosy nejsou zárukou budoucích. Výpočty jsou modelové.</div></div>
        ${renderPdfFooter(footerLine)}
    </section>
  `;
}

function renderInsuranceGrids(ins: InsuranceResult): string {
  const box = (title: string, lines: string[]) =>
    `<div style="margin-top: 5mm;"><div style="font-weight: 700; font-size: 10pt; color: #1f1c2e; margin-bottom: 2mm;">${title}</div><div style="background: #f3f6fd; border: 1px solid #e9ebf0; border-radius: 2mm; padding: 3mm; font-size: 9pt; color: #1f1c2e;">${lines.map((l) => `<div style="margin-bottom: 1mm;">${l}</div>`).join('')}</div></div>`;
  const grids: string[] = [];
  grids.push(box('Invalidita', [
    `Potřeba při invaliditě: <strong>${formatCurrencyMonthly(ins.invalidity.needMonthly)}</strong>`,
    `− z pojištění: ${formatCzk(ins.invalidity.rentaFromInsurance)}`,
    `− státní důchod: ${formatCzk(ins.invalidity.statePension)}`,
    `− vlastní majetek: ${formatCzk(ins.invalidity.ownAssetRenta)}`,
  ]));
  if (!ins.sickness.isOSVC) {
    const pnMonthly = ins.sickness.dailyBenefit * 30;
    grids.push(box('Pracovní neschopnost', [
      `Od ČSSZ: cca ${formatCurrencyMonthly(ins.sickness.sicknessMonthly)}`,
      `PN ${formatCurrencyDaily(ins.sickness.dailyBenefit)} = ${formatCurrencyMonthly(pnMonthly)}`,
      `Celkem: ${formatCurrencyMonthly(ins.sickness.totalMonthly)}`,
    ]));
  } else {
    grids.push(box('Pracovní neschopnost', [
      `Doporučené denní odškodné: ${formatCurrencyDaily(ins.sickness.dailyBenefit)} (OSVČ – bez nároku na nemocenskou).`,
    ]));
  }
  grids.push(box('Trvalé následky', [
    `Základ: ${formatCzk(ins.tn.base)}`,
    `S progresí ${ins.tn.progress}×: až ${formatCzk(ins.tn.max)}`,
  ]));
  if (!ins.death.individual) {
    grids.push(box('Smrt', [
      `Závazky: ${formatCzk(ins.death.liabilities)}`,
      `Rodina: ${formatCzk(ins.death.familyProtection)}`,
      `Doporučeno: ${formatCzk(ins.death.coverage)}`,
    ]));
  } else {
    grids.push(box('Smrt', ['Dle individuální situace (bez závazků a rodiny není doporučena konkrétní částka).']));
  }
  return grids.join('');
}

function renderInsurancePage(
  data: FinancialAnalysisData,
  clientName: string,
  today: string,
  authorName: string,
  footerLine: string
): string {
  const ins = computeInsurance(data);
  if (ins.netIncome === 0) {
    return `<section class="pdf-page">${renderPdfHeader('ZAJIŠTĚNÍ PŘÍJMŮ', clientName, today, authorName)}<div class="pdf-page-content"><div class="pdf-section"><div class="h2">Životní pojištění</div><div class="interpretation"><p><strong>Upozornění:</strong> Pro výpočet doporučeného pojištění je nutné zadat měsíční příjem v sekci Cashflow.</p></div></div></div>${renderPdfFooter(footerLine)}</section>`;
  }
  const gridsHtml = renderInsuranceGrids(ins);
  const partnerBlock = ins.partnerInsurance
    ? (() => {
        const p = ins.partnerInsurance;
        return `<div class="pdf-section"><div class="h2">Životní pojištění – ${escapeHtml(p.name)}</div><p style="font-size: 10pt; color: #4a4a4a;">Příjem: <strong>${formatCzk(p.income)}</strong></p><table class="table"><tbody><tr><td>Invalidita</td><td style="text-align: right;">${formatCzk(p.invalidity.capital)}</td></tr><tr><td>PN</td><td style="text-align: right;">${formatCurrencyDaily(p.sickness.dailyBenefit)}</td></tr><tr><td>Smrt</td><td style="text-align: right;">${formatCzk(p.death.coverage)}</td></tr></tbody></table></div>`;
      })()
    : '';
  const childrenBlock =
    ins.childInsurance.length > 0
      ? `<div class="pdf-section"><div class="h2">Doporučení pro děti</div><p style="font-size: 10pt;">Invalidita 3–5 mil. Kč, Trvalé následky max 2 mil. Kč.</p></div>`
      : '';
  const mainContent = `<div class="pdf-section"><div class="h2">Životní pojištění – ${escapeHtml(clientName)}</div><p style="font-size: 10pt; color: #4a4a4a; margin-bottom: 3mm;">Doporučené částky vycházejí z příjmu, výdajů a závazků.</p><p style="font-size: 10pt; color: #4a4a4a; margin-bottom: 4mm;">Příjem: <strong>${formatCzk(ins.netIncome)}</strong> čistého měsíčně ${ins.isOSVC ? '<span style="background: #fef3c7; color: #92400e; padding: 1mm 2mm; border-radius: 2mm; font-size: 8pt;">OSVČ</span>' : ''}</p><table class="table" style="margin-bottom: 6mm;"><thead><tr><th style="width: 50%;">Rizika</th><th style="width: 50%; text-align: right;">Pojistná částka</th></tr></thead><tbody><tr><td>Invalidita 2.–3. stupeň</td><td style="text-align: right; font-weight: bold;">${formatCzk(ins.invalidity.capital)}</td></tr><tr><td>Trvalé následky</td><td style="text-align: right; font-weight: bold;">${formatCzk(ins.tn.base)} (progrese ${ins.tn.progress}×)</td></tr><tr><td>Pracovní neschopnost</td><td style="text-align: right; font-weight: bold;">${formatCurrencyDaily(ins.sickness.dailyBenefit)}</td></tr><tr><td>Smrt</td><td style="text-align: right; font-weight: bold;">${ins.death.individual ? 'INDIVIDUÁLNĚ' : formatCzk(ins.death.coverage)}</td></tr></tbody></table>${gridsHtml}</div>`;
  const pages = `<section class="pdf-page">${renderPdfHeader('ZAJIŠTĚNÍ PŘÍJMŮ', clientName, today, authorName)}<div class="pdf-page-content">${mainContent}${partnerBlock}${childrenBlock}</div>${renderPdfFooter(footerLine)}</section>`;
  return pages;
}

/** Měsíční částka za plán: základ (monthlyPremium nebo annual/12) + součet finalPrice zapnutých rizik. Stejný vzorec jako v StepIncomeProtection. */
function planTotalMonthly(plan: IncomeProtectionPlan): number {
  const base = plan.monthlyPremium ?? (plan.annualContribution ?? 0) / 12;
  const riskTotal = (plan.insuredRisks ?? []).reduce(
    (s, r) => s + (r.enabled && r.finalPrice != null ? r.finalPrice : 0),
    0
  );
  return base + riskTotal;
}

/** Navržené řešení zajištění příjmů (grid) + optional optimalizace pro jednatele/majitele. */
function renderIncomeProtectionProposed(
  data: FinancialAnalysisData,
  reportOptions?: BuildReportHTMLOptions,
  authorName?: string,
  footerLine?: string
): string {
  const persons = data.incomeProtection?.persons ?? [];
  if (persons.length === 0) return '';

  const hasPlans = persons.some((p) => (p.insurancePlans?.length ?? 0) > 0);
  if (!hasPlans) return '';

  const clientName = data.client?.name || 'Klient';
  const today = new Date().toLocaleDateString('cs-CZ');
  const author = authorName ?? PDF_REPORT_AUTHOR_FALLBACK;
  const footer = footerLine ?? PDF_REPORT_FOOTER_FALLBACK;
  const roleLabel = (r: string | undefined) => {
    const labels: Record<string, string> = { client: 'Klient', partner: 'Partner', child: 'Dítě', director: 'Jednatel/ka', owner: 'Majitel', partner_company: 'Společník' };
    return r ? (labels[r] ?? r) : '–';
  };
  let html = `<section class="pdf-page">${renderPdfHeader('ZAJIŠTĚNÍ PŘÍJMŮ', clientName, today, author)}<div class="pdf-page-content"><div class="pdf-section"><div class="h2">Zajištění příjmů – navržené řešení</div>`;
  html += '<p style="font-size: 10pt; color: #4a4a4a; margin-bottom: 4mm;">V tabulce níže jsou uvedeny zadané pojistné plány. Celková měsíční cena je součtem všech řádků. Doporučené pojistné částky najdete na předchozích stránkách v sekci Životní pojištění.</p>';
  html += '<table class="table"><thead><tr><th>Osoba</th><th>Role</th><th>Pojišťovna</th><th>Rizika</th><th>Měsíční / roční</th><th>Zdroj úhrady</th><th>Poznámka</th></tr></thead><tbody>';
  let totalMonthly = 0;
  const fundingLabels: Record<string, string> = { company: 'Firma', personal: 'Osobně', osvc: 'OSVČ' };
  persons.forEach((person) => {
    (person.insurancePlans ?? []).forEach((plan) => {
      const monthly = planTotalMonthly(plan);
      totalMonthly += monthly;
      const risks = (plan.insuredRisks ?? []).filter((r) => r.enabled).map((r) => getRiskLabel(r.riskType)).join(', ') || '–';
      const price = formatCurrencyMonthly(monthly);
      const funding = plan.fundingSource ? fundingLabels[plan.fundingSource] ?? plan.fundingSource : '–';
      const insurerLogoPath = plan.provider ? INSURANCE_LOGOS[plan.provider] : undefined;
      const insurerLogoHtml = renderLogoOrFallback(insurerLogoPath, plan.provider ?? 'Pojišťovna', 'width: 20px; height: 20px; object-fit: contain; vertical-align: middle; margin-right: 1.5mm;');
      html += `<tr><td>${escapeHtml(person.displayName ?? '')}</td><td>${escapeHtml(roleLabel(person.roleType))}</td><td>${insurerLogoHtml}</td><td>${escapeHtml(risks)}</td><td style="text-align:right">${price}</td><td>${escapeHtml(funding)}</td><td>${escapeHtml(plan.notes ?? '')}</td></tr>`;
    });
  });
  html += '</tbody></table>';
  html += `<p style="font-weight:bold; margin-top: 4mm;">Celková měsíční cena: ${formatCzk(totalMonthly)}</p>`;
  html += `</div></div>${renderPdfFooter(footer)}</section>`;

  const companyMonthlyForPerson = (p: typeof persons[0]) =>
    (p.insurancePlans ?? []).filter((pl) => pl.fundingSource === 'company').reduce((s, pl) => s + planTotalMonthly(pl), 0);
  const anyOptimization = persons.some((p) => p.funding?.benefitOptimizationEnabled && ((p.funding?.companyContributionMonthly ?? 0) > 0 || companyMonthlyForPerson(p) > 0));
  if (anyOptimization) {
    html += `<section class="pdf-page">${renderPdfHeader('ZAJIŠTĚNÍ PŘÍJMŮ', clientName, today, author)}<div class="pdf-page-content"><div class="pdf-section"><div class="h2">Optimalizace zajištění příjmů</div>`;
    persons.forEach((person) => {
      const companyFromPlansVal = companyMonthlyForPerson(person);
      if (!person.funding?.benefitOptimizationEnabled || ((person.funding.companyContributionMonthly ?? 0) <= 0 && companyFromPlansVal <= 0)) return;
      const f = person.funding;
      const comp = f.benefitVsSalaryComparison;
      const plans = person.insurancePlans ?? [];
      const companyFromPlans = companyFromPlansVal;
      const totalPerson = plans.reduce((s, pl) => s + planTotalMonthly(pl), 0);
      const personalOsvc = Math.max(0, totalPerson - companyFromPlans);
      const roleLabelMap: Record<string, string> = { client: 'Klient', partner: 'Partner', director: 'Jednatel/ka', owner: 'Majitel', partner_company: 'Společník' };
      const roleLabel = person.roleType ? roleLabelMap[person.roleType] ?? person.roleType : person.role;
      html += `<div style="margin-bottom: 6mm;"><strong>${escapeHtml(person.displayName ?? '')}</strong> <span style="color:#4a4a4a; font-size: 9pt;">(${escapeHtml(roleLabel ?? '')})</span>`;
      html += '<table class="table" style="margin-top: 2mm;"><tbody>';
      const provLabel = reportOptions?.provenance?.["incomeProtection.persons"]
        ? (reportOptions.linkedCompanyName ? ` (sdílený údaj z firmy ${reportOptions.linkedCompanyName})` : " (sdílený údaj)")
        : "";
      html += `<tr><td>Firma platí${provLabel}</td><td style="text-align:right">${formatCurrencyMonthly(f.companyContributionMonthly ?? companyFromPlans)}</td></tr>`;
      if (personalOsvc > 0) {
        html += `<tr><td>Osobně / OSVČ doplácí</td><td style="text-align:right">${formatCurrencyMonthly(personalOsvc)}</td></tr>`;
      }
      html += `<tr><td>Celkové měsíční pojistné</td><td style="text-align:right">${formatCurrencyMonthly(totalPerson)}</td></tr>`;
      if (comp?.salaryVariantCompanyCost != null) {
        html += `<tr><td>Varianta A – navýšení mzdy (náklad firmy)</td><td style="text-align:right">${formatCurrencyMonthly(comp.salaryVariantCompanyCost)}</td></tr>`;
      }
      if (comp?.benefitVariantCompanyCost != null) {
        html += `<tr><td>Varianta B – firemní příspěvek (náklad firmy)</td><td style="text-align:right">${formatCurrencyMonthly(comp.benefitVariantCompanyCost)}</td></tr>`;
      }
      if (comp?.estimatedSavings != null && comp.estimatedSavings > 0) {
        html += `<tr><td><strong>Úspora firmy ročně</strong></td><td style="text-align:right; font-weight:bold;">${formatCurrencyYearly(comp.estimatedSavings)}</td></tr>`;
      }
      if (comp?.ownerTaxSavingsAnnual != null && comp.ownerTaxSavingsAnnual > 0) {
        html += `<tr><td>Daňová úspora majitelů (ročně)</td><td style="text-align:right">${formatCurrencyYearly(comp.ownerTaxSavingsAnnual)}</td></tr>`;
      }
      html += '</tbody></table>';
      if (comp?.explanation) {
        html += `<p style="font-size: 9pt; color: #4a4a4a; margin-top: 2mm;">${escapeHtml(comp.explanation)}</p>`;
      }
      html += '</div>';
    });
    html += `</div></div>${renderPdfFooter(footer)}</section>`;
  }
  return html;
}

/** Phase 7: options for report labels (linked/overridden from company). Branding from advisor profile. */
export interface PdfReportBranding {
  authorName: string;
  footerLine: string;
  logoUrl?: string | null;
}

export interface BuildReportHTMLOptions {
  provenance?: Record<string, "linked" | "overridden">;
  linkedCompanyName?: string | null;
  branding?: PdfReportBranding;
  theme?: 'elegant' | 'modern';
}

function provenanceSuffix(path: string, opts?: BuildReportHTMLOptions): string {
  if (!opts?.provenance?.[path]) return "";
  const label = opts.linkedCompanyName
    ? ` (příjem/závazek z firmy ${opts.linkedCompanyName} – sdílený údaj)`
    : " (sdílený údaj)";
  return `<span style="font-size:9pt;color:#4a4a4a;">${label}</span>`;
}

const COMPANY_RISK_LABELS: { key: keyof CompanyRisks; label: string }[] = [
  { key: 'property', label: 'Majetek' },
  { key: 'interruption', label: 'Přerušení provozu' },
  { key: 'liability', label: 'Odpovědnost' },
  { key: 'director', label: 'D&O (ředitelé)' },
  { key: 'fleet', label: 'Flotila' },
  { key: 'cyber', label: 'Kyber' },
];

/** Firemní část PDF – titulka, PŘEHLED SITUACE (KPI), FIREMNÍ POJIŠTĚNÍ (rizika X/6), Benefity, ZAJIŠTĚNÍ PŘÍJMŮ. */
function renderCompanyPDFSection(
  data: FinancialAnalysisData,
  clientName: string,
  today: string,
  authorName: string,
  footerLine: string
): string {
  if (!data.includeCompany) return '';
  const cf = data.companyFinance ?? {};
  const runway = companyRunway(data.companyFinance);
  const risks = data.companyRisks ?? {};
  const riskDetails = data.companyRiskDetails ?? {};
  const riskCount = COMPANY_RISK_LABELS.filter((r) => risks[r.key]).length;
  const benefits = data.companyBenefits ?? {};
  const benefitLabels: string[] = [];
  if (benefits.dps) benefitLabels.push('DPS');
  if (benefits.dip) benefitLabels.push('DIP');
  if (benefits.izp) benefitLabels.push('IŽP');
  const benefitSummary = benefitLabels.length ? benefitLabels.join(', ') + (benefits.annualCost ? ` – roční náklad cca ${formatCzk(benefits.annualCost ?? 0)}` : '') : 'Nejsou zadány.';

  let html = `
  <section class="pdf-page pdf-title-page">
    ${renderPdfHeader('FINANČNÍ ANALÝZA – FIRMA', clientName, today, authorName)}
    <div class="pdf-page-content"><div style="text-align: center;">
      <div style="width: 80px; height: 80px; background: #92400e; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: bold; margin: 0 auto 20px;">S</div>
      <h1 class="h1" style="font-size: 36px; margin-bottom: 10px;">FINANČNÍ ANALÝZA – FIRMA</h1>
      <p style="font-size: 16px; color: #4a4a4a; margin-bottom: 40px;">Společnost a jednatel</p>
      <div style="display: inline-block; text-align: left; background: #fffbeb; padding: 24px; border-radius: 12px; border: 1px solid #fcd34d; min-width: 280px;">
        <p style="margin-bottom: 8px; color: #4a4a4a; font-size: 11px; text-transform: uppercase; font-weight: bold;">Jednatel</p>
        <h2 style="font-size: 20px; color: #1f1c2e; margin: 0 0 16px 0;">${escapeHtml(clientName)}</h2>
        <p style="margin-bottom: 8px; margin-top: 12px; color: #4a4a4a; font-size: 11px; text-transform: uppercase; font-weight: bold;">Datum vyhotovení</p>
        <h3 style="font-size: 14px; color: #1f1c2e; margin: 0;">${today}</h3>
      </div>
    </div></div>
    ${renderPdfFooter(footerLine)}
  </section>
  <section class="pdf-page">
    ${renderPdfHeader('PŘEHLED FIRMY', clientName, today, authorName)}
    <div class="pdf-page-content"><div class="pdf-section">
      <div class="h2">PŘEHLED SITUACE (firma)</div>
      <div class="kpi">
        <div class="box"><span class="lbl">Roční tržby</span><div class="val" style="color: #0073ea;">${formatCzk(cf.revenue ?? 0)}</div></div>
        <div class="box"><span class="lbl">Roční zisk</span><div class="val" style="color: #1f1c2e;">${formatCzk(cf.profit ?? 0)}</div></div>
        <div class="box"><span class="lbl">Cash runway</span><div class="val" style="color: #ffcc00;">${runway != null ? `${runway.toFixed(1)} měs.` : '—'}</div></div>
        <div class="box"><span class="lbl">Dluhová služba</span><div class="val" style="color: #1f1c2e;">${formatCzk(cf.loanPayment ?? 0)}</div></div>
      </div>
      <div class="interpretation">
        <p><strong>Doporučení:</strong> ${riskCount >= 4 ? 'Firma má dobré pokrytí rizik.' : riskCount >= 2 ? 'Doporučujeme doplnit další kategorie pojištění firmy.' : 'Zvažte rozšíření firemního pojištění (majetek, odpovědnost, přerušení provozu).'}</p>
      </div>
    </div>
    <div class="pdf-section" style="margin-top: 8mm;">
      <div class="h2">FIREMNÍ POJIŠTĚNÍ</div>
      <p style="font-size: 10pt; color: #4a4a4a; margin-bottom: 4mm;">Pokrytí rizik: <strong>${riskCount}/6</strong></p>
      <table class="table" style="font-size: 9pt;">
        <thead><tr><th>Kategorie</th><th style="text-align: center;">Pokryto</th></tr></thead>
        <tbody>
          ${COMPANY_RISK_LABELS.map((r) => `<tr><td>${r.label}</td><td style="text-align: center;">${risks[r.key] ? 'Ano' : 'Ne'}</td></tr>`).join('')}
        </tbody>
      </table>
      ${(riskDetails.property?.limit != null || riskDetails.property?.contractYears != null || riskDetails.interruption?.limit != null || riskDetails.interruption?.contractYears != null || riskDetails.liability?.limit != null || riskDetails.liability?.contractYears != null) ? `
      <p style="font-size: 8pt; color: #4a4a4a; margin-top: 3mm;">Detail: ${[
        riskDetails.property && (riskDetails.property.limit != null || riskDetails.property.contractYears != null) ? `Majetek – limit ${formatCzk(riskDetails.property.limit ?? 0)}, stáří ${riskDetails.property.contractYears ?? '—'} let` : null,
        riskDetails.interruption && (riskDetails.interruption.limit != null || riskDetails.interruption.contractYears != null) ? `Přerušení – limit ${formatCzk(riskDetails.interruption.limit ?? 0)}` : null,
        riskDetails.liability && (riskDetails.liability.limit != null || riskDetails.liability.contractYears != null) ? `Odpovědnost – limit ${formatCzk(riskDetails.liability.limit ?? 0)}` : null,
      ].filter(Boolean).join('; ') || '—'}</p>
      ` : ''}
    </div>
    <div class="pdf-section" style="margin-top: 8mm;">
      <div class="h2">Benefity</div>
      <p style="font-size: 10pt; color: #1f1c2e;">${escapeHtml(benefitSummary)}</p>
      ${(benefits.employeeCount ?? 0) > 0 ? `<p style="font-size: 9pt; color: #4a4a4a; margin-top: 2mm;">Zaměstnanců: ${benefits.employeeCount}, příspěvek na osobu: ${formatCurrencyMonthly(benefits.amountPerPerson ?? 0)}</p>` : ''}
      ${benefits.statePensionTaxBenefit ? `<p style="font-size: 9pt; color: #4a4a4a; margin-top: 2mm;">Danové zvýhodnění od státu: limit ${formatCzk(benefits.statePensionTaxLimitAnnual ?? STATE_PENSION_TAX_LIMIT_ANNUAL)}/rok do DIP a DPS, daň zpět ${formatCzk(benefits.statePensionTaxRefundAnnual ?? STATE_PENSION_TAX_REFUND_ANNUAL)} ročně.</p>` : ''}
    </div>
    <div class="pdf-section" style="margin-top: 8mm;">
      <div class="h2">Zajištění příjmů (jednatel)</div>
      <p style="font-size: 10pt; color: #1f1c2e;">Pro doporučení pojištění jednatele viz sekci „Zajištění příjmů“ v osobní části analýzy.</p>
    </div></div>
    ${renderPdfFooter(footerLine)}
  </section>
  `;
  return html;
}

/**
 * Build full report HTML string. Delegates to the premium report engine.
 */
export function buildReportHTML(data: FinancialAnalysisData, options?: BuildReportHTMLOptions): string {
  return buildPremiumReportHTML(data, {
    theme: (options as BuildReportHTMLOptions & { theme?: 'elegant' | 'modern' })?.theme ?? 'elegant',
    branding: options?.branding ? {
      advisorName: options.branding.authorName,
      advisorRole: options.branding.footerLine,
      logoUrl: options.branding.logoUrl ?? undefined,
    } : undefined,
    includeCompany: data.includeCompany,
  });
}

/** @deprecated Legacy builder kept for reference. Use buildReportHTML which delegates to premium engine. */
function _legacyBuildReportHTML(data: FinancialAnalysisData, options?: BuildReportHTMLOptions): string {
  const today = new Date().toLocaleDateString('cs-CZ');
  const clientName = data.client?.name || 'Klient';
  const authorName = options?.branding?.authorName ?? PDF_REPORT_AUTHOR_FALLBACK;
  const footerLine = options?.branding?.footerLine ?? PDF_REPORT_FOOTER_FALLBACK;
  const logoUrl = options?.branding?.logoUrl ?? null;
  const assets = data.assets || {};
  const liabilities = data.liabilities || {};
  const totalAssets = totalAssetsFromValues(assets);
  const totalLiabilities = totalLiabilitiesFromValues(liabilities);
  const netWorthVal = totalAssets - totalLiabilities;
  const inc = data.cashflow?.incomes ?? {};
  const exp = data.cashflow?.expenses ?? {};
  const totalInc = totalIncome(inc);
  const totalExp = totalExpense(exp);
  const otherIncSum = (inc.otherDetails || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const otherExpSum = (exp.otherDetails || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const insuranceSum = (exp.insuranceItems?.length ?? 0) > 0
    ? (exp.insuranceItems as Array<{ amount?: number }>).reduce((a, b) => a + (Number(b.amount) || 0), 0)
    : Number(exp.insurance) || 0;
  const surplusVal = totalInc - totalExp;
  const reserveCash = data.cashflow?.reserveCash ?? 0;
  const monthlyExp = totalExp;
  const reserveMonths = monthlyExp > 0 ? (reserveCash / monthlyExp).toFixed(1) : 'N/A';
  const provMain = provenanceSuffix("cashflow.incomes.main", options);
  const provOtherLiab = provenanceSuffix("liabilities.other", options);
  const provIncomeProt = provenanceSuffix("incomeProtection.persons", options);

  let netWorthText = 'Vaše čisté jmění je kladné, což značí zdravý finanční základ.';
  if (netWorthVal < 0) netWorthText = 'Záporné čisté jmění je často způsobeno hypotékou na začátku splácení. Důležité je, že hodnota nemovitosti v čase roste a dluh klesá.';
  let reserveText = `Rezerva pokrývá cca ${reserveMonths} měsíců výdajů.`;
  if (reserveCash < 3 * monthlyExp) reserveText += ' Doporučujeme navýšit rezervu alespoň na 3-6 měsíců výdajů.';
  else reserveText += ' Výše rezervy je dostatečná.';

  let maxAsset = 0;
  let maxAssetName = '';
  if ((assets.realEstate || 0) > maxAsset) {
    maxAsset = assets.realEstate!;
    maxAssetName = 'Nemovitosti';
  }
  if ((assets.investments || 0) > maxAsset) {
    maxAsset = assets.investments!;
    maxAssetName = 'Investice';
  }
  if ((assets.cash || 0) > maxAsset) {
    maxAsset = assets.cash!;
    maxAssetName = 'Hotovost';
  }
  let balanceComment = `Největší položkou v majetku jsou ${maxAssetName}. `;
  if ((liabilities.loans || 0) > 0) balanceComment += 'Pozor na spotřebitelské úvěry, doporučujeme prioritně doplatit.';
  else balanceComment += 'Zadlužení je pod kontrolou.';

  return `
<style>${PDF_STYLES}</style>
<div class="pdf">
  <section class="pdf-page pdf-title-page">
    ${renderPdfHeader('FINANČNÍ PLÁN', clientName, today, authorName)}
    <div class="pdf-page-content"><div style="text-align: center;">
      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" style="max-height: 80px; width: auto; object-fit: contain; margin: 0 auto 20px; display: block;" />` : '<div style="width: 80px; height: 80px; background: #0a0f29; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: bold; margin: 0 auto 20px;">M</div>'}
      <h1 class="h1" style="font-size: 40px; margin-bottom: 10px;">FINANČNÍ PLÁN</h1>
      <p style="font-size: 18px; color: #4a4a4a; margin-bottom: 50px;">Komplexní strategie pro vaši budoucnost</p>
      <div style="display: inline-block; text-align: left; background: #f8fafc; padding: 30px; border-radius: 12px; border: 1px solid #e9ebf0; min-width: 300px;">
        <p style="margin-bottom: 10px; color: #4a4a4a; font-size: 12px; text-transform: uppercase; font-weight: bold;">Klient</p>
        <h2 style="font-size: 24px; color: #1f1c2e; margin: 0 0 20px 0;">${escapeHtml(clientName)}</h2>
        ${pdfClientExtra(data.client)}
        <p style="margin-bottom: 10px; margin-top: 12px; color: #4a4a4a; font-size: 12px; text-transform: uppercase; font-weight: bold;">Datum vyhotovení</p>
        <h3 style="font-size: 16px; color: #1f1c2e; margin: 0;">${today}</h3>
      </div>
    </div></div>
    ${renderPdfFooter(footerLine)}
  </section>
  <section class="pdf-page">
    ${renderPdfHeader('SOUHRN & BILANCE', clientName, today, authorName)}
    <div class="pdf-page-content"><div class="pdf-section">
      <div class="h2">Přehled situace</div>
      <div class="kpi">
        <div class="box"><span class="lbl">Čisté jmění</span><div class="val" style="color: #0073ea;">${formatCzk(netWorthVal)}</div></div>
        <div class="box"><span class="lbl">Měsíční bilance</span><div class="val" style="color: #ffcc00;">${formatCzk(surplusVal)}</div></div>
        <div class="box"><span class="lbl">Rezerva</span><div class="val" style="color: #1f1c2e;">${formatCzk(reserveCash)}</div></div>
      </div>
      <div class="interpretation"><p><strong>Interpretace:</strong> ${netWorthText} ${reserveText}</p></div>
    </div>
    <div class="pdf-section">
      <div class="h2">Majetek vs. Závazky</div>
      <div style="font-size: 10pt; color: #52607a; margin-bottom: 2mm;"><em>Rychlá analýza: ${balanceComment}</em></div>
      <div style="display: flex; gap: 8mm;">
        <div style="flex: 1;">
          <table class="table"><thead><tr><th colspan="2">Aktiva</th></tr></thead><tbody>
            <tr><td>Hotovost & Rezerva</td><td style="text-align:right">${formatCzk(assets.cash || 0)}</td></tr>
            <tr><td>Nemovitosti</td><td style="text-align:right">${formatCzk(assets.realEstate || 0)}</td></tr>
            <tr><td>Investice</td><td style="text-align:right">${formatCzk(assets.investments || 0)}</td></tr>
            <tr><td>Penzijní</td><td style="text-align:right">${formatCzk(assets.pension || 0)}</td></tr>
            <tr><td>Ostatní</td><td style="text-align:right">${formatCzk(assets.other || 0)}</td></tr>
            <tr style="font-weight:bold; background:#f8fafc"><td>CELKEM</td><td style="text-align:right">${formatCzk(totalAssets)}</td></tr>
          </tbody></table>
        </div>
        <div style="flex: 1;">
          <table class="table"><thead><tr><th colspan="2">Pasiva</th></tr></thead><tbody>
            <tr><td>Hypotéka</td><td style="text-align:right">${formatCzk(liabilities.mortgage || 0)}</td></tr>
            <tr><td>Úvěry</td><td style="text-align:right">${formatCzk(liabilities.loans || 0)}</td></tr>
            <tr><td>Ostatní${provOtherLiab}</td><td style="text-align:right">${formatCzk(liabilities.other || 0)}</td></tr>
            <tr style="font-weight:bold; background:#f8fafc"><td>CELKEM</td><td style="text-align:right">${formatCzk(totalLiabilities)}</td></tr>
          </tbody></table>
        </div>
      </div>
      ${renderPasivaDetail(liabilities)}
    </div>
    <div class="pdf-section" style="margin-top: 10mm;">
      <div class="h2">Cashflow</div>
      <table class="table">
        <thead><tr><th>Příjmy</th><th style="text-align: right;">Částka</th><th>Výdaje</th><th style="text-align: right;">Částka</th></tr></thead>
        <tbody>
          <tr><td>Hlavní příjem${provMain}</td><td style="text-align:right">${formatCzk(inc.main || 0)}</td><td>Bydlení & Energie</td><td style="text-align:right">${formatCzk((exp.housing || 0) + (exp.energy || 0))}</td></tr>
          <tr><td>Partner</td><td style="text-align:right">${formatCzk(inc.partner || 0)}</td><td>Spotřeba & Jídlo</td><td style="text-align:right">${formatCzk((exp.food || 0) + (exp.transport || 0))}</td></tr>
          <tr><td>Ostatní příjmy${(options?.provenance?.["cashflow.incomes.otherDetails"] ? provenanceSuffix("cashflow.incomes.otherDetails", options) : "")}</td><td style="text-align:right">${formatCzk(otherIncSum)}</td><td>Ostatní výdaje</td><td style="text-align:right">${formatCzk(otherExpSum + (exp.children || 0) + insuranceSum)}</td></tr>
          <tr style="font-weight:bold; background:#f8fafc"><td>CELKEM</td><td style="text-align:right">${formatCzk(totalInc)}</td><td>CELKEM</td><td style="text-align:right">${formatCzk(totalExp)}</td></tr>
          <tr style="background:#e0f2fe; color:#0073ea; font-weight:800;"><td colspan="3">Volná kapacita na investice</td><td style="text-align:right">${formatCzk(surplusVal)}</td></tr>
        </tbody>
      </table>
    </div></div>
    ${renderPdfFooter(footerLine)}
  </section>
  ${buildPages34(data, clientName, today, authorName, footerLine)}
  ${renderInsurancePage(data, clientName, today, authorName, footerLine)}
  ${renderIncomeProtectionProposed(data, options, authorName, footerLine)}
  ${(data.notes != null && String(data.notes).trim() !== '') ? `
  <section class="pdf-page">
    ${renderPdfHeader('POZNÁMKY', clientName, today, authorName)}
    <div class="pdf-page-content"><div class="pdf-section">
      <div class="h2">Poznámky k analýze</div>
      <div style="white-space: pre-wrap; font-size: 10pt; color: #1f1c2e;">${escapeHtml(String(data.notes).trim())}</div>
    </div></div>
    ${renderPdfFooter(footerLine)}
  </section>
  ` : ''}
  ${renderCompanyPDFSection(data, clientName, today, authorName, footerLine)}
</div>
  `.trim().replace(/\{\{FOOTER_PAGE\}\}/g, (() => { let n = 0; return () => String(++n); })());
}
