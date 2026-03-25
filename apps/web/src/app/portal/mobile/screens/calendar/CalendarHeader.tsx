"use client";

import { ChevronLeft, ChevronRight, Menu, RefreshCw, Search } from "lucide-react";
import type { CalendarViewMode } from "./calendar-utils";
import { formatMonthYear, viewModeLabel } from "./calendar-utils";

export function CalendarHeader({
  anchorDate,
  view,
  onOpenDrawer,
  onOpenSearch,
  onPrev,
  onNext,
  onToday,
  onRefresh,
  refreshing,
}: {
  anchorDate: Date;
  view: CalendarViewMode;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <header className="shrink-0 border-b border-slate-100 bg-white px-3 pb-2 pt-1 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors active:bg-slate-100 active:scale-95"
            aria-label="Menu kalendáře"
          >
            <Menu size={22} />
          </button>
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-slate-900">
            {formatMonthYear(anchorDate)}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors active:bg-slate-100 active:scale-95"
            aria-label="Hledat v kalendáři"
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors active:bg-slate-200 active:scale-[0.98]"
          >
            Dnes
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 transition-colors active:scale-95 disabled:opacity-60"
            aria-label="Obnovit"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-slate-500" : "text-slate-500"} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-slate-100 bg-slate-50 p-1">
          <button
            type="button"
            onClick={onPrev}
            className="rounded-lg p-1.5 text-slate-500 transition-all active:bg-white active:shadow-sm"
            aria-label="Předchozí období"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg p-1.5 text-slate-500 transition-all active:bg-white active:shadow-sm"
            aria-label="Následující období"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600">
          {viewModeLabel(view)}
        </div>
      </div>
    </header>
  );
}
