"use client";

import { useState, useEffect, useCallback } from "react";
import { getTasksByContactId, completeTask, reopenTask, type TaskRow } from "@/app/actions/tasks";
import { listEvents, type EventRow } from "@/app/actions/events";
import Link from "next/link";

export function ContactTasksAndEvents({ contactId }: { contactId: string }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
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
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-700 px-4 py-3 border-b border-slate-100 bg-slate-50">
          Úkoly ({openTasks.length})
        </h3>
        <ul className="divide-y divide-slate-100">
          {openTasks.length === 0 && completedTasks.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500">Žádné úkoly.</li>
          )}
          {openTasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
              <button
                type="button"
                onClick={() => handleToggleTask(task)}
                className="shrink-0 w-5 h-5 rounded border border-slate-300 hover:border-blue-500 hover:bg-blue-50 flex items-center justify-center"
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
            <li key={task.id} className="flex items-center gap-3 px-4 py-2.5 opacity-70">
              <button
                type="button"
                onClick={() => handleToggleTask(task)}
                className="shrink-0 w-5 h-5 rounded border border-green-400 bg-green-50 flex items-center justify-center text-green-600"
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
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
          <Link
            href={`/portal/tasks`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Všechny úkoly →
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-700 px-4 py-3 border-b border-slate-100 bg-slate-50">
          Schůzky a události ({events.length})
        </h3>
        <ul className="divide-y divide-slate-100">
          {events.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500">Žádné události.</li>
          )}
          {upcomingEvents.map((ev) => (
            <li key={ev.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50">
              <span className="text-xs font-mono text-slate-400 w-12 shrink-0">
                {new Date(ev.startAt).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })}{" "}
                {new Date(ev.startAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="flex-1 text-sm text-slate-700">{ev.title}</span>
              <Link href="/portal/calendar" className="text-xs text-blue-600 hover:underline">
                Kalendář
              </Link>
            </li>
          ))}
          {pastEvents.slice(0, 5).map((ev) => (
            <li key={ev.id} className="px-4 py-2.5 flex items-center gap-3 opacity-75">
              <span className="text-xs font-mono text-slate-400 w-12 shrink-0">
                {new Date(ev.startAt).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })}
              </span>
              <span className="flex-1 text-sm text-slate-500">{ev.title}</span>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
          <Link
            href="/portal/calendar"
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Kalendář →
          </Link>
        </div>
      </div>
    </div>
  );
}
