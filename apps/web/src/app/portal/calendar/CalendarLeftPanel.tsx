"use client";

import { useMemo } from "react";

const MONTH_NAMES = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface CalendarLeftPanelProps {
  baseDate: Date;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  onToday: () => void;
  /** Optional: filter by event type (e.g. show only some calendars) */
  calendarFilters?: { clients: boolean; tasks: boolean; internal: boolean };
  onCalendarFiltersChange?: (f: { clients: boolean; tasks: boolean; internal: boolean }) => void;
}

export function CalendarLeftPanel({
  baseDate,
  selectedDate,
  onSelectDate,
  onToday,
  calendarFilters = { clients: true, tasks: true, internal: true },
  onCalendarFiltersChange,
}: CalendarLeftPanelProps) {
  const todayStr = formatDate(new Date());
  const daysInMonth = useMemo(() => {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const count = last.getDate();
    return { first, count, year, month };
  }, [baseDate]);

  const monthYear = `${MONTH_NAMES[baseDate.getMonth()]} ${baseDate.getFullYear()}`;

  return (
    <aside className="w-64 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden hidden lg:flex flex-shrink-0">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-sm">{monthYear}</h3>
          <button
            type="button"
            onClick={onToday}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
          >
            Dnes
          </button>
        </div>
        <div className="grid grid-cols-7 mb-2">
          {["PO", "ÚT", "ST", "ČT", "PÁ", "SO", "NE"].map((d, i) => (
            <div key={i} className="text-[10px] font-black text-slate-400 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: daysInMonth.count }, (_, i) => {
            const day = i + 1;
            const dateStr = `${daysInMonth.year}-${String(daysInMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === todayStr && baseDate.getMonth() === new Date().getMonth();
            const isSelected = dateStr === selectedDate;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelectDate(dateStr)}
                className={`h-7 flex items-center justify-center text-xs rounded-full cursor-pointer
                  ${isToday ? "bg-indigo-600 text-white font-bold shadow-md" : ""}
                  ${isSelected && !isToday ? "bg-indigo-100 text-indigo-700 font-bold" : ""}
                  ${!isToday && !isSelected ? "text-slate-600 hover:bg-slate-100" : ""}
                `}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-5 flex-1 overflow-y-auto wp-cal-hide-scrollbar">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
          Moje kalendáře
        </h4>
        <div className="space-y-2.5">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={calendarFilters.clients}
              onChange={() =>
                onCalendarFiltersChange?.({
                  ...calendarFilters,
                  clients: !calendarFilters.clients,
                })
              }
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
              Klientské schůzky
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={calendarFilters.tasks}
              onChange={() =>
                onCalendarFiltersChange?.({
                  ...calendarFilters,
                  tasks: !calendarFilters.tasks,
                })
              }
              className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              style={{ accentColor: "#f59e0b" }}
            />
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
              Úkoly a administrativa
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={calendarFilters.internal}
              onChange={() =>
                onCalendarFiltersChange?.({
                  ...calendarFilters,
                  internal: !calendarFilters.internal,
                })
              }
              className="w-4 h-4 rounded border-slate-300 text-slate-500 focus:ring-slate-500"
              style={{ accentColor: "#64748b" }}
            />
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
              Interní porady
            </span>
          </label>
        </div>
      </div>
    </aside>
  );
}
