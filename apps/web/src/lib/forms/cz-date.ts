/**
 * Czech-style date display/entry: "d. m. yyyy" ↔ ISO "yyyy-mm-dd" for DB/API.
 */

const DIGIT_MAX = 8;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Strip leading zeros for display (9 not 09). */
function displayPart(n: string): string {
  const x = parseInt(n, 10);
  return Number.isNaN(x) ? n : String(x);
}

function isFourDigitYear(s: string): boolean {
  return s.length === 4 && /^(19|20)\d{2}$/.test(s);
}

/** True if `s` is a prefix of some year 1900–2099 (partial typing of yyyy). */
function isYearPrefix(s: string): boolean {
  if (s.length === 0) return true;
  if (s.length > 4) return false;
  for (let y = 1900; y <= 2099; y++) {
    if (String(y).startsWith(s)) return true;
  }
  return false;
}

/** Délka dne (1 nebo 2 cifry) z řetězce číslic. */
function dayDigitLength(d: string): number {
  if (d.length === 0) return 0;
  if (d.length === 1) return 1;
  const f = d[0]!;
  const n2 = parseInt(d.slice(0, 2), 10);
  if (f >= "4") return 1;
  if (n2 > 31) return 1;
  if (d.length >= 6 && n2 <= 31) {
    const after2 = d.slice(2);
    if (after2.length === 4 && isFourDigitYear(after2)) {
      const n1 = parseInt(f, 10);
      if (n1 >= 1 && n1 <= 3 && d[1] !== "0") return 1;
    }
  }
  return 2;
}

/**
 * Build "d. m. yyyy" display from digit sequence (max 8).
 * Den/měsíc: inteligentní šířka (např. 442026 → 4. 4. 2026, 1212029 → 12. 1. 2029).
 */
export function formatCzDateFromDigits(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, DIGIT_MAX);
  if (!d) return "";

  const dayLen = dayDigitLength(d);
  const dayRaw = d.slice(0, dayLen);
  if (d.length <= dayLen) return displayPart(dayRaw);

  const rest = d.slice(dayLen);
  if (rest.length === 0) return `${displayPart(dayRaw)}. `;

  let monthRaw: string;
  let yearDigits: string;

  if (rest.length === 1) {
    monthRaw = rest;
    yearDigits = "";
  } else if (rest[0]! > "1") {
    monthRaw = rest.slice(0, 1);
    yearDigits = rest.slice(1);
  } else {
    const m2 = rest.slice(0, 2);
    const nM = parseInt(m2, 10);
    const afterTwo = rest.slice(2);
    if (
      nM >= 1 &&
      nM <= 12 &&
      (afterTwo.length === 0 ||
        afterTwo.length === 4 ||
        (afterTwo.length < 4 && isYearPrefix(afterTwo)))
    ) {
      monthRaw = m2;
      yearDigits = afterTwo;
    } else {
      monthRaw = rest.slice(0, 1);
      yearDigits = rest.slice(1);
    }
  }

  const out = `${displayPart(dayRaw)}. ${displayPart(monthRaw)}`;
  if (!yearDigits) return out;
  return `${out}. ${yearDigits}`;
}

/**
 * Extract digit sequence for progressive formatting.
 * If the user typed dot separators (d. m. yyyy), groups are taken per segment so
 * "1.1" stays day 1 + month 1, not eleven.
 */
export function digitsFromCzDateInput(raw: string): string {
  if (raw.includes(".")) {
    const segments = raw.split(".");
    const day = (segments[0]?.replace(/\D/g, "") ?? "").slice(0, 2);
    const month = (segments[1]?.replace(/\D/g, "") ?? "").slice(0, 2);
    const year = (segments[2]?.replace(/\D/g, "") ?? "").slice(0, 4);
    return (day + month + year).slice(0, DIGIT_MAX);
  }
  return raw.replace(/\D/g, "").slice(0, DIGIT_MAX);
}

/**
 * Rozpracované zadání do kanonického "d. m. yyyy" mezerami.
 * Bez teček: chytré dělení číslic (formatCzDateFromDigits).
 * S tečkami: "1." → "1. ", "1.1." → "1. 1. ", "01.01.2026" → "1. 1. 2026".
 */
export function formatCzDateTyping(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!trimmed.includes(".")) {
    return formatCzDateFromDigits(digitsFromCzDateInput(trimmed));
  }
  const digitGroups = trimmed.split(".").map((s) => s.replace(/\D/g, ""));
  const d = (digitGroups[0] ?? "").slice(0, 2);
  const m = (digitGroups[1] ?? "").slice(0, 2);
  const y = (digitGroups[2] ?? "").slice(0, 4);
  const dotGroups = trimmed.split(".").length - 1;

  let result = "";
  if (d.length > 0) {
    result = displayPart(d);
  }
  if (dotGroups >= 1) {
    result += ". ";
    if (m.length > 0) {
      result += displayPart(m);
    }
  }
  if (dotGroups >= 2) {
    result += ". ";
    if (y.length > 0) {
      result += y;
    }
  }
  return result;
}

/** ISO yyyy-mm-dd → "d. m. yyyy" for display. */
export function formatCzDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!month || !day || month > 12 || day > 31) return "";
  return `${day}. ${month}. ${year}`;
}

/**
 * ISO `yyyy-mm-dd` v UI vždy jako české datum (den. měsíc. rok), nikdy americký ani ISO zápis.
 */
export function formatIsoDateForUiCs(iso: string | null | undefined): string {
  const cz = formatCzDate(iso);
  return cz || "—";
}

/** Parse "d. m. yyyy" (flexible spaces) to ISO or null. */
export function parseCzDateToIso(display: string): string | null {
  const m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(display.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export type CzDateValidation = { ok: true; iso: string } | { ok: false; message: string };

export function validateCzDateComplete(display: string): CzDateValidation {
  const trimmed = display.trim();
  if (!trimmed) return { ok: false, message: "" };
  const iso = parseCzDateToIso(trimmed);
  if (!iso) return { ok: false, message: "Zadejte platné datum (den. měsíc. rok)." };
  return { ok: true, iso };
}

/** Alias for API fields: same as parseCzDateToIso. */
export function normalizeDateForApi(display: string): string | null {
  return parseCzDateToIso(display);
}
