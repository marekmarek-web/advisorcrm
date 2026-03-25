"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CalendarDays, CheckSquare, User } from "lucide-react";
import { listEvents } from "@/app/actions/events";
import { getTasksByOpportunityId } from "@/app/actions/tasks";
import type { EventRow } from "@/app/actions/events";
import type { TaskRow } from "@/app/actions/tasks";

export function OpportunityLinkedTab({
  opportunityId,
  contactId,
  contactName,
}: {
  opportunityId: string;
  contactId: string | null;
  contactName: string;
}) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listEvents({ opportunityId }),
      getTasksByOpportunityId(opportunityId),
    ])
      .then(([evs, t]) => {
        setEvents(evs);
        setTasks(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [opportunityId]);

  if (loading) {
    return <p className="text-sm font-medium text-slate-500">Načítání…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
          <User size={14} className="text-indigo-500" aria-hidden />
          Klient
        </h3>
        {contactId ? (
          <Link
            href={`/portal/contacts/${contactId}`}
            className="text-sm font-black text-indigo-600 hover:underline min-h-[44px] inline-flex items-center"
          >
            {contactName || "—"}
          </Link>
        ) : (
          <p className="text-sm font-semibold text-slate-600">Nepřiřazeno</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
          <CalendarDays size={14} className="text-amber-600" aria-hidden />
          Schůzky ({events.length})
        </h3>
        {events.length === 0 ? (
          <p className="text-sm font-medium text-slate-500">Žádné schůzky k tomuto obchodu.</p>
        ) : (
          <ul className="space-y-2">
            {events.slice(0, 10).map((e) => (
              <li
                key={e.id}
                className="text-sm font-semibold text-slate-800 py-2 px-3 rounded-xl bg-slate-50 border border-slate-100"
              >
                {e.title}{" "}
                <span className="text-slate-500 font-medium block sm:inline sm:ml-1 mt-0.5 sm:mt-0">
                  {new Date(e.startAt).toLocaleString("cs-CZ")}
                </span>
              </li>
            ))}
            {events.length > 10 && (
              <li className="text-slate-500 text-xs font-bold uppercase tracking-wider pt-1">
                … a dalších {events.length - 10}
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
          <CheckSquare size={14} className="text-emerald-600" aria-hidden />
          Úkoly ({tasks.length})
        </h3>
        {tasks.length === 0 ? (
          <p className="text-sm font-medium text-slate-500">Žádné úkoly k tomuto obchodu.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.slice(0, 10).map((t) => (
              <li
                key={t.id}
                className="text-sm font-semibold text-slate-800 py-2 px-3 rounded-xl bg-slate-50 border border-slate-100"
              >
                {t.title}
                {t.dueDate ? (
                  <span className="text-slate-500 font-medium"> · {t.dueDate}</span>
                ) : null}
                {t.completedAt ? (
                  <span className="text-emerald-600 font-bold text-xs uppercase ml-1">dokončeno</span>
                ) : null}
              </li>
            ))}
            {tasks.length > 10 && (
              <li className="text-slate-500 text-xs font-bold uppercase tracking-wider pt-1">
                … a dalších {tasks.length - 10}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
