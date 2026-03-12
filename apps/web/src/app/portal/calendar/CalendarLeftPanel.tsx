"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { formatDateLocal } from "./date-utils";

const QUICK_NOTES_STORAGE_KEY = "weplan_calendar_quick_notes";

const MONTH_NAMES = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

function QuickNotes() {
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(QUICK_NOTES_STORAGE_KEY);
      setValue(raw ?? "");
    } catch {
      setValue("");
    }
    setLoaded(true);
  }, []);

  const save = useCallback((next: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(QUICK_NOTES_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const handleBlur = () => save(value);
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    save(next);
  };

  if (!loaded) return null;
  return (
    <>
      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
        Rychlé poznámky
      </h4>
      <textarea
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Poznámky k dnešnímu dni…"
        className="w-full min-h-[120px] p-3 text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-y"
        rows={5}
      />
    </>
  );
}

export interface CalendarLeftPanelProps {
  baseDate: Date;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  onToday: () => void;
}

export function CalendarLeftPanel({
  baseDate,
  selectedDate,
  onSelectDate,
  onToday,
}: CalendarLeftPanelProps) {
  const todayStr = formatDateLocal(new Date());
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
      <div className="p-5 flex-1 overflow-y-auto wp-cal-hide-scrollbar flex flex-col min-h-0">
        <QuickNotes />
      </div>
    </aside>
  );
}
