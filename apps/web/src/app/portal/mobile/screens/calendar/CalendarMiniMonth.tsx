"use client";

import { formatDateLocal } from "@/app/portal/calendar/date-utils";
import { MONTH_NAMES, addDaysLocal, startOfDayLocal, startOfWeekLocal } from "./calendar-utils";

export function CalendarMiniMonth({
  anchorDate,
  firstDayOfWeek,
  todayStr,
  onPickDay,
}: {
  anchorDate: Date;
  firstDayOfWeek: 0 | 1;
  todayStr: string;
  onPickDay: (d: Date) => void;
}) {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = startOfWeekLocal(monthStart, firstDayOfWeek);
  const label = `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;
  const dayLabels =
    firstDayOfWeek === 1 ? (["Po", "Út", "St", "Čt", "Pá", "So", "Ne"] as const) : (["Ne", "Po", "Út", "St", "Čt", "Pá", "So"] as const);

  const cells = Array.from({ length: 42 }, (_, i) => addDaysLocal(gridStart, i));

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
      <p className="mb-2 text-center text-xs font-black uppercase tracking-widest text-slate-500">{label}</p>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-slate-400">
        {dayLabels.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const ds = formatDateLocal(d);
          const inMonth = d.getMonth() === anchorDate.getMonth();
          const isToday = ds === todayStr;
          const isAnchor = ds === formatDateLocal(startOfDayLocal(anchorDate));
          return (
            <button
              key={ds}
              type="button"
              onClick={() => onPickDay(startOfDayLocal(d))}
              className={`flex h-9 min-h-[36px] items-center justify-center rounded-lg text-xs font-bold transition-colors active:scale-95 ${
                !inMonth ? "text-slate-300" : "text-slate-700"
              } ${
                isToday
                  ? "bg-indigo-600 text-white shadow-sm"
                  : isAnchor
                    ? "bg-indigo-100 text-indigo-800"
                    : inMonth
                      ? "bg-white hover:bg-slate-100"
                      : ""
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
