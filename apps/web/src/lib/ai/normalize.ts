/**
 * Normalization helpers for client matching and comparison.
 * All matching uses normalized values, not raw string compare.
 */

const DIACRITICS: Record<string, string> = {
  á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n", ó: "o", ř: "r", š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z",
  Á: "A", Č: "C", Ď: "D", É: "E", Ě: "E", Í: "I", Ň: "N", Ó: "O", Ř: "R", Š: "S", Ť: "T", Ú: "U", Ů: "U", Ý: "Y", Ž: "Z",
};

function removeDiacritics(s: string): string {
  return s.replace(/[^\u0000-\u007f]/g, (c) => DIACRITICS[c] ?? c);
}

/** Trim and collapse spaces; empty string becomes "". */
export function normalizeWhitespace(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).trim().replace(/\s+/g, " ");
}

/** Lowercase for case-insensitive compare. */
export function normalizeLower(s: string | null | undefined): string {
  return normalizeWhitespace(s).toLowerCase();
}

/** Trim + lowercase + remove diacritics. */
export function normalizeForCompare(s: string | null | undefined): string {
  return removeDiacritics(normalizeLower(s));
}

/** Czech phone: keep digits only, optional leading +420. */
export function normalizePhone(s: string | null | undefined): string {
  const t = normalizeWhitespace(s);
  if (!t) return "";
  const digits = t.replace(/\D/g, "");
  if (digits.startsWith("420") && digits.length >= 12) return digits.slice(3);
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
}

/** Email: lowercase, trim; no domain validation. */
export function normalizeEmail(s: string | null | undefined): string {
  return normalizeLower(s);
}

/** Rodné číslo / personalId: digits only (strip spaces/dashes). */
export function normalizePersonalId(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/\D/g, "");
}

/** IČO / companyId: digits only, 8 chars. */
export function normalizeCompanyId(s: string | null | undefined): string {
  const digits = String(s ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : digits;
}

/** Full name: normalized for compare (lowercase, no diacritics, single spaces). */
export function normalizeName(s: string | null | undefined): string {
  return normalizeForCompare(s);
}

/** Address: normalized for weak matching. */
export function normalizeAddress(s: string | null | undefined): string {
  return normalizeForCompare(s);
}

/** Date string YYYY-MM-DD: keep as-is if valid-looking, else "". */
export function normalizeDate(s: string | null | undefined): string {
  const t = normalizeWhitespace(s);
  if (!t) return "";
  const match = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const d = t.replace(/\D/g, "");
  if (d.length >= 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return "";
}
