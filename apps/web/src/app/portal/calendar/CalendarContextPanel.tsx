"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Calendar as CalendarIcon, Clock, MapPin, Video, User, X, Edit2, Trash2, Sparkles } from "lucide-react";
import type { EventRow } from "@/app/actions/events";
import type { TaskRow } from "@/app/actions/tasks";
import { getEventCategory } from "./event-categories";

function formatTime(d: Date): string {
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
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
  selectedEvent: EventRow | null;
  selectedDate: string;
  dayEvents: EventRow[];
  dayTasks: TaskRow[];
  dayTasksLoading: boolean;
  unreadMessagesCount?: number;
  onEditEvent: (event: EventRow) => void;
  onQuickEditEvent?: (event: EventRow) => void;
  onDeleteEvent: (event: EventRow) => void;
  onFollowUp: (eventId: string) => void;
  onOpenFullEdit: (event: EventRow) => void;
  onMarkDone: (event: EventRow) => void;
  onToggleTask: (task: TaskRow) => void;
  onRefresh: () => void;
  /** Called when user clicks "Přidat úkol"; parent should open new-task modal with this date. */
  onAddTask?: (dateStr: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  isMobile?: boolean;
}

export function CalendarContextPanel({
  selectedEvent,
  selectedDate,
  dayEvents,
  dayTasks,
  dayTasksLoading,
  unreadMessagesCount = 0,
  onEditEvent,
  onDeleteEvent,
  onOpenFullEdit,
  onMarkDone,
  onToggleTask,
  onAddTask,
  onToggleCollapsed,
  isMobile = false,
}: CalendarContextPanelProps) {
  const freeSlots = useMemo(
    () => getFreeSlots(dayEvents, selectedDate),
    [dayEvents, selectedDate]
  );
  const openTasks = dayTasks.filter((t) => !t.completedAt);

  if (selectedEvent) {
    const start = new Date(selectedEvent.startAt);
    const end = selectedEvent.endAt ? new Date(selectedEvent.endAt) : null;
    const timeStr = `${formatTime(start)}${end ? ` – ${formatTime(end)}` : ""}`;
    const dateStrFormatted = selectedEvent.startAt ? new Date(selectedEvent.startAt).toISOString().slice(0, 10) : selectedDate;
    const hasVideoLink = selectedEvent.meetingLink && (selectedEvent.eventType === "telefonat" || selectedEvent.meetingLink.includes("meet") || selectedEvent.meetingLink.includes("zoom"));

    return (
      <aside className="w-80 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden z-30 transition-all flex-shrink-0">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                <CalendarIcon size={12} /> {dateStrFormatted}
              </div>
              <h2 className="text-lg font-black text-slate-900 leading-tight">{selectedEvent.title}</h2>
            </div>
            {onToggleCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-slate-800 rounded-md transition-colors shadow-sm shrink-0"
                aria-label="Zavřít panel"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="p-5 space-y-6 flex-1 overflow-y-auto wp-cal-hide-scrollbar">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Clock size={14} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Čas</p>
                  <p className="text-sm font-bold text-slate-800">{timeStr}</p>
                </div>
              </div>
              {selectedEvent.location && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                    {hasVideoLink ? <Video size={14} /> : <MapPin size={14} />}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Místo</p>
                    <p className="text-sm font-bold text-slate-800">{selectedEvent.location}</p>
                  </div>
                </div>
              )}
            </div>

            {selectedEvent.meetingLink && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex flex-col gap-2">
                <a
                  href={selectedEvent.meetingLink.startsWith("http") ? selectedEvent.meetingLink : `https://${selectedEvent.meetingLink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Video size={16} /> Připojit se k hovoru
                </a>
              </div>
            )}

            {selectedEvent.contactName && (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Účastník</p>
                <Link
                  href={selectedEvent.contactId ? `/portal/contacts/${selectedEvent.contactId}` : "#"}
                  className="flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0">
                      {selectedEvent.contactName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600">{selectedEvent.contactName}</p>
                      <p className="text-[11px] font-medium text-slate-500">Otevřít profil klienta</p>
                    </div>
                  </div>
                </Link>
              </div>
            )}

            {selectedEvent.notes && (
              <div className="pt-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Poznámka</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedEvent.notes}</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-white grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenFullEdit(selectedEvent)}
              className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg"
            >
              <Edit2 size={14} /> Upravit
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Opravdu smazat tuto událost?")) onDeleteEvent(selectedEvent);
              }}
              className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg"
            >
              <Trash2 size={14} /> Smazat
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-80 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden z-30 transition-all flex-shrink-0">
      <div className="p-6 border-b border-slate-100 bg-white flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">
          Agenda • {formatMonthYear(selectedDate)}
        </h3>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="text-slate-400 hover:text-indigo-600 p-1 rounded-md hover:bg-slate-100"
            aria-label="Zavřít panel"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex-1 p-6 overflow-y-auto wp-cal-hide-scrollbar space-y-4 bg-slate-50/30">
        <div className="bg-gradient-to-b from-amber-50 to-orange-50/30 p-4 rounded-2xl border border-amber-100 shadow-sm mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-amber-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">AI Připomínka</span>
          </div>
          <p className="text-xs font-medium text-amber-900/80 leading-relaxed mb-3">
            Klikněte na událost v mřížce pro zobrazení detailu a rychlé úpravy.
          </p>
        </div>

        {/* Úkoly – hlavní sekce */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-3">Úkoly</h4>
          {dayTasksLoading ? (
            <p className="text-sm text-slate-500">Načítám…</p>
          ) : dayTasks.length === 0 ? (
            <p className="text-sm text-slate-500 mb-2">Žádné úkoly na tento den</p>
          ) : (
            <ul className="space-y-2 mb-3">
              {dayTasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleTask(task)}
                    className="w-5 h-5 rounded border-2 border-slate-300 flex items-center justify-center shrink-0 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                    style={task.completedAt ? { background: "var(--wp-success)", borderColor: "var(--wp-success)" } : {}}
                    aria-label={task.completedAt ? "Znovu otevřít" : "Splnit"}
                  >
                    {task.completedAt && <span className="text-white text-xs">✓</span>}
                  </button>
                  <span className={`text-sm ${task.completedAt ? "text-slate-400 line-through" : "text-slate-800"}`}>
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

        <p className="text-sm font-medium text-slate-500 text-center pt-0">
          Klikněte na jakoukoliv událost v mřížce pro zobrazení detailu.
        </p>

        <section>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Události dne</h4>
          {dayEvents.length === 0 ? (
            <p className="text-sm text-slate-500">Žádné události</p>
          ) : (
            <ul className="space-y-1.5">
              {dayEvents
                .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
                .map((ev) => {
                  const c = getEventCategory(ev.eventType);
                  return (
                    <li key={ev.id} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400 shrink-0">{formatTime(new Date(ev.startAt))}</span>
                      <span className="font-medium text-slate-800 truncate">{ev.title}</span>
                      {ev.contactName && (
                        <span className="text-slate-500 text-xs truncate hidden sm:inline">· {ev.contactName}</span>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        {freeSlots.length > 0 && (
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Volná okna</h4>
            <ul className="space-y-1 text-sm text-slate-600">
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
    </aside>
  );
}
