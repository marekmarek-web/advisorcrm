/**
 * Local date formatting for calendar (avoids UTC shift).
 * Use everywhere we compare "today" or build date keys (YYYY-MM-DD).
 */
export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hodnota pro `<input type="datetime-local" />` v lokálním čase uživatele (ne UTC z toISOString). */
export function formatDateTimeLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** Výchozí délka nové časované aktivity (30 min). */
export const DEFAULT_EVENT_DURATION_MS = 30 * 60 * 1000;

/** Přičte ms k hodnotě `YYYY-MM-DDTHH:mm` v lokálním čase. */
export function addMsToLocalDateTime(naiveLocal: string, ms: number): string {
  const d = new Date(naiveLocal.trim());
  if (Number.isNaN(d.getTime())) return naiveLocal;
  return formatDateTimeLocal(new Date(d.getTime() + ms));
}

/** Zobrazení času po čtvrthodinách (jen UI; nemění uložený okamžik). */
export function formatTimeQuarterHourDisplay(d: Date): string {
  const x = new Date(d.getTime());
  let h = x.getHours();
  let m = x.getMinutes();
  m = Math.round(m / 15) * 15;
  if (m >= 60) {
    m = 0;
    h = Math.min(23, h + 1);
  }
  x.setHours(h, m, 0, 0);
  return x.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Pouze v prohlížeči: `datetime-local` bez časové zóny → jednoznačné UTC ISO pro server actions.
 * Na serveru Node parsuje `YYYY-MM-DDTHH:mm` jako UTC a posune čas o pásmo uživatele.
 */
export function localDateTimeInputToUtcIso(naiveLocal: string | undefined): string | undefined {
  if (!naiveLocal?.trim()) return undefined;
  const d = new Date(naiveLocal.trim());
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * Format an ISO date-time string in a given IANA timezone (e.g. "Europe/Prague").
 * For display; use on client so Intl is available.
 */
export function formatInTimeZone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions = {}): string {
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", { timeZone, ...options });
}
