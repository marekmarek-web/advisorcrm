/**
 * Odvození data narození z českého rodného čísla (prvních 6 číslic = YYMMDD).
 * Muži: měsíc 01–12. Ženy: měsíc v RC 51–62 → kalendářně 01–12.
 */

import { normalizePersonalId } from "./normalize";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** YY (0–99) → plné rodné roky; posuvné okno vůči referenčnímu roku (výchozí dnes). */
export function fullBirthYearFromYy(yy: number, referenceYear: number): number {
  const currentYy = referenceYear % 100;
  if (yy > currentYy + 1) return 1900 + yy;
  return 2000 + yy;
}

function isValidGregorianDateUTC(year: number, month1to12: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month1to12 - 1, day));
  return (
    d.getUTCFullYear() === year && d.getUTCMonth() === month1to12 - 1 && d.getUTCDate() === day
  );
}

/** true = skip (9 číslic), false = neplatná kontrola u 10 číslic. */
export function czechPersonalIdMod11Valid(normalizedDigits: string): boolean {
  if (normalizedDigits.length !== 10) return true;
  const first9 = normalizedDigits.slice(0, 9);
  if (!/^\d{9}$/.test(first9)) return false;
  const n = Number(first9);
  if (!Number.isSafeInteger(n)) return false;
  const r = n % 11;
  const expected = r === 10 ? 0 : r;
  return Number(normalizedDigits[9]) === expected;
}

function calendarMonthFromRcMonthRaw(mmRaw: number): number | null {
  if (mmRaw >= 51 && mmRaw <= 62) return mmRaw - 50;
  if (mmRaw >= 1 && mmRaw <= 12) return mmRaw;
  return null;
}

/**
 * @param normalizedDigits řetězec po `normalizePersonalId` (9 nebo 10 číslic)
 * @returns YYYY-MM-DD nebo null
 */
export function birthDateFromCzechPersonalId(
  normalizedDigits: string,
  referenceYear = new Date().getFullYear(),
): string | null {
  const d = normalizedDigits.trim();
  if (d.length !== 9 && d.length !== 10) return null;
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 10 && !czechPersonalIdMod11Valid(d)) return null;

  const yy = Number(d.slice(0, 2));
  const mmRaw = Number(d.slice(2, 4));
  const dd = Number(d.slice(4, 6));
  const month = calendarMonthFromRcMonthRaw(mmRaw);
  if (month == null || dd < 1 || dd > 31) return null;

  const year = fullBirthYearFromYy(yy, referenceYear);
  if (!isValidGregorianDateUTC(year, month, dd)) return null;
  return `${year}-${pad2(month)}-${pad2(dd)}`;
}

/**
 * Doplní `params.birthDate` z `params.personalId`, pokud datum chybí nebo je prázdné.
 * Nemění neprázdný řetězec `birthDate`.
 */
export function enrichBirthDateFromPersonalIdInParams(params: Record<string, unknown>): void {
  const bd = params.birthDate;
  if (typeof bd === "string" && bd.trim()) return;
  const pid = params.personalId;
  if (typeof pid !== "string" || !pid.trim()) return;
  const norm = normalizePersonalId(pid);
  const derived = birthDateFromCzechPersonalId(norm);
  if (derived) params.birthDate = derived;
}
