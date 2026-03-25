import type { EventRow } from "@/app/actions/events";
import { formatDateLocal } from "@/app/portal/calendar/date-utils";

export type CalendarViewMode = "day" | "3day" | "week" | "agenda";

export const MONTH_NAMES = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
] as const;

const DAY_NAMES_MON = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const DAY_NAMES_SUN = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

export function getDayNames(firstDayOfWeek: 0 | 1): string[] {
  return firstDayOfWeek === 1 ? DAY_NAMES_MON : DAY_NAMES_SUN;
}

export function dayIndexForHeader(day: Date, firstDayOfWeek: 0 | 1): number {
  if (firstDayOfWeek === 1) {
    return day.getDay() === 0 ? 6 : day.getDay() - 1;
  }
  return day.getDay();
}

export function startOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeekLocal(d: Date, firstDayOfWeek: 0 | 1): Date {
  const day = d.getDay();
  let diff: number;
  if (firstDayOfWeek === 1) {
    diff = d.getDate() - day + (day === 0 ? -6 : 1);
  } else {
    diff = d.getDate() - day;
  }
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

export function getVisibleDays(anchor: Date, view: CalendarViewMode, firstDayOfWeek: 0 | 1): Date[] {
  if (view === "day") return [startOfDayLocal(anchor)];
  if (view === "3day") {
    const base = startOfDayLocal(anchor);
    return [base, addDaysLocal(base, 1), addDaysLocal(base, 2)];
  }
  if (view === "agenda") {
    const start = startOfWeekLocal(startOfDayLocal(anchor), firstDayOfWeek);
    return Array.from({ length: 7 }, (_, i) => addDaysLocal(start, i));
  }
  const start = startOfWeekLocal(startOfDayLocal(anchor), firstDayOfWeek);
  return Array.from({ length: 7 }, (_, i) => addDaysLocal(start, i));
}

export function computeFetchRange(visibleDays: Date[]): { startIso: string; endIso: string } {
  if (visibleDays.length === 0) {
    const now = startOfDayLocal(new Date());
    return {
      startIso: addDaysLocal(now, -1).toISOString(),
      endIso: addDaysLocal(now, 2).toISOString(),
    };
  }
  const first = visibleDays[0]!;
  const last = visibleDays[visibleDays.length - 1]!;
  const start = startOfDayLocal(first);
  const endExclusive = addDaysLocal(startOfDayLocal(last), 1);
  return {
    startIso: addDaysLocal(start, -1).toISOString(),
    endIso: addDaysLocal(endExclusive, 1).toISOString(),
  };
}

export function buildEventsByDate(events: EventRow[]): Map<string, EventRow[]> {
  const map = new Map<string, EventRow[]>();
  for (const ev of events) {
    const key = formatDateLocal(new Date(ev.startAt));
    const arr = map.get(key) ?? [];
    arr.push(ev);
    map.set(key, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }
  return map;
}

export function navigateAnchor(anchor: Date, view: CalendarViewMode, direction: -1 | 1): Date {
  if (view === "day") return addDaysLocal(anchor, direction);
  if (view === "3day") return addDaysLocal(anchor, direction * 3);
  if (view === "agenda") return addDaysLocal(anchor, direction * 7);
  return addDaysLocal(anchor, direction * 7);
}

export function formatMonthYear(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function viewModeLabel(view: CalendarViewMode): string {
  if (view === "day") return "Den";
  if (view === "3day") return "3 dny";
  if (view === "agenda") return "Agenda";
  return "Týden";
}

/** Client-side filter by hidden event type ids (empty set = show all). */
export function filterEventsByTypes(events: EventRow[], hiddenTypes: Set<string>): EventRow[] {
  if (hiddenTypes.size === 0) return events;
  return events.filter((ev) => !hiddenTypes.has(ev.eventType ?? "schuzka"));
}

export function filterEventsByDateMap(
  map: Map<string, EventRow[]>,
  hiddenTypes: Set<string>,
): Map<string, EventRow[]> {
  if (hiddenTypes.size === 0) return map;
  const next = new Map<string, EventRow[]>();
  for (const [k, arr] of map) {
    next.set(k, filterEventsByTypes(arr, hiddenTypes));
  }
  return next;
}

export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR_PHONE = 22;
export const DEFAULT_END_HOUR_TABLET = 24;
