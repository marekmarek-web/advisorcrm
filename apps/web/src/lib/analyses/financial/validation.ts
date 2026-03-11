/**
 * Financial analysis – validation and input parsing helpers.
 * Extracted from financni-analyza.html (Phase 1).
 */

/**
 * Parse number from string (accepts comma as decimal separator).
 */
export function parseNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = String(value).trim().replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse integer from string.
 */
export function parseIntSafe(value: string | number | null | undefined, fallback: number): number {
  if (value == null) return fallback;
  if (typeof value === 'number') return Math.floor(value);
  const n = parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}
