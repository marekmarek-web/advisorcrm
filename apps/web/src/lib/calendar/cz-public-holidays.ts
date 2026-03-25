/**
 * Czech Republic state holidays (státní svátky) — fixed dates + Easter Monday (Western, Gregorian).
 * Used for dashboard “dnešní svátek”. Does not include regional-only days.
 */

function easterSundayWestern(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function easterMonday(year: number): { month: number; day: number } {
  const { month, day } = easterSundayWestern(year);
  const dim = new Date(year, month, 0).getDate();
  if (day < dim) return { month, day: day + 1 };
  return { month: month + 1, day: 1 };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const FIXED_MM_DD: Record<string, string> = {
  "01-01": "Den obnovy samostatného českého státu",
  "05-01": "Svátek práce",
  "05-08": "Den vítězství",
  "07-05": "Den slovanských věrozvěstů Cyrila a Metoděje",
  "07-06": "Den upálení mistra Jana Husa",
  "09-28": "Den české státnosti",
  "10-28": "Den vzniku samostatného československého státu",
  "11-17": "Den boje za svobodu a demokracii",
  "12-24": "Štědrý den",
  "12-25": "1. svátek vánoční",
  "12-26": "2. svátek vánoční",
};

/**
 * @param year — calendar year in Europe/Prague
 * @param month — 1–12
 * @param day — day of month
 */
export function getCzPublicHolidayLabel(year: number, month: number, day: number): string | null {
  const key = `${pad2(month)}-${pad2(day)}`;
  const fixed = FIXED_MM_DD[key];
  if (fixed) return fixed;
  const em = easterMonday(year);
  const emKey = `${pad2(em.month)}-${pad2(em.day)}`;
  if (key === emKey) return "Velikonoční pondělí";
  return null;
}

export function getPragueCalendarParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
  ymd: string;
  mmdd: string;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return {
    year: y,
    month,
    day,
    ymd: `${y}-${pad2(month)}-${pad2(day)}`,
    mmdd: `${pad2(month)}-${pad2(day)}`,
  };
}
