"use client";

import { useState, useEffect, useCallback } from "react";
import { getTasksByContactId, completeTask, reopenTask, type TaskRow } from "@/app/actions/tasks";
import { listEvents, type EventRow } from "@/app/actions/events";
import Link from "next/link";

export function ContactTasksAndEvents({ contactId }: { contactId: string }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [t, e] = await Promise.all([
        getTasksByContactId(contactId),
        listEvents({ contactId }),
      ]);
      setTasks(t);
      setEvents(e);
    } catch {
      setTasks([]);
      setEvents([]);
      setLoadError("Nepodařilo se načíst úkoly a schůzky.");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggleTask(task: TaskRow) {
    if (task.completedAt) await reopenTask(task.id);
    else await completeTask(task.id);
    load();
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Načítám…</p>;
  }
  if (loadError) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-red-600 text-sm mb-3">{loadError}</p>
        <button type="button" onClick={() => load()} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 min-h-[44px]">
          Zkusit znovu
        </button>
      </div>
    );
  }

  const upcomingEvents = events
    .filter((ev) => new Date(ev.startAt) >= new Date())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const pastEvents = events
    .filter((ev) => new Date(ev.startAt) < new Date())
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  const openTasks = tasks.filter((t) => !t.completedAt);
  const completedTasks = tasks.filter((t) => t.completedAt);

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">
            Úkoly ({openTasks.length})
          </h3>
          <Link
            href={`/portal/tasks?contactId=${contactId}`}
            className="inline-flex items-center gap-2 rounded-[var(--wp-radius)] px-3 py-2 text-sm font-semibold bg-[var(--wp-accent)] text-white hover:opacity-90 min-h-[44px]"
          >
            Přidat úkol
          </Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {openTasks.length === 0 && completedTasks.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500">Žádné úkoly.</li>
          )}
          {openTasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 min-h-[44px]">
              <button
                type="button"
                onClick={() => handleToggleTask(task)}
                className="shrink-0 w-6 h-6 rounded border border-slate-300 hover:border-[var(--wp-accent)] hover:bg-blue-50 flex items-center justify-center"
                aria-label={task.completedAt ? "Znovu otevřít" : "Splnit"}
              >
                {task.completedAt ? "✓" : null}
              </button>
              <span className="flex-1 text-sm text-slate-700">{task.title}</span>
              {task.dueDate && (
                <span className="text-xs text-slate-400">
                  {new Date(task.dueDate + "T00:00:00").toLocaleDateString("cs-CZ")}
                </span>
              )}
            </li>
          ))}
          {completedTasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-3 opacity-70 min-h-[44px]">
              <button
                type="button"
                onClick={() => handleToggleTask(task)}
                className="shrink-0 w-6 h-6 rounded border border-green-400 bg-green-50 flex items-center justify-center text-green-600"
                aria-label="Znovu otevřít"
              >
                ✓
              </button>
              <span className="flex-1 text-sm text-slate-500 line-through">{task.title}</span>
              {task.dueDate && (
                <span className="text-xs text-slate-400">
                  {new Date(task.dueDate + "T00:00:00").toLocaleDateString("cs-CZ")}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
          <Link
            href={`/portal/tasks?contactId=${contactId}`}
            className="text-sm font-medium text-[var(--wp-accent)] hover:underline min-h-[44px] inline-flex items-center"
          >
            Všechny úkoly →
          </Link>
        </div>
      </div>

      <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white shadow-sm overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-700 px-4 py-3 border-b border-slate-100 bg-slate-50">
          Schůzky a události ({events.length})
        </h3>
        <ul className="divide-y divide-slate-100">
          {events.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500">Žádné události.</li>
          )}
          {upcomingEvents.map((ev) => (
            <li key={ev.id} className="px-4 py-3 flex flex-wrap items-center gap-2 hover:bg-slate-50 min-h-[44px]">
              <span className="text-xs font-mono text-slate-400 w-12 shrink-0">
                {new Date(ev.startAt).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })}{" "}
                {new Date(ev.startAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="flex-1 text-sm text-slate-700 min-w-0">{ev.title}</span>
              <Link
                href={`/portal/contacts/${contactId}?eventId=${ev.id}#briefing`}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border border-indigo-200"
              >
                Připrav briefing
              </Link>
              <Link href="/portal/calendar" className="text-sm text-[var(--wp-accent)] hover:underline min-h-[44px] inline-flex items-center">
                Kalendář
              </Link>
            </li>
          ))}
          {pastEvents.slice(0, 5).map((ev) => (
            <li key={ev.id} className="px-4 py-3 flex items-center gap-3 opacity-75 min-h-[44px]">
              <span className="text-xs font-mono text-slate-400 w-12 shrink-0">
                {new Date(ev.startAt).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })}
              </span>
              <span className="flex-1 text-sm text-slate-500">{ev.title}</span>
            </li>
          ))}
        </ul>
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
          <Link
            href="/portal/calendar"
            className="text-sm font-medium text-[var(--wp-accent)] hover:underline min-h-[44px] inline-flex items-center"
          >
            Kalendář →
          </Link>
        </div>
      </div>
    </div>
  );
}
