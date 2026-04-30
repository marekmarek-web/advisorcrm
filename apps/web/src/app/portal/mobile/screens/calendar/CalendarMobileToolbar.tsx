"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { formatMonthYear, type CalendarViewMode } from "./calendar-utils";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function CalendarMobileToolbar({
  anchorDate,
  view,
  onViewChange,
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
  onViewChange: (next: CalendarViewMode) => void;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const viewItems: Array<{ id: CalendarViewMode; label: string; modeLabel: string }> = [
    { id: "day", label: "Den", modeLabel: "Denní plán" },
    { id: "3day", label: "3 dny", modeLabel: "Třídenní fokus" },
    { id: "week", label: "Týden", modeLabel: "Týdenní přehled" },
    { id: "month", label: "Měsíc", modeLabel: "Měsíční přehled" },
  ];
  const activeModeLabel =
    viewItems.find((item) => item.id === view)?.modeLabel ?? "Týdenní přehled";

  return (
    <div className="shrink-0 space-y-5 pt-1">
      <div className="rounded-[28px] bg-white/55 p-1.5 shadow-[0_18px_40px_-32px_rgba(15,23,42,.4)] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1.5">
          {viewItems.map((t) => {
            const active = view === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => onViewChange(t.id)}
                className={cx(
                  "min-h-[44px] rounded-[22px] px-2 text-[11px] font-black uppercase tracking-[0.12em] transition-all active:scale-95",
                  active
                    ? "bg-slate-950 text-white shadow-[0_14px_26px_-16px_rgba(15,23,42,.65)]"
                    : "text-slate-500",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/70 text-slate-600 shadow-[0_14px_28px_-24px_rgba(15,23,42,.35)] ring-1 ring-slate-200/70 backdrop-blur-xl transition-transform active:scale-95"
          aria-label="Zobrazení a filtry kalendáře"
        >
          <SlidersHorizontal size={20} />
        </button>
        <div />
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/70 text-slate-600 shadow-[0_14px_28px_-24px_rgba(15,23,42,.35)] ring-1 ring-slate-200/70 backdrop-blur-xl transition-transform active:scale-95"
            aria-label="Hledat v kalendáři"
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/70 text-slate-600 shadow-[0_14px_28px_-24px_rgba(15,23,42,.35)] ring-1 ring-slate-200/70 backdrop-blur-xl transition-transform active:scale-95 disabled:opacity-60"
            aria-label="Obnovit"
          >
            <RefreshCw size={19} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <section className="rounded-[30px] bg-white/82 p-4 shadow-[0_18px_36px_-30px_rgba(15,23,42,.35)] ring-1 ring-slate-200/45 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPrev}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-200 transition-transform active:scale-95"
            aria-label="Předchozí období"
          >
            <ChevronLeft size={21} />
          </button>

          <div className="min-w-0 text-center">
            <p className="truncate text-[22px] font-black leading-tight tracking-tight text-slate-950">
              {formatMonthYear(anchorDate)}
            </p>
            <p className="mt-1 text-[11px] font-black uppercase tracking-[0.2em] text-indigo-600">
              {activeModeLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={onNext}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-200 transition-transform active:scale-95"
            aria-label="Následující období"
          >
            <ChevronRight size={21} />
          </button>
        </div>

        <button
          type="button"
          onClick={onToday}
          className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[20px] bg-slate-100 px-4 text-[13px] font-black uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200 transition-transform active:scale-[.99]"
        >
          <CalendarDays size={18} aria-hidden />
          Dnes
        </button>
      </section>
    </div>
  );
}
