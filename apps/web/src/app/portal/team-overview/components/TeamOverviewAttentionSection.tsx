"use client";

import { AlertTriangle, CheckCircle2, HeartHandshake, ChevronRight } from "lucide-react";
import type { TeamMemberInfo } from "@/app/actions/team-overview";
import type { TeamAlert } from "@/lib/team-overview-alerts";
import type { TeamOverviewPageModel } from "@/lib/team-overview-page-model";
import type { TeamOverviewScope } from "@/lib/team-hierarchy-types";

export function TeamOverviewAttentionSection({
  scope,
  members,
  displayName,
  topAttentionAlerts,
  pageModel,
  selectMember,
  canCreateTeamCalendar,
  variant = "default",
}: {
  scope: TeamOverviewScope;
  members: TeamMemberInfo[];
  displayName: (m: TeamMemberInfo) => string;
  topAttentionAlerts: TeamAlert[];
  pageModel: TeamOverviewPageModel;
  selectMember: (userId: string) => void;
  canCreateTeamCalendar: boolean;
  variant?: "default" | "firstFold";
}) {
  if (scope === "me") {
    return (
      <section
        className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]"
        aria-labelledby="self-priority-heading"
      >
        <div className="border-b border-slate-100 px-7 py-4">
          <h2 id="self-priority-heading" className="text-[17px] font-black tracking-tight text-slate-950">
            Vyžaduje pozornost
          </h2>
        </div>
        <p className="max-w-xl px-7 py-4 text-sm text-slate-500">
          V osobním rozsahu se seznam pozornosti neukazuje. Přepněte na týmový scope pro manažerský přehled.
        </p>
      </section>
    );
  }

  const hasCritical = topAttentionAlerts.some((a) => a.severity === "critical");

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]" aria-labelledby="team-priority-heading">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-7 py-4">
        <h2 id="team-priority-heading" className="text-[17px] font-black tracking-tight text-slate-950">
          Vyžaduje pozornost
        </h2>
        {hasCritical && (
          <span className="inline-flex items-center rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-rose-700">
            Vyžaduje podporu
          </span>
        )}
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
        {/* Signály */}
        <div className="border-b border-slate-100 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 border-b border-slate-100/60 bg-slate-50/60 px-5 py-3">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
            <h3 className="text-[12px] font-extrabold tracking-tight text-slate-900">Signály</h3>
            {topAttentionAlerts.length > 0 && (
              <span className="ml-auto text-[10px] font-extrabold tabular-nums text-amber-600">
                {topAttentionAlerts.length}
              </span>
            )}
          </div>
          <div className="p-4">
            {topAttentionAlerts.length === 0 ? (
              <div className="flex items-start gap-3 rounded-[16px] border border-emerald-200/60 bg-emerald-50/40 px-4 py-3.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <p className="text-[13px] font-extrabold text-emerald-900">Stabilní</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-700/80">
                    Žádné naléhavé signály v tomto rozsahu.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {topAttentionAlerts.map((a, i) => {
                  const alertMember = members.find((m) => m.userId === a.memberId);
                  const name = alertMember ? displayName(alertMember) : "Člen týmu";
                  const isCritical = a.severity === "critical";
                  return (
                    <li key={`${a.memberId}-${i}`}>
                      <button
                        type="button"
                        onClick={() => selectMember(a.memberId)}
                        className="group block w-full rounded-[16px] border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-left transition hover:border-amber-200 hover:bg-amber-50/30"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex shrink-0 rounded-[8px] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] ${
                              isCritical ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {isCritical ? "Kritické" : "Pozornost"}
                          </span>
                          <ChevronRight className="ml-auto h-3 w-3 text-slate-300 opacity-0 transition group-hover:opacity-100" aria-hidden />
                        </div>
                        <p className="mt-1 text-[13px] font-extrabold text-slate-900">{name}</p>
                        <p className="line-clamp-1 text-[11px] text-slate-400">{a.title}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Doporučené navázání */}
        <div>
          <div className="flex items-center gap-2 border-b border-slate-100/60 bg-slate-50/60 px-5 py-3">
            <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
            <h3 className="text-[12px] font-extrabold tracking-tight text-slate-900">Doporučené navázání</h3>
            {pageModel.coachingAttention.length > 0 && (
              <span className="ml-auto text-[10px] font-extrabold tabular-nums text-violet-600">
                {pageModel.coachingAttention.length}
              </span>
            )}
          </div>
          <div className="p-4">
            {pageModel.coachingAttention.length === 0 ? (
              <div className="rounded-[16px] border border-slate-200/70 bg-slate-50/60 px-4 py-3.5">
                <p className="text-[13px] font-extrabold text-slate-900">Vyrovnaný přehled</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  Z kariérního pohledu nikdo nevyčnívá.
                </p>
              </div>
            ) : (
              <>
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {pageModel.coachingAttention.map((c) => {
                    const mem = members.find((m) => m.userId === c.userId);
                    const name = mem ? displayName(mem) : c.displayName || c.email || "Člen týmu";
                    return (
                      <li key={c.userId}>
                        <button
                          type="button"
                          onClick={() => selectMember(c.userId)}
                          className="group block w-full rounded-[16px] border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-left transition hover:border-violet-200 hover:bg-violet-50/60"
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-extrabold text-slate-900">{name}</p>
                            <ChevronRight className="ml-auto h-3 w-3 text-violet-400 opacity-0 transition group-hover:opacity-100" aria-hidden />
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{c.reasonCs}</p>
                          <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-violet-700">
                            {c.recommendedActionLabelCs}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {canCreateTeamCalendar ? (
                  <a
                    href="#team-calendar-actions"
                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-violet-600 transition hover:text-violet-800 hover:underline"
                  >
                    Naplánovat schůzku nebo úkol
                    <ChevronRight className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
