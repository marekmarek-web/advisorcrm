import type { ReportBranding } from './types';
import { esc } from './helpers';
import { runBacktest } from '@/lib/calculators/investment/investment.backtest';
import { HISTORICAL_DATA, INVESTMENT_DEFAULTS } from '@/lib/calculators/investment/investment.config';
import type { FinancialAnalysisData } from '../types';
import type { InvestmentEntry } from '../types';

/** Tisk: sidebar je skrytý — zobrazíme kontakt poradce v patičce. */
export function renderPrintAdvisorChrome(branding: ReportBranding): string {
  const name = branding.advisorName?.trim();
  const web = branding.advisorWebsite?.trim();
  const tel = branding.advisorPhone?.trim();
  const line = [name, web, tel].filter(Boolean).join(' · ');
  if (!line) return '';
  return `<div class="print-only print-advisor-footer" aria-hidden="true">${esc(line)}</div>`;
}

export function computeReportMonthlyDeposit(data: FinancialAnalysisData): number {
  const invs = (data.investments ?? []).filter(
    (i: InvestmentEntry) => i.amount > 0 && i.productKey !== 'algoimperial',
  );
  let m = 0;
  for (const inv of invs) {
    if (inv.type === 'monthly' || inv.type === 'pension') m += inv.amount;
  }
  return m > 0 ? m : INVESTMENT_DEFAULTS.monthlyDefault;
}

function sliceLabelsForStartYear(startYear: number): string[] {
  const targetStartDate = new Date(`${startYear}-01-01`);
  let startIndex = HISTORICAL_DATA.findIndex((d) => new Date(d.date) >= targetStartDate);
  if (startIndex === -1) startIndex = 0;
  return HISTORICAL_DATA.slice(startIndex).map((d) => d.date);
}

/** Předpočítané křivky pro každý rok startu (malý JSON — málo bodů v HISTORICAL_DATA). */
export function buildBacktestPresetsForHtml(monthly: number): string {
  const presets: Record<
    string,
    { labels: string[]; invested: number[]; sp500: number[]; gold: number[]; bonds: number[]; re: number[] }
  > = {};
  for (let y = INVESTMENT_DEFAULTS.startYearMin; y <= INVESTMENT_DEFAULTS.startYearMax; y++) {
    const r = runBacktest(monthly, y, HISTORICAL_DATA);
    const labels = sliceLabelsForStartYear(y);
    presets[String(y)] = {
      labels,
      invested: r.invested.map((p) => p[1]),
      sp500: r.sp500.map((p) => p[1]),
      gold: r.gold.map((p) => p[1]),
      bonds: r.bonds.map((p) => p[1]),
      re: r.re.map((p) => p[1]),
    };
  }
  return JSON.stringify({
    monthly,
    presets,
    startYearMin: INVESTMENT_DEFAULTS.startYearMin,
    startYearMax: INVESTMENT_DEFAULTS.startYearMax,
    defaultYear: INVESTMENT_DEFAULTS.startYearDefault,
  });
}
