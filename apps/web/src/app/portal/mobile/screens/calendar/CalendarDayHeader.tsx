"use client";

import { formatDateLocal } from "@/app/portal/calendar/date-utils";
import { dayIndexForHeader, getDayNames } from "./calendar-utils";

export function CalendarDayHeader({
  weekDays,
  todayStr,
  firstDayOfWeek,
  timeColWidth,
  compact,
  onSelectDay,
}: {
  weekDays: Date[];
  todayStr: string;
  firstDayOfWeek: 0 | 1;
  timeColWidth: number;
  compact: boolean;
  onSelectDay?: (day: Date) => void;
}) {
  const dayNames = getDayNames(firstDayOfWeek);

  return (
    <div className="flex shrink-0 border-b border-slate-200 bg-white shadow-sm">
      <div className="shrink-0 border-r border-slate-100" style={{ width: timeColWidth }} aria-hidden />
      {weekDays.map((day) => {
        const ds = formatDateLocal(day);
        const isToday = ds === todayStr;
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const idx = dayIndexForHeader(day, firstDayOfWeek);
        const inner = (
          <>
            <span
              className={`mb-1 font-black uppercase tracking-widest ${
                compact ? "text-[9px]" : "text-[10px]"
              } ${isToday ? "text-indigo-600" : "text-slate-400"}`}
            >
              {dayNames[idx]}
            </span>
            <div
              className={`flex items-center justify-center rounded-full font-bold ${
                compact ? "h-7 w-7 text-sm" : "h-8 w-8 text-base sm:h-9 sm:w-9"
              } ${isToday ? "bg-indigo-600 text-white shadow-md" : "text-slate-700"}`}
            >
              {day.getDate()}
            </div>
          </>
        );

        return (
          <div
            key={ds}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center border-r border-slate-100 py-2 last:border-r-0 ${
              isWeekend ? "bg-slate-50/50" : "bg-white"
            }`}
          >
            {onSelectDay ? (
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className="flex min-h-[48px] w-full flex-col items-center justify-center rounded-lg transition-colors active:bg-indigo-50/80"
                aria-label={`Přejít na ${ds}`}
              >
                {inner}
              </button>
            ) : (
              inner
            )}
          </div>
        );
      })}
    </div>
  );
}
