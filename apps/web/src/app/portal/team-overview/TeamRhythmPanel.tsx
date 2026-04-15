"use client";

import { CalendarClock, ListChecks, AlertCircle, CheckCircle2, Plus } from "lucide-react";
import type { TeamOverviewScope } from "@/lib/team-hierarchy-types";
import type { TeamRhythmComputed } from "@/lib/team-rhythm/compute-view";
import type { TeamCadenceRow } from "@/lib/team-rhythm/build-cadence";
import type { InternalRhythmCategory } from "@/lib/team-rhythm/internal-classification";
import type { TeamCalendarModalPrefill } from "./TeamCalendarModal";

function rhythmCategoryHint(c: InternalRhythmCategory): string {
  switch (c) {
    case "one_on_one_hint":
      return "1:1 / rozhovor";
    case "adaptation_checkin_hint":
      return "Adaptační check-in";
    case "team_meeting_hint":
      return "Porada";
    case "follow_up_hint":
      return "Follow-up";
    default:
      return "Interní";
  }
}

function cadenceKindLabel(kind: TeamCadenceRow["cadenceKind"]): string {
  switch (kind) {
    case "one_on_one_due":
      return "Doporučeno 1:1";
    case "adaptation_checkin_due":
      return "Adaptační check-in";
    case "followup_due":
      return "Doporučené navázání";
    case "data_completion_followup":
      return "Vyžaduje doplnění";
    case "monitor_only":
      return "Sledovat";
    default:
      return kind;
  }
}

export function TeamRhythmPanel({
  computed,
  disclaimer,
  scope,
  canCreate,
  onSelectMember,
  resolveMemberLabel,
  onOpenEvent,
  onOpenTask,
}: {
  computed: TeamRhythmComputed;
  disclaimer: string;
  scope: TeamOverviewScope;
  canCreate: boolean;
  /** Výběr člena pro pravý panel — bez navigace na legacy detail stránku. */
  onSelectMember: (userId: string) => void;
  resolveMemberLabel: (userId: string) => string;
  onOpenEvent: (prefill?: TeamCalendarModalPrefill) => void;
  onOpenTask: (prefill?: TeamCalendarModalPrefill) => void;
}) {
  const showCadence = scope !== "me";
  const hasOverdue = computed.overdueTasks.length > 0;

  return (
    <section
      className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]"
      aria-labelledby="team-rhythm-heading"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/40 px-7 py-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
          <h2 id="team-rhythm-heading" className="text-[17px] font-black tracking-tight text-slate-950">
            Týmový rytmus
          </h2>
          {hasOverdue && (
            <span className="inline-flex items-center gap-1 rounded-[10px] border border-rose-200 bg-rose-50 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-rose-700">
              <AlertCircle className="h-3 w-3" aria-hidden />
              Po termínu
            </span>
          )}
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenTask({ title: "Follow-up — týmový přehled" })}
              className="inline-flex h-10 items-center gap-1.5 rounded-[12px] border border-slate-200 bg-white px-3.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50"
            >
              <Plus className="h-3 w-3" aria-hidden />
              Úkol
            </button>
            <button
              type="button"
              onClick={() => onOpenEvent({ title: "Porada — rozvoj týmu" })}
              className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-teal-700 px-3.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white transition hover:bg-teal-800"
            >
              <Plus className="h-3 w-3" aria-hidden />
              Schůzka
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-3">
        {/* Statistiky */}
        <div className="space-y-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            Tento týden / 14 dní
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[14px] border border-slate-200/80 bg-white px-3 py-3">
              <p className="text-[20px] font-black tabular-nums leading-none text-slate-950">
                {computed.stats.adaptationCheckinsThisWeek}
              </p>
              <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Adaptace</p>
            </div>
            <div className="rounded-[14px] border border-slate-200/80 bg-white px-3 py-3">
              <p className="text-[20px] font-black tabular-nums leading-none text-slate-950">
                {computed.stats.oneOnOneTaggedThisWeek}
              </p>
              <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">1:1</p>
            </div>
            <div className="rounded-[14px] border border-slate-200/80 bg-white px-3 py-3">
              <p className="text-[20px] font-black tabular-nums leading-none text-slate-950">
                {computed.stats.teamMeetingsThisWeek}
              </p>
              <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Porady</p>
            </div>
            <div
              className={
                computed.stats.overdueTeamTasks > 0
                  ? "rounded-[14px] border border-rose-200/60 bg-rose-50/40 px-3 py-3"
                  : "rounded-[14px] border border-slate-200/80 bg-white px-3 py-3"
              }
            >
              <p className={`text-[20px] font-black tabular-nums leading-none ${computed.stats.overdueTeamTasks > 0 ? "text-rose-800" : "text-slate-950"}`}>
                {computed.stats.overdueTeamTasks}
              </p>
              <p className={`mt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] ${computed.stats.overdueTeamTasks > 0 ? "text-rose-600" : "text-slate-400"}`}>
                Po termínu
              </p>
            </div>
          </div>

          {showCadence && computed.coachingCadenceAlignedCount > 0 ? (
            <div className="rounded-[14px] border border-teal-200/50 bg-teal-50/60 px-3 py-2.5 text-[11px] text-teal-900/90">
              <span className="font-extrabold">{computed.coachingCadenceAlignedCount}</span>{" "}
              {computed.coachingCadenceAlignedCount === 1 ? "osoba" : "lidí"} z „Potřebuje krok" jsou i v cadence.
            </div>
          ) : null}
        </div>

        {/* Nadcházející */}
        <div className="space-y-2">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Nadcházející</p>
          {computed.upcomingEvents.length === 0 ? (
            <p className="text-[12px] text-slate-400">Žádné naplánované událostí v příštích 14 dnech.</p>
          ) : (
            <ul className="max-h-52 space-y-1.5 overflow-y-auto">
              {computed.upcomingEvents.slice(0, 8).map((e) => (
                <li
                  key={e.id}
                  className={`rounded-[14px] border px-3 py-2.5 text-xs ${e.withinWeek ? "border-teal-200/60 bg-teal-50/30" : "border-slate-200/80 bg-slate-50/40"}`}
                >
                  <p className="line-clamp-1 text-[12px] font-extrabold text-slate-900">{e.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {e.startAtDate.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" })}
                    {e.withinWeek ? <span className="ml-1.5 font-extrabold text-teal-700">tento týden</span> : null}
                  </p>
                  <p className="text-[10px] text-slate-400">{rhythmCategoryHint(e.category ?? "internal_generic")}</p>
                </li>
              ))}
            </ul>
          )}
          {computed.recentPastEvents.length > 0 && (
            <div className="border-t border-slate-100/60 pt-2">
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                Nedávno proběhlo
              </p>
              <ul className="space-y-0.5 text-[11px] text-slate-400">
                {computed.recentPastEvents.slice(0, 3).map((e) => (
                  <li key={e.id} className="line-clamp-1">
                    {e.title} — {e.startAtDate.toLocaleDateString("cs-CZ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Úkoly */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            Úkoly
          </p>
          {hasOverdue ? (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-extrabold text-rose-800">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Po termínu
              </p>
              <ul className="max-h-28 space-y-1.5 overflow-y-auto">
                {computed.overdueTasks.slice(0, 5).map((t) => (
                  <li key={t.id} className="rounded-[14px] border border-rose-200/50 bg-rose-50/30 px-3 py-2 text-xs">
                    <p className="font-extrabold text-rose-800">{t.dueDateDate?.toLocaleDateString("cs-CZ")}</p>
                    <p className="line-clamp-1 text-slate-500">{t.title}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-[14px] border border-emerald-200/50 bg-emerald-50/30 px-3 py-2.5 text-[11px]">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <p className="text-emerald-800 font-semibold">Žádné týmové úkoly po termínu.</p>
            </div>
          )}
          {computed.upcomingTasks.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-extrabold text-slate-700">Blíží se termíny</p>
              <ul className="max-h-24 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                {computed.upcomingTasks.slice(0, 5).map((t) => (
                  <li key={t.id} className="line-clamp-1">
                    {t.dueDateDate?.toLocaleDateString("cs-CZ")} · {t.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Cadence */}
      {showCadence ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            Doporučená cadence
          </p>
          {computed.cadenceWithoutUpcomingTouch.length === 0 ? (
            <div className="flex items-center gap-2 text-[12px] text-slate-500">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
              Termíny jsou v souladu s doporučeními — výborná práce.
            </div>
          ) : (
            <ul className="space-y-2">
              {computed.cadenceWithoutUpcomingTouch.slice(0, 6).map((c) => (
                <li
                  key={c.userId}
                  className="flex flex-col gap-2 rounded-[16px] border border-slate-200/80 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onSelectMember(c.userId)}
                      className="text-left text-[13px] font-extrabold text-slate-950 transition hover:text-[#16192b] hover:underline"
                    >
                      {resolveMemberLabel(c.userId)}
                    </button>
                    <p className="mt-0.5 text-[11px] text-slate-400">{c.reasonCs}</p>
                    <span className="mt-1 inline-block rounded-[8px] border border-teal-200/60 bg-teal-100/80 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-teal-800">
                      {cadenceKindLabel(c.cadenceKind)}
                    </span>
                  </div>
                  {canCreate ? (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenEvent({ title: c.suggestEventTitle, notes: c.reasonCs, memberUserIds: [c.userId] })}
                        className="h-10 rounded-[12px] bg-teal-700 px-3.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white transition hover:bg-teal-800"
                      >
                        1:1
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenTask({ title: c.suggestTaskTitle, description: c.reasonCs, memberUserIds: [c.userId] })}
                        className="h-10 rounded-[12px] border border-slate-200 px-3.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-600 transition hover:bg-slate-50"
                      >
                        Úkol
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectMember(c.userId)}
                      className="shrink-0 text-[11px] font-extrabold text-teal-800 transition hover:underline"
                    >
                      Souhrn v panelu
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
          Plný cadence panel je pro manažerské zobrazení — přepněte rozsah na „Můj tým" nebo „Celá struktura".
        </p>
      )}

      <p className="border-t border-slate-100 px-5 py-2.5 text-[10px] text-slate-400">
        {disclaimer}
      </p>
    </section>
  );
}
