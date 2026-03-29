import type { CalendarFontSize } from "./calendar-settings";

/** Tailwind text / box classes for mobile calendar grid (time ruler, header, event chips). */
export type CalendarGridFontClasses = {
  timeCol: string;
  dayName: string;
  dayNumberText: string;
  dayNumberBox: string;
  eventTitle: string;
  eventMeta: string;
  allDayChip: string;
};

/**
 * Map calendar settings fontSize + compact week view to concrete class names.
 * `compact` = week or more columns (smaller chrome).
 */
export function getCalendarGridFontClasses(
  fontSize: CalendarFontSize | null | undefined,
  compact: boolean,
): CalendarGridFontClasses {
  const sz = fontSize ?? "base";
  const c = compact;

  if (sz === "small") {
    return {
      timeCol: c ? "text-[8px]" : "text-[9px]",
      dayName: c ? "text-[8px]" : "text-[9px]",
      dayNumberText: "text-xs",
      dayNumberBox: c ? "h-6 w-6 min-h-[24px] min-w-[24px]" : "h-7 w-7 min-h-[28px] min-w-[28px]",
      eventTitle: c ? "text-[8px]" : "text-[9px]",
      eventMeta: "text-[8px]",
      allDayChip: "text-[8px]",
    };
  }
  if (sz === "large") {
    return {
      timeCol: c ? "text-[10px]" : "text-xs",
      dayName: c ? "text-[10px]" : "text-xs",
      dayNumberText: "text-lg",
      dayNumberBox: c ? "h-8 w-8 min-h-[32px] min-w-[32px]" : "h-9 w-9 min-h-[36px] min-w-[36px] sm:h-10 sm:w-10 sm:min-h-[40px] sm:min-w-[40px]",
      eventTitle: c ? "text-[11px]" : "text-xs",
      eventMeta: "text-[10px]",
      allDayChip: "text-[10px]",
    };
  }
  return {
    timeCol: c ? "text-[9px]" : "text-[10px]",
    dayName: c ? "text-[9px]" : "text-[10px]",
    dayNumberText: "text-sm",
    dayNumberBox: c ? "h-7 w-7 min-h-[28px] min-w-[28px]" : "h-8 w-8 min-h-[32px] min-w-[32px] sm:h-9 sm:w-9 sm:min-h-[36px] sm:min-w-[36px]",
    eventTitle: c ? "text-[9px]" : "text-[10px]",
    eventMeta: "text-[9px]",
    allDayChip: "text-[9px]",
  };
}
