/** Split "Jméno Příjmení" into firstName / lastName. */
export function splitFullName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() };
}

/**
 * Parse FA birth date (dd.mm.yyyy, yyyy, yyyy-mm-dd) to ISO YYYY-MM-DD.
 * Returns null if not parseable.
 */
export function parseFaBirthDateToIso(raw: string): string | null {
  const s = raw?.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (/^\d{4}$/.test(s)) {
    const y = parseInt(s, 10);
    if (y >= 1900 && y <= new Date().getFullYear()) return `${y}-01-01`;
    return null;
  }

  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }

  return null;
}
