"use client";

import Link from "next/link";
import { useMemo } from "react";
import { X, Zap } from "lucide-react";
import type { EventRow } from "@/app/actions/events";
import type { TaskRow } from "@/app/actions/tasks";
import { getEventCategory } from "./event-categories";
import { formatTimeQuarterHourDisplay } from "./date-utils";

function formatTime(d: Date): string {
  return formatTimeQuarterHourDisplay(d);
}

const MONTH_NAMES = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function getFreeSlots(dayEvents: EventRow[], dateStr: string): { start: string; end: string }[] {
  const dayStart = new Date(dateStr + "T07:00:00").getTime();
  const dayEnd = new Date(dateStr + "T20:00:00").getTime();
  const withTimes = dayEvents
    .filter((e) => !e.allDay && e.startAt && e.endAt)
    .map((e) => ({
      start: new Date(e.startAt).getTime(),
      end: new Date(e.endAt!).getTime(),
    }))
    .filter((e) => e.start >= dayStart && e.end <= dayEnd)
    .sort((a, b) => a.start - b.start);

  const slots: { start: string; end: string }[] = [];
  let lastEnd = dayStart;
  for (const block of withTimes) {
    if (block.start - lastEnd >= 30 * 60 * 1000) {
      slots.push({
        start: new Date(lastEnd).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }),
        end: new Date(block.start).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }),
      });
    }
    lastEnd = Math.max(lastEnd, block.end);
  }
  if (dayEnd - lastEnd >= 30 * 60 * 1000) {
    slots.push({
      start: new Date(lastEnd).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }),
      end: new Date(dayEnd).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }),
    });
  }
  return slots;
}

export interface CalendarContextPanelProps {
  selectedDate: string;
  dayEvents: EventRow[];
  dayTasks: TaskRow[];
  dayTasksLoading: boolean;
  unreadMessagesCount?: number;
  onToggleTask: (task: TaskRow) => void;
  /** Called when user clicks "Přidat úkol"; parent should open new-task modal with this date. */
  onAddTask?: (dateStr: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  isMobile?: boolean;
}

export function CalendarContextPanel({
  selectedDate,
  dayEvents,
  dayTasks,
  dayTasksLoading,
  unreadMessagesCount = 0,
  onToggleTask,
  onAddTask,
  onToggleCollapsed,
  isMobile = false,
}: CalendarContextPanelProps) {
  const freeSlots = useMemo(
    () => getFreeSlots(dayEvents, selectedDate),
    [dayEvents, selectedDate]
  );

  const wrapMobile = (children: React.ReactNode) => {
    if (!isMobile) return children;
    return (
      <>
        <div className="wp-cal-context-panel--mobile-backdrop" onClick={onToggleCollapsed} />
        <div className="wp-cal-context-panel--mobile-sheet">{children}</div>
      </>
    );
  };

  return (
    <aside
      className={`wp-cal-context-panel bg-[color:var(--wp-surface-card)] rounded-2xl shadow-sm border border-[color:var(--wp-surface-card-border)] flex flex-col overflow-hidden z-30 transition-all flex-shrink-0 ${
        isMobile ? "wp-cal-context-panel--mobile" : ""
      }`}
    >
      {wrapMobile(
      <>
      <div className="p-6 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text)]">
          Agenda • {formatMonthYear(selectedDate)}
        </h3>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md hover:bg-[color:var(--wp-surface-muted)]"
            aria-label="Zavřít panel"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex-1 p-6 overflow-y-auto wp-cal-hide-scrollbar space-y-4 bg-[color:var(--wp-surface-muted)]/30">
        <div className="mt-2 rounded-2xl border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-500/12 to-indigo-500/8 p-4 dark:border-fuchsia-400/25 dark:from-fuchsia-500/18 dark:to-indigo-500/12">
          <div className="mb-2 flex items-center gap-2">
            <Zap size={14} className="shrink-0 text-fuchsia-600 dark:text-fuchsia-300" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text)] dark:text-fuchsia-200/90">
              Nástroje poradce
            </span>
          </div>
          <p className="mb-3 text-xs font-medium leading-relaxed text-[color:var(--wp-text-secondary)]">
            Klikněte na událost v kalendáři – detail se otevře v překryvu nad mřížkou (úpravy, typ, odkaz na klienta). Zde máte přehled dne, úkoly a volná okna.
          </p>
        </div>

        {/* Úkoly – hlavní sekce */}
        <section className="bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)] shadow-sm p-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-3">Úkoly</h4>
          {dayTasksLoading ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám…</p>
          ) : dayTasks.length === 0 ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)] mb-2">Žádné úkoly na tento den</p>
          ) : (
            <ul className="space-y-2 mb-3">
              {dayTasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleTask(task)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-[color:var(--wp-text-tertiary)] bg-[color:var(--wp-surface-card)] transition-colors hover:border-indigo-400 hover:bg-[color:var(--wp-surface-muted)] dark:border-white/35 dark:bg-[color:var(--wp-surface-muted)]/80"
                    style={task.completedAt ? { background: "var(--wp-success)", borderColor: "var(--wp-success)" } : {}}
                    aria-label={task.completedAt ? "Znovu otevřít" : "Splnit"}
                  >
                    {task.completedAt && <span className="text-white text-xs">✓</span>}
                  </button>
                  <span className={`text-sm ${task.completedAt ? "text-[color:var(--wp-text-tertiary)] line-through" : "text-[color:var(--wp-text)]"}`}>
                    {task.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {onAddTask && (
            <button
              type="button"
              onClick={() => onAddTask(selectedDate)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
            >
              + Přidat úkol
            </button>
          )}
          <Link href="/portal/tasks" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 mt-2 inline-block">
            Všechny úkoly →
          </Link>
        </section>

        <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] text-center pt-0">
          Detail události: klepněte na blok v kalendáři – otevře se vyskakovací okno.
        </p>

        <section>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Události dne</h4>
          {dayEvents.length === 0 ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádné události</p>
          ) : (
            <ul className="space-y-1.5">
              {dayEvents
                .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
                .map((ev) => {
                  const c = getEventCategory(ev.eventType);
                  return (
                    <li key={ev.id} className="flex items-center gap-2 text-sm">
                      <span className="text-[color:var(--wp-text-tertiary)] shrink-0">{formatTime(new Date(ev.startAt))}</span>
                      <span className="font-medium text-[color:var(--wp-text)] truncate">{ev.title}</span>
                      {ev.contactName && (
                        <span className="text-[color:var(--wp-text-secondary)] text-xs truncate hidden sm:inline">· {ev.contactName}</span>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        {freeSlots.length > 0 && (
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Volná okna</h4>
            <ul className="space-y-1 text-sm text-[color:var(--wp-text-secondary)]">
              {freeSlots.slice(0, 5).map((slot, i) => (
                <li key={i}>
                  {slot.start} – {slot.end}
                </li>
              ))}
            </ul>
          </section>
        )}

        {unreadMessagesCount > 0 && (
          <Link
            href="/portal/messages"
            className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700"
          >
            Zprávy čekající na reakci ({unreadMessagesCount})
          </Link>
        )}
      </div>
      </>
      )}
    </aside>
  );
}
