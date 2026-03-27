/** YYYY-MM-DD → ms at UTC noon (stable day diff). */
export function ymdToUtcNoonMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

/** Krátké datum jako ve spec (např. „31. 3.“). */
export function czechAgendaDateShort(ymd: string): string {
  const ms = ymdToUtcNoonMs(ymd);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

/**
 * Relativní popisek k „dnes“ (YYYY-MM-DD v jedné časové ose — použijte Prahu u obou).
 */
export function czechRelativeAgendaDay(eventYmd: string, todayYmd: string): string {
  if (eventYmd === todayYmd) return "dnes";
  const a = ymdToUtcNoonMs(eventYmd);
  const b = ymdToUtcNoonMs(todayYmd);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  const diffDays = Math.round((a - b) / 86400000);
  if (diffDays === 1) return "zítra";
  if (diffDays > 1 && diffDays <= 30) return `za ${diffDays} dní`;
  if (diffDays < 0) return "";
  return `za ${diffDays} dní`;
}
