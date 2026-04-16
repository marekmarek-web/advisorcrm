/**
 * Kalendářní datum YYYY-MM-DD pro porovnání a API (bez časové složky).
 * Hodnoty z DB / Drizzle mohou být Date nebo řetězec s časovou složkou.
 */
export function normalizeIsoDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

/** Lokální kalendářní „dnes“ — stejná sémantika jako u `<input type="date">`. */
export function localCalendarTodayYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Lokální kalendářní datum + N dní (pro termín úkolu). */
export function localCalendarDatePlusDaysYmd(days: number): string {
  const n = new Date();
  n.setDate(n.getDate() + days);
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Výchozí termín nového úkolu: alespoň týden na splnění (ne „zítra po termínu“). */
export const DEFAULT_TASK_DUE_DAYS_FROM_NOW = 7;

export function defaultTaskDueDateYmd(): string {
  return localCalendarDatePlusDaysYmd(DEFAULT_TASK_DUE_DAYS_FROM_NOW);
}

/** Je termín (datum) před dneškem? Porovnání jen YYYY-MM-DD. */
export function isDueDateBeforeLocalToday(dueDate: string | null | undefined): boolean {
  const due = normalizeIsoDateOnly(dueDate);
  if (!due) return false;
  return due < localCalendarTodayYmd();
}
