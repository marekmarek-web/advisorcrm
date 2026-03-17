/**
 * Financial analysis – formatting and text helpers.
 * Extracted from financni-analyza.html (Phase 1).
 */

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

/** Product display names (screenshot/reference: CREIF, PENTA, ATRIS, ETF World, Fidelity 2040, Conseq Globální). */
export const PRODUCT_NAMES: Record<string, string> = {
  creif: 'CREIF',
  atris: 'ATRIS',
  penta: 'PENTA',
  ishares: 'iShares MSCI World ETF',
  alternative: 'Alternativní investice',
  fidelity2040: 'Fidelity 2040',
  conseq: 'Conseq Globální',
};

export function getProductName(key: string, type?: string): string {
  const base = PRODUCT_NAMES[key] ?? key;
  if (key === 'atris' && type === 'lump') return 'ATRIS (Vklad)';
  return base;
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
