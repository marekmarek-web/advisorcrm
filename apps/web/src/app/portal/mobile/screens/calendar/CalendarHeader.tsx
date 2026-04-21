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
    <header className="shrink-0 px-3 pt-2 pb-2">
      {/* Top row — drawer + search */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-muted)] active:scale-95"
          aria-label="Menu kalendáře"
        >
          <Menu size={22} />
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-muted)] active:scale-95"
            aria-label="Hledat v kalendáři"
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-muted)] active:scale-95 disabled:opacity-60"
            aria-label="Obnovit"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Unified pill — month + arrows + Today + view label */}
      <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-2 shadow-sm">
        <button
          type="button"
          onClick={onPrev}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-muted)]"
          aria-label="Předchozí období"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate font-display text-base font-bold tracking-tight text-[color:var(--wp-text)]">
            {formatMonthYear(anchorDate)}
          </h1>
          <p className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
            {viewModeLabel(view)}
          </p>
        </div>
        <button
          type="button"
          onClick={onNext}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-muted)]"
          aria-label="Následující období"
        >
          <ChevronRight size={20} />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="shrink-0 rounded-xl bg-[color:var(--wp-surface-muted)] px-3 py-1.5 text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-card-border)]"
        >
          Dnes
        </button>
      </div>
    </header>
  );
}
