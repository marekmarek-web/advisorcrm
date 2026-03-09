"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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

  if (loading) return <p className="text-sm text-slate-500">Načítání…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-800 mb-2 text-sm">Klient</h3>
        {contactId ? (
          <Link href={`/portal/contacts/${contactId}`} className="text-blue-600 hover:underline">
            {contactName || "—"}
          </Link>
        ) : (
          <p className="text-slate-500">Nepřiřazeno</p>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-2 text-sm">Schůzky ({events.length})</h3>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">Žádné schůzky k tomuto obchodu.</p>
        ) : (
          <ul className="space-y-1">
            {events.slice(0, 10).map((e) => (
              <li key={e.id} className="text-sm">
                {e.title} – {new Date(e.startAt).toLocaleString("cs-CZ")}
              </li>
            ))}
            {events.length > 10 && <li className="text-slate-500 text-sm">… a dalších {events.length - 10}</li>}
          </ul>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-2 text-sm">Úkoly ({tasks.length})</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">Žádné úkoly k tomuto obchodu.</p>
        ) : (
          <ul className="space-y-1">
            {tasks.slice(0, 10).map((t) => (
              <li key={t.id} className="text-sm">
                {t.title}
                {t.dueDate && ` (${t.dueDate})`}
                {t.completedAt ? " – dokončeno" : ""}
              </li>
            ))}
            {tasks.length > 10 && <li className="text-slate-500 text-sm">… a dalších {tasks.length - 10}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
