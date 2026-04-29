"use client";

import { ChevronLeft, ChevronRight, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { formatMonthYear } from "./calendar-utils";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function CalendarMobileToolbar({
  anchorDate,
  segmentedValue,
  onSegmentChange,
  onOpenDrawer,
  onOpenSearch,
  onPrev,
  onNext,
  onToday,
  onRefresh,
  refreshing,
}: {
  anchorDate: Date;
  segmentedValue: "week" | "month";
  onSegmentChange: (next: "week" | "month") => void;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="shrink-0 space-y-2 px-1 pt-0">
      <div className="flex rounded-[1rem] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 p-1">
        {(
          [
            { id: "week" as const, label: "Týden" },
            { id: "month" as const, label: "Měsíc" },
          ]
        ).map((t) => {
          const active = segmentedValue === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSegmentChange(t.id)}
              className={cx(
                "min-h-[40px] flex-1 rounded-xl px-3 text-xs font-black uppercase tracking-wide transition-colors active:scale-[0.98]",
                active
                  ? "bg-[color:var(--wp-surface-card)] text-[#0a0f29] shadow-sm ring-1 ring-indigo-200/80"
                  : "text-[color:var(--wp-text-secondary)]",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Navigace období + akce */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-muted)] active:scale-95"
          aria-label="Zobrazení a filtry kalendáře"
        >
          <SlidersHorizontal size={20} />
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-muted)] active:scale-95"
            aria-label="Hledat v kalendáři"
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-muted)] active:scale-95 disabled:opacity-60"
            aria-label="Obnovit"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

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
          <p className="truncate font-display text-base font-black tracking-tight text-[color:var(--wp-text)]">
            {formatMonthYear(anchorDate)}
          </p>
          <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">
            {segmentedValue === "month" ? "Měsíční pohled" : "Časové bloky"}
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
          className="shrink-0 rounded-xl bg-[color:var(--wp-surface-muted)] px-3 py-2 text-[11px] font-black uppercase tracking-wide text-[color:var(--wp-text-secondary)] transition-colors active:bg-[color:var(--wp-surface-card-border)]"
        >
          Dnes
        </button>
      </div>
    </div>
  );
}
