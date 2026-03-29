/**
 * Calendar datetime strategy (Aidvisora):
 * - **Storage:** `timestamptz` in DB = single UTC instant (`toISOString()` / `Date` from server).
 * - **Timed events:** User picks **local wall time** on device (`datetime-local` → `parseLocalDateTimeInputToUtcMs`).
 *   In Czech Republic with phone set to Prague, that is **Europe/Prague** (including DST).
 * - **Display:** `new Date(iso).getHours()` / `formatDateLocal` use the **browser’s local zone** (same as device).
 * - **All-day → Google Calendar:** civil dates in **`Europe/Prague`** (`CALENDAR_ALL_DAY_TIMEZONE`), exclusive end date.
 *
 * Internal **sort keys** stay `YYYY-MM-DD` (stable, locale-neutral). Use **`formatDateDisplayCs`** for user-visible dates.
 */
export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** User-visible date in Czech style: `28. 3. 2026` (day in device local calendar). */
export function formatDateDisplayCs(d: Date): string {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/** `YYYY-MM-DD` key → `28. 3. 2026` (for labels built from map keys). */
export function formatDateDisplayCsFromYyyyMmDd(yyyyMmDd: string): string {
  const m = yyyyMmDd.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return yyyyMmDd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return yyyyMmDd;
  return `${d}. ${mo}. ${y}`;
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

const LOCAL_DATETIME_INPUT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

/**
 * Parse `YYYY-MM-DDTHH:mm` from datetime-local as **local wall time** (same interpretation in browser and Node).
 * `new Date("2026-03-28T14:45")` is local in browsers but UTC in Node — that mismatch caused 1–2h (or more) shifts
 * when server actions did `new Date(form.startAt)` on ISO strings from the client.
 */
export function parseLocalDateTimeInputToUtcMs(naiveLocal: string | undefined | null): number | null {
  if (!naiveLocal?.trim()) return null;
  const m = naiveLocal.trim().match(LOCAL_DATETIME_INPUT_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const sec = m[6] != null ? Number(m[6]) : 0;
  if (![y, mo, d, h, mi, sec].every((x) => Number.isFinite(x))) return null;
  const local = new Date(y, mo - 1, d, h, mi, sec, 0);
  const t = local.getTime();
  return Number.isNaN(t) ? null : t;
}

export function utcMsToIsoString(ms: number): string {
  return new Date(ms).toISOString();
}

/** Default IANA zone for all-day Google Calendar API (civil date on event). */
export const CALENDAR_ALL_DAY_TIMEZONE = "Europe/Prague";

/** Civil `YYYY-MM-DD` for an instant in a given IANA timezone (server-safe via Intl). */
export function formatCalendarDateInTimeZone(d: Date, timeZone: string = CALENDAR_ALL_DAY_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Add whole calendar days to a `YYYY-MM-DD` string (Gregorian, UTC date math). */
export function addCalendarDaysYyyyMmDd(yyyyMmDd: string, days: number): string {
  const [y, mo, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !mo || !d) return yyyyMmDd;
  const x = new Date(Date.UTC(y, mo - 1, d + days));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Parse datetime string from client: ISO with offset/Z → standard parse; bare `YYYY-MM-DDTHH:mm` → local wall time.
 */
export function parseInstantFromClientPayload(s: string): Date {
  const t = s.trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(t)) {
    const d = new Date(t);
    return d;
  }
  const ms = parseLocalDateTimeInputToUtcMs(t);
  if (ms != null) return new Date(ms);
  return new Date(t);
}

/** Výchozí délka nové časované aktivity (30 min). */
export const DEFAULT_EVENT_DURATION_MS = 30 * 60 * 1000;

/** Přičte ms k hodnotě `YYYY-MM-DDTHH:mm` v lokálním čase. */
export function addMsToLocalDateTime(naiveLocal: string, ms: number): string {
  const t = parseLocalDateTimeInputToUtcMs(naiveLocal);
  if (t == null) return naiveLocal;
  return formatDateTimeLocal(new Date(t + ms));
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
 * `datetime-local` value (no timezone suffix) → UTC ISO instant for API / DB.
 * Uses the same local-wall-time parsing in browser and Node (see `parseLocalDateTimeInputToUtcMs`).
 */
export function localDateTimeInputToUtcIso(naiveLocal: string | undefined): string | undefined {
  const ms = parseLocalDateTimeInputToUtcMs(naiveLocal);
  if (ms == null) return undefined;
  return utcMsToIsoString(ms);
}

/** Reminder instant: `minutes` before local wall start from `datetime-local` string. */
export function reminderUtcIsoFromLocalStart(naiveLocalStart: string, minutes: number): string | null {
  if (!minutes) return null;
  const startMs = parseLocalDateTimeInputToUtcMs(naiveLocalStart);
  if (startMs == null) return null;
  return utcMsToIsoString(startMs - minutes * 60_000);
}

/**
 * Format an ISO date-time string in a given IANA timezone (e.g. "Europe/Prague").
 * For display; use on client so Intl is available.
 */
export function formatInTimeZone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions = {}): string {
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", { timeZone, ...options });
}
