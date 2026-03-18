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

/**
 * Format an ISO date-time string in a given IANA timezone (e.g. "Europe/Prague").
 * For display; use on client so Intl is available.
 */
export function formatInTimeZone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions = {}): string {
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", { timeZone, ...options });
}
