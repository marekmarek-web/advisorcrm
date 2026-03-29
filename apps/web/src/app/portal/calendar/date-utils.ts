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

/** Výchozí délka nové časované aktivity (60 min). */
export const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

const NAIVE_LOCAL_DT = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?/;

/**
 * Parsuje formulářový řetězec `YYYY-MM-DDTHH:mm` (volitelně `:ss`) jako lokální kalendářní okamžik
 * prostřednictvím číselných složek — bez Date.parse na jednom řetězci (konzistence WebKit/Chromium).
 */
export function parseNaiveLocalDateTimeToLocalDate(value: string): Date | null {
  const raw = value.trim();
  const m = raw.match(NAIVE_LOCAL_DT);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = m[6] != null ? Number(m[6]) : 0;
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(mm) ||
    !Number.isFinite(ss)
  ) {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) {
    return null;
  }
  const dt = new Date(y, mo - 1, d, hh, mm, ss, 0);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d ||
    dt.getHours() !== hh ||
    dt.getMinutes() !== mm ||
    dt.getSeconds() !== ss
  ) {
    return null;
  }
  return dt;
}

/** Přičte ms k hodnotě `YYYY-MM-DDTHH:mm` v lokálním čase. */
export function addMsToLocalDateTime(naiveLocal: string, ms: number): string {
  const d = parseNaiveLocalDateTimeToLocalDate(naiveLocal);
  if (!d) return naiveLocal;
  return formatDateTimeLocal(new Date(d.getTime() + ms));
}

/** Zobrazení času po čtvrthodinách (jen UI; nemění uložený okamžik). */
export function formatTimeQuarterHourDisplay(d: Date): string {
  const x = new Date(d.getTime());
  let h = x.getHours();
  let min = x.getMinutes();
  min = Math.round(min / 15) * 15;
  if (min >= 60) {
    min = 0;
    h = Math.min(23, h + 1);
  }
  x.setHours(h, min, 0, 0);
  return x.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Naivní lokální datum–čas z formuláře → ISO 8601 v UTC (koncovka Z) pro server actions.
 * Server v prostředí TZ=UTC nesmí dostat řetězec bez offsetu — tam by se špatně interpretoval jako UTC wall-clock.
 */
export function localDateTimeInputToUtcIso(naiveLocal: string | undefined): string | undefined {
  if (!naiveLocal?.trim()) return undefined;
  const d = parseNaiveLocalDateTimeToLocalDate(naiveLocal);
  if (!d) return undefined;
  return d.toISOString();
}

/** ISO instant s explicitní zónou: Z nebo ±hh:mm / ±hhmm na konci řetězce. */
export function hasExplicitIsoOffset(iso: string): boolean {
  const t = iso.trim();
  if (!t) return false;
  if (/Z$/i.test(t)) return true;
  return /[+-]\d{2}:\d{2}$/.test(t) || /[+-]\d{4}$/.test(t);
}

/**
 * Připomínka N minut před začátkem; `startIsoUtc` musí být stejný instant jako uložený startAt.
 */
export function reminderIsoBeforeStartUtc(startIsoUtc: string | undefined, minutes: number): string | undefined {
  if (!startIsoUtc?.trim() || !minutes) return undefined;
  const d = new Date(startIsoUtc.trim());
  if (Number.isNaN(d.getTime())) return undefined;
  return new Date(d.getTime() - minutes * 60_000).toISOString();
}

/**
 * Google Calendar all-day: `start.date` = YYYY-MM-DD, `end.date` = exclusive end.
 * Uložíme UTC „poledne“ na začátek a na poslední zahrnutý den — stabilní klíč pro `formatDateLocal` napříč TZ.
 */
export function allDayGoogleRangeToDbInstants(
  startYmd: string,
  endYmdExclusive?: string | null,
): { startAt: Date; endAt: Date } | null {
  const sm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startYmd.trim());
  if (!sm) return null;
  const ys = Number(sm[1]);
  const ms = Number(sm[2]);
  const ds = Number(sm[3]);
  if (!Number.isFinite(ys) || !Number.isFinite(ms) || !Number.isFinite(ds)) return null;
  const startAt = new Date(Date.UTC(ys, ms - 1, ds, 12, 0, 0, 0));
  let endAt = startAt;
  const ex = endYmdExclusive?.trim();
  if (ex && /^\d{4}-\d{2}-\d{2}$/.test(ex)) {
    const em = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ex)!;
    const ye = Number(em[1]);
    const me = Number(em[2]);
    const de = Number(em[3]);
    const endExclusiveUtc = new Date(Date.UTC(ye, me - 1, de, 12, 0, 0, 0));
    endAt = new Date(endExclusiveUtc.getTime() - 86400000);
  }
  return { startAt, endAt };
}

/** `YYYY-MM-DD` → následující kalendářní den (UTC aritmetika na date-only). */
export function addOneCalendarDayYmd(ymd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Format an ISO date-time string in a given IANA timezone (e.g. "Europe/Prague").
 * For display; use on client so Intl is available.
 */
export function formatInTimeZone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions = {}): string {
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", { timeZone, ...options });
}
