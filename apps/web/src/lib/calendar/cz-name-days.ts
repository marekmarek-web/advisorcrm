import { CZ_NAME_DAYS_MM_DD } from "./cz-name-days.generated";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Names celebrating a name day on the given calendar date (Czech civil calendar).
 * Uses Europe/Prague calendar date via caller — pass `year` from the same source as holidays.
 * On non–leap years, 29 February returns an empty list.
 */
export function getCzNameDaysForDate(year: number, month: number, day: number): string[] {
  if (month === 2 && day === 29 && !isLeapYear(year)) return [];
  const key = `${pad2(month)}-${pad2(day)}`;
  const row = CZ_NAME_DAYS_MM_DD[key];
  return row ? [...row] : [];
}
