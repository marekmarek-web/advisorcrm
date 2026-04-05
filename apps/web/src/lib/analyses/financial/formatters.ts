/**
 * Financial analysis – formatting and text helpers.
 * Extracted from financni-analyza.html (Phase 1).
 */

import { getBaseFundFromProductKey } from '@/lib/analyses/financial/fund-library/helpers';

/**
 * Format number as Czech currency (no symbol in output; caller may append " Kč").
 */
export function formatCurrency(value: number): string {
  return Math.round(value).toLocaleString('cs-CZ');
}

/**
 * Format number as Czech currency with " Kč" suffix.
 */
export function formatCzk(value: number): string {
  return formatCurrency(value) + ' Kč';
}

/**
 * Format number as monthly amount: "3 000 Kč/měs."
 */
export function formatCurrencyMonthly(value: number): string {
  return formatCurrency(value) + ' Kč/měs.';
}

/**
 * Format number as yearly amount: "10 000 Kč/rok"
 */
export function formatCurrencyYearly(value: number): string {
  return formatCurrency(value) + ' Kč/rok';
}

/**
 * Format number as daily amount: "500 Kč/den"
 */
export function formatCurrencyDaily(value: number): string {
  return formatCurrency(value) + ' Kč/den';
}

/**
 * Format percent (e.g. 0.07 -> "7,0 %"). Single place for unit – space before %.
 */
export function formatPercent(value: number, decimals = 1): string {
  const v = typeof value === 'number' ? value * 100 : 0;
  return v.toFixed(decimals).replace('.', ',') + ' %';
}

/**
 * Format integer count (e.g. holdings, employees). No currency unit.
 * Use for counts only; never append " Kč" to this output.
 */
export function formatInteger(value: number): string {
  const n = Math.round(Number(value)) || 0;
  return n.toLocaleString('cs-CZ');
}

/**
 * Format date in Czech locale.
 */
export function formatDateCs(date: Date): string {
  return date.toLocaleDateString('cs-CZ');
}

/**
 * Safe filename from client name (alphanumeric, spaces to dash).
 */
export function safeNameForFile(name: string): string {
  return (name || 'klient')
    .replace(/[^a-zA-Z0-9áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\s]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Export filename: financni-plan-{name}-{date}.json
 */
export function exportFilename(clientName: string): string {
  const safe = safeNameForFile(clientName);
  const date = new Date().toISOString().split('T')[0];
  return `financni-plan-${safe}-${date}.json`;
}

/** Remove characters invalid in common OS filenames. Keeps spaces and Czech letters. */
export function sanitizeForFilename(name: string): string {
  return (name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export type FinancialAnalysisReportFilenameOptions = {
  /** If true, append date as DDMMYYYY (CZ). Default false — title is only „Finanční analýza - Jméno“. */
  includeDate?: boolean;
};

/**
 * Title / filename stem for FA HTML export and PDF print dialog, e.g.
 * "Finanční analýza - Jan Novák". Optional: "… - 24032025" when includeDate is true.
 */
export function financialAnalysisReportTitle(
  clientName: string,
  options?: FinancialAnalysisReportFilenameOptions,
): string {
  const raw = (clientName || '').trim() || 'Klient';
  const sanitized = sanitizeForFilename(raw);
  const base = `Finanční analýza - ${sanitized}`;
  if (!options?.includeDate) return base;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ddmmyyyy = `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`;
  return `${base} - ${ddmmyyyy}`;
}

export function financialAnalysisReportFilename(
  clientName: string,
  ext: 'html',
  options?: FinancialAnalysisReportFilenameOptions,
): string {
  return `${financialAnalysisReportTitle(clientName, options)}.${ext}`;
}

/** Záložní názvy pro legacy klíče (kanonické klíče jdou z katalogu). */
export const PRODUCT_NAMES: Record<string, string> = {
  creif: 'CREIF',
  atris: 'ATRIS',
  atris_realita: 'ATRIS',
  realita: 'ATRIS',
  penta: 'PENTA',
  penta_real_estate_fund: 'Penta',
  penta_real_estate: 'Penta',
  ishares: 'iShares Core MSCI World',
  ishares_core_msci_world: 'iShares Core MSCI World',
  fidelity2040: 'Fidelity 2040',
  fidelity_target_2040: 'Fidelity Target 2040',
  conseq: 'Conseq Globální akciový',
  conseq_globalni_akciovy_ucastnicky: 'Conseq Globální akciový účastnický',
};

export function getProductName(key: string, type?: string): string {
  const fund = getBaseFundFromProductKey(key);
  if (fund) {
    const base = fund.displayName;
    if (fund.baseFundKey === 'atris' && type === 'lump') return `${base} (Vklad)`;
    return base;
  }
  return PRODUCT_NAMES[key] ?? key;
}

/** Strategy profile description. */
export function getStrategyDesc(profile: string): string {
  if (profile === 'dynamic_plus')
    return 'Maximální růst s alternativními investicemi (10+ let). Nejvyšší potenciální výnos 12 %+ p.a.';
  if (profile === 'dynamic')
    return 'Vysoký růst pro dlouhodobé cíle (10+ let). Vyšší kolísavost, potenciální výnos 9 % p.a.';
  if (profile === 'conservative') return 'Ochrana kapitálu s mírným zhodnocením 5 % p.a. Pro krátké horizonty a rezervu.';
  return 'Kompromis mezi výnosem a stabilitou (5-10 let). Výnos 7 % p.a.';
}

/** Strategy profile label for report. */
export function getStrategyProfileLabel(profile: string): string {
  if (profile === 'dynamic_plus') return 'Dynamická+ (12 %)';
  if (profile === 'dynamic') return 'Dynamická (9 %)';
  if (profile === 'conservative') return 'Konzervativní (5 %)';
  return 'Vyvážená (7 %)';
}

/** Expected annual rate for a strategy profile. */
export function getProfileRate(profile: string): number {
  if (profile === 'dynamic_plus') return 0.12;
  if (profile === 'dynamic') return 0.09;
  if (profile === 'conservative') return 0.05;
  return 0.07;
}

/** Česká pluralizace pro roky: 1 rok, 2–4 roky, 5+ let. */
export function pluralizeYears(n: number): string {
  if (n === 1) return '1 rok';
  if (n >= 2 && n <= 4) return `${n} roky`;
  return `${n} let`;
}
