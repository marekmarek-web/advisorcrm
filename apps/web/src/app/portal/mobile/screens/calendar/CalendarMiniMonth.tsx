"use client";

import { formatDateLocal } from "@/app/portal/calendar/date-utils";
import { MONTH_NAMES, addDaysLocal, startOfDayLocal, startOfWeekLocal } from "./calendar-utils";

export function CalendarMiniMonth({
  anchorDate,
  firstDayOfWeek,
  todayStr,
  onPickDay,
  eventDotsByDay,
}: {
  anchorDate: Date;
  firstDayOfWeek: 0 | 1;
  todayStr: string;
  onPickDay: (d: Date) => void;
  /** počet aktivit daného kalendářního dne (pro vizuální tečky) */
  eventDotsByDay?: Record<string, number>;
}) {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = startOfWeekLocal(monthStart, firstDayOfWeek);
  const label = `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;
  const dayLabels =
    firstDayOfWeek === 1 ? (["Po", "Út", "St", "Čt", "Pá", "So", "Ne"] as const) : (["Ne", "Po", "Út", "St", "Čt", "Pá", "So"] as const);

  const cells = Array.from({ length: 42 }, (_, i) => addDaysLocal(gridStart, i));

  return (
    <div className="rounded-[34px] bg-white/74 p-4 shadow-[0_20px_46px_-36px_rgba(15,23,42,.42)] ring-1 ring-slate-200/45 backdrop-blur-xl">
      <p className="mb-5 text-center text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[11px] font-black text-slate-400">
        {dayLabels.map((d) => (
          <span key={d} className="py-1">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((d) => {
          const ds = formatDateLocal(d);
          const inMonth = d.getMonth() === anchorDate.getMonth();
          const isToday = ds === todayStr;
          const isAnchor = ds === formatDateLocal(startOfDayLocal(anchorDate));
          const n = eventDotsByDay?.[ds] ?? 0;
          const dots = Math.min(Math.max(n, 0), 4);
          return (
            <button
              key={ds}
              type="button"
              onClick={() => onPickDay(startOfDayLocal(d))}
              className={`relative flex h-[56px] flex-col items-center justify-center gap-0.5 rounded-[18px] text-xs font-bold transition-colors active:scale-95 ${
                !inMonth ? "text-slate-300" : "text-slate-600"
              } ${
                isAnchor
                  ? "bg-indigo-600 text-white shadow-[0_14px_28px_-16px_rgba(79,70,229,.75)]"
                  : isToday
                    ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                    : inMonth
                      ? "bg-white ring-1 ring-slate-100"
                      : ""
              }`}
            >
              <span className="text-[15px] font-black">{d.getDate()}</span>
              {dots > 0 ? (
                <span className="flex h-3 items-center gap-px" aria-hidden>
                  {Array.from({ length: dots }).map((_, i) => (
                    <span
                      key={`${ds}-${i}`}
                      className={`h-1.5 w-1.5 rounded-full ${isAnchor ? "bg-white" : "bg-indigo-500"}`}
                    />
                  ))}
                </span>
              ) : (
                <span className="h-3" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
