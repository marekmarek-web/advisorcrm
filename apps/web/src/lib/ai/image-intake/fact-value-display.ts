/**
 * Formátování hodnot faktů z image intake pro texty pro poradce (DD.MM.YYYY u datumů).
 * Interní CRM/API mohou nadále používat ISO YYYY-MM-DD.
 */

import { normalizeDateForAdvisorDisplay } from "@/lib/ai/canonical-date-normalize";

/** Fact klíče, u kterých má být hodnota zobrazena jako kalendářní datum (česky). */
export function isImageIntakeFactKeyDateLike(factKey: string): boolean {
  if (factKey === "due_date" || factKey === "possible_date_mention") return true;
  if (factKey === "birth_date") return true;
  if (/_birth_date$/i.test(factKey)) return true;
  return false;
}

/**
 * Hodnota faktu pro náhled v chatu — datumy jako DD.MM.YYYY.
 */
export function formatFactValueForAdvisorDisplay(
  factKey: string,
  raw: unknown,
  maxLen = 120,
): string {
  const s = String(raw ?? "").trim();
  if (!s) return s;
  const display = isImageIntakeFactKeyDateLike(factKey)
    ? normalizeDateForAdvisorDisplay(s) || s
    : s;
  return display.slice(0, maxLen);
}

/** Datum narození / obecné ISO nebo smíšené datum z draftu kontaktu. */
export function formatBirthDateLineForAdvisor(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  return normalizeDateForAdvisorDisplay(t) || t;
}
