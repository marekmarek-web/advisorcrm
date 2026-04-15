"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import type { TeamAlert } from "@/lib/team-overview-alerts";

export function TeamOverviewFullAlertsSection({
  alerts,
  selectMember,
}: {
  alerts: TeamAlert[];
  selectMember: (userId: string) => void;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-lg font-black tracking-tight text-slate-950">Kompletní výpis signálů</h2>
      <p className="mb-3 text-xs text-slate-500">
        CRM i kariérní upozornění — totéž, co v přehledu nahoře; zde celý seznam pro kontrolu nebo tisk.
      </p>
      {alerts.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200/50 bg-emerald-50/30 px-5 py-6 text-center">
          <p className="font-medium text-emerald-900">Žádné další signály</p>
          <p className="mt-1 text-sm text-emerald-900/85">
            V tomto období a rozsahu je výpis prázdný — žádné sledované signály z CRM ani kariéry.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => selectMember(a.memberId)}
                className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:border-amber-200/80 hover:bg-amber-50/40"
              >
                <span
                  className={`shrink-0 rounded-full p-1 ${a.severity === "critical" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"}`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 font-medium text-slate-900">{a.title}</span>
                <span className="min-w-0 flex-[1_1_100%] text-sm text-slate-500 sm:flex-[1_1_auto]">{a.description}</span>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
