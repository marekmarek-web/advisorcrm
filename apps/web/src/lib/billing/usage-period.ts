/**
 * Calendar month key for usage rows (UTC), format `YYYY-MM`.
 */
export function formatUtcPeriodMonth(at: Date = new Date()): string {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() + 1;
  return `${y}-${m < 10 ? `0${m}` : m}`;
}
