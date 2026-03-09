"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getDocumentsForOpportunity } from "@/app/actions/documents";
import { listEvents } from "@/app/actions/events";
import { getTasksByOpportunityId } from "@/app/actions/tasks";
import type { OpportunityDetail } from "@/app/actions/pipeline";

export function OpportunitySidebar({ opportunity }: { opportunity: OpportunityDetail }) {
  const [docCount, setDocCount] = useState(0);
  const [nextActivity, setNextActivity] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState<string | null>(null);

  useEffect(() => {
    getDocumentsForOpportunity(opportunity.id).then((list) => setDocCount(list.length));
  }, [opportunity.id]);

  useEffect(() => {
    const now = new Date();
    const nowStr = now.toISOString();
    Promise.all([
      listEvents({ opportunityId: opportunity.id, start: nowStr }),
      getTasksByOpportunityId(opportunity.id),
      listEvents({ opportunityId: opportunity.id, end: nowStr }),
    ])
      .then(([upcomingEvents, tasks, pastEvents]) => {
        const nextEvent = upcomingEvents[0];
        if (nextEvent) {
          setNextActivity(`${nextEvent.title} – ${new Date(nextEvent.startAt).toLocaleString("cs-CZ")}`);
        } else {
          const nextTask = tasks.filter((t) => !t.completedAt && t.dueDate && t.dueDate >= nowStr.slice(0, 10))[0];
          setNextActivity(nextTask ? `${nextTask.title} (${nextTask.dueDate})` : null);
        }
        const lastEv = pastEvents.length > 0 ? pastEvents[pastEvents.length - 1] : null;
        if (lastEv) {
          setLastActivity(`${lastEv.title} – ${new Date(lastEv.startAt).toLocaleString("cs-CZ")}`);
        } else {
          const completed = tasks.filter((t) => t.completedAt).sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1))[0];
          setLastActivity(completed ? `${completed.title} (dokončeno)` : null);
        }
      })
      .catch(() => {});
  }, [opportunity.id]);

  const valueNum = opportunity.expectedValue ? Number(opportunity.expectedValue) : 0;
  const probability = opportunity.probability ?? opportunity.stageProbability ?? 0;

  return (
    <aside className="w-72 flex-shrink-0 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-semibold text-slate-800 mb-3 text-xs uppercase tracking-wide">Čeho se to týká</h3>
        <div className="space-y-2">
          <div>
            <span className="text-slate-500 block text-xs">Klient</span>
            {opportunity.contactId ? (
              <Link href={`/portal/contacts/${opportunity.contactId}`} className="text-blue-600 hover:underline">
                {opportunity.contactName || "—"}
              </Link>
            ) : (
              <span className="text-slate-600">—</span>
            )}
          </div>
          <div>
            <span className="text-slate-500 block text-xs">Vlastník</span>
            <span className="text-slate-600">{opportunity.assignedTo || "Nepřiřazeno"}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-xs">Typ produktu</span>
            <span className="text-slate-600 capitalize">{opportunity.caseType || "—"}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-semibold text-slate-800 mb-2 text-xs uppercase tracking-wide">Přílohy ({docCount})</h3>
        <p className="text-slate-500 text-xs">Dokumenty k obchodu v záložce Nabídky / přílohy.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-semibold text-slate-800 mb-3 text-xs uppercase tracking-wide">Finanční shrnutí</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Konečná cena</span>
            <span className="font-medium">{valueNum.toLocaleString("cs-CZ")} Kč</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Předpokládané náklady</span>
            <span className="text-red-600">0,00 Kč</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Předpokládaný zisk</span>
            <span className="font-medium text-green-600">{valueNum.toLocaleString("cs-CZ")} Kč</span>
          </div>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, probability)}%` }} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-semibold text-slate-800 mb-2 text-xs uppercase tracking-wide">Aktivita</h3>
        <div className="space-y-2">
          <div>
            <span className="text-slate-500 block text-xs">Nejbližší naplánovaná</span>
            <span className="text-slate-700">{nextActivity || "bez aktivity"}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-xs">Poslední realizovaná</span>
            <span className="text-slate-700">{lastActivity || "bez aktivity"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
