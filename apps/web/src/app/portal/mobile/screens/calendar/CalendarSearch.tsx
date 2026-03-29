"use client";

import type { EventRow } from "@/app/actions/events";
import { formatDateDisplayCs, formatDateLocal } from "@/app/portal/calendar/date-utils";
import { BottomSheet } from "@/app/shared/mobile-ui/primitives";

export function CalendarSearch({
  open,
  onClose,
  query,
  onQueryChange,
  results,
  onPickEvent,
  rangeLabel,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  results: EventRow[];
  onPickEvent: (ev: EventRow) => void;
  rangeLabel: string;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Hledat v kalendáři">
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Název nebo klient…"
          className="min-h-[48px] w-full rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          autoFocus
        />
        <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
          V aktuálně načteném období ({rangeLabel})
        </p>
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {query.trim() && results.length === 0 ? (
            <li className="py-6 text-center text-sm text-[color:var(--wp-text-secondary)]">Žádná shoda</li>
          ) : null}
          {results.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                onClick={() => onPickEvent(ev)}
                className="flex w-full min-h-[52px] flex-col items-start rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-left active:bg-[color:var(--wp-surface-muted)]"
              >
                <span className="font-bold text-[color:var(--wp-text)]">{ev.title}</span>
                <span className="text-xs text-[color:var(--wp-text-secondary)]">
                  {formatDateDisplayCs(new Date(ev.startAt))}{" "}
                  {ev.allDay
                    ? "· celý den"
                    : `· ${new Date(ev.startAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </BottomSheet>
  );
}
