"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getClientTimeline } from "@/app/actions/timeline";
import type { ClientTimelineEvent } from "@/lib/timeline/types";
import { ClientTimelineFeed } from "./ClientTimelineFeed";
import { Calendar, CheckSquare, Briefcase } from "lucide-react";

export function ClientTimeline({ contactId }: { contactId: string }) {
  const [events, setEvents] = useState<ClientTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    getClientTimeline(contactId)
      .then(setEvents)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [contactId]);

  if (loading) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-4 text-sm">
          Životní timeline
        </h2>
        <p className="text-sm text-slate-500">Načítání…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-4 text-sm">
          Životní timeline
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Nepodařilo se načíst timeline.
        </p>
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg hover:bg-indigo-50 min-h-[44px]"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-4 text-sm">
          Životní timeline
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Zatím zde nejsou žádné události. Životní timeline se naplní schůzkami,
          úkoly, obchody a dalšími kroky.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/portal/calendar?contactId=${contactId}`}
            className="inline-flex items-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-sm font-bold transition-colors min-h-[44px]"
          >
            <Calendar size={16} /> Naplánovat schůzku
          </Link>
          <Link
            href="/portal/tasks"
            className="inline-flex items-center gap-2 px-4 py-3 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-sm font-bold transition-colors min-h-[44px]"
          >
            <CheckSquare size={16} /> Vytvořit úkol
          </Link>
          <Link
            href={`/portal/contacts/${contactId}#obchody`}
            className="inline-flex items-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-sm font-bold transition-colors min-h-[44px]"
          >
            <Briefcase size={16} /> Založit obchod
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-slate-800 mb-4 text-sm">
        Životní timeline
      </h2>
      <ClientTimelineFeed events={events} />
    </div>
  );
}
