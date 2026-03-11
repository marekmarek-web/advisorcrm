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
 * Format percent (e.g. 0.07 -> "7 %" or "7,0 %").
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

/** Product display names. */
export const PRODUCT_NAMES: Record<string, string> = {
  imperial: 'AlgoImperial',
  creif: 'CREIF',
  atris: 'ATRIS',
  penta: 'PENTA',
  ishares: 'iShares MSCI World ETF',
  fidelity2040: 'Fidelity Target 2040',
  conseq: 'Conseq Globální',
};

export function getProductName(key: string): string {
  return PRODUCT_NAMES[key] ?? key;
}

/** Strategy profile description. */
export function getStrategyDesc(profile: string): string {
  if (profile === 'dynamic')
    return 'Maximální růst pro dlouhodobé cíle (10+ let). Vyšší kolísavost, ale nejvyšší potenciální výnos.';
  if (profile === 'conservative') return 'Ochrana kapitálu s mírným zhodnocením. Pro krátké horizonty a rezervu.';
  return 'Kompromis mezi výnosem a stabilitou (5-10 let). Zlatá střední cesta.';
}

/** Strategy profile label for report. */
export function getStrategyProfileLabel(profile: string): string {
  if (profile === 'dynamic') return 'Dynamická';
  if (profile === 'conservative') return 'Konzervativní';
  return 'Vyvážená';
}
