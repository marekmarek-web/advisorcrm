"use client";

import Link from "next/link";
import { CalendarClock, ListChecks, Users, AlertCircle } from "lucide-react";
import type { TeamOverviewScope } from "@/lib/team-hierarchy-types";
import type { TeamRhythmComputed } from "@/lib/team-rhythm/compute-view";
import type { TeamCadenceRow } from "@/lib/team-rhythm/build-cadence";
import type { InternalRhythmCategory } from "@/lib/team-rhythm/internal-classification";
import type { TeamCalendarModalPrefill } from "./TeamCalendarModal";

function rhythmCategoryHint(c: InternalRhythmCategory): string {
  switch (c) {
    case "one_on_one_hint":
      return "Heur.: 1:1 / rozhovor";
    case "adaptation_checkin_hint":
      return "Heur.: adaptace / check-in";
    case "team_meeting_hint":
      return "Heur.: porada / tým";
    case "follow_up_hint":
      return "Heur.: follow-up";
    default:
      return "Interní událost";
  }
}

function cadenceKindLabel(kind: TeamCadenceRow["cadenceKind"]): string {
  switch (kind) {
    case "one_on_one_due":
      return "Doporučeno 1:1";
    case "adaptation_checkin_due":
      return "Adaptační check-in";
    case "followup_due":
      return "Vhodné navázat";
    case "data_completion_followup":
      return "Doplnění údajů";
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
  memberDetailHref,
  resolveMemberLabel,
  onOpenEvent,
  onOpenTask,
}: {
  computed: TeamRhythmComputed;
  disclaimer: string;
  scope: TeamOverviewScope;
  canCreate: boolean;
  memberDetailHref: (userId: string) => string;
  resolveMemberLabel: (userId: string) => string;
  onOpenEvent: (prefill?: TeamCalendarModalPrefill) => void;
  onOpenTask: (prefill?: TeamCalendarModalPrefill) => void;
}) {
  const showCadence = scope !== "me";

  return (
    <section
      className="mb-6 rounded-2xl border border-teal-200/70 bg-gradient-to-br from-teal-50/40 via-[color:var(--wp-surface-card)] to-[color:var(--wp-surface-card)] p-5 shadow-sm"
      aria-labelledby="team-rhythm-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 id="team-rhythm-heading" className="text-lg font-semibold text-[color:var(--wp-text)] flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-teal-600 shrink-0" />
            Týmový rytmus a interní termíny
          </h2>
          <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)] max-w-3xl">{disclaimer}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            Rytmus (orientační, tento týden / 14 dní)
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2">
              <span className="text-[10px] uppercase text-[color:var(--wp-text-tertiary)]">Adapt. check-in</span>
              <p className="text-lg font-bold tabular-nums">{computed.stats.adaptationCheckinsThisWeek}</p>
            </li>
            <li className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2">
              <span className="text-[10px] uppercase text-[color:var(--wp-text-tertiary)]">1:1 (podle názvu)</span>
              <p className="text-lg font-bold tabular-nums">{computed.stats.oneOnOneTaggedThisWeek}</p>
            </li>
            <li className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2">
              <span className="text-[10px] uppercase text-[color:var(--wp-text-tertiary)]">Týmové porady</span>
              <p className="text-lg font-bold tabular-nums">{computed.stats.teamMeetingsThisWeek}</p>
            </li>
            <li className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-3 py-2">
              <span className="text-[10px] uppercase text-amber-900/80">Úkoly po termínu</span>
              <p className="text-lg font-bold tabular-nums text-amber-950">{computed.stats.overdueTeamTasks}</p>
            </li>
          </ul>
          {showCadence && computed.coachingCadenceAlignedCount > 0 ? (
            <p className="text-xs text-teal-900/90 bg-teal-50/80 border border-teal-200/50 rounded-lg px-3 py-2">
              <span className="font-semibold">{computed.coachingCadenceAlignedCount}</span>{" "}
              {computed.coachingCadenceAlignedCount === 1 ? "osoba z „Růst — kdo potřebuje krok“" : "lidé z „Růst — kdo potřebuje krok“"} souvisí i s cadence doporučeními níže — jeden pohled na člena v detailu spojí kariéru, coaching a návrh termínu.
            </p>
          ) : null}
        </div>

        <div className="lg:col-span-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Nadcházející v kalendáři týmu</p>
          {computed.upcomingEvents.length === 0 ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádné naplánované týmové události v příštích 14 dnech v tomto rozsahu.</p>
          ) : (
            <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {computed.upcomingEvents.slice(0, 8).map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-sm"
                >
                  <p className="font-medium text-[color:var(--wp-text)] line-clamp-2">{e.title}</p>
                  <p className="text-[11px] text-[color:var(--wp-text-secondary)] mt-0.5">
                    {e.startAtDate.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" })}
                    {e.withinWeek ? " · tento týden" : ""}
                  </p>
                  <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-0.5">
                    {rhythmCategoryHint(e.category ?? "internal_generic")}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {computed.recentPastEvents.length > 0 ? (
            <div className="pt-2 border-t border-[color:var(--wp-surface-card-border)]/60">
              <p className="text-[10px] font-semibold uppercase text-[color:var(--wp-text-tertiary)] mb-1">Nedávno proběhlo</p>
              <ul className="space-y-1 text-xs text-[color:var(--wp-text-secondary)]">
                {computed.recentPastEvents.slice(0, 4).map((e) => (
                  <li key={e.id} className="line-clamp-1">
                    {e.title} — {e.startAtDate.toLocaleDateString("cs-CZ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] flex items-center gap-2">
            <ListChecks className="w-3.5 h-3.5" />
            Úkoly a navázání
          </p>
          {computed.overdueTasks.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-amber-900 mb-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Po termínu (týmové úkoly)
              </p>
              <ul className="space-y-1.5 text-sm max-h-28 overflow-y-auto">
                {computed.overdueTasks.slice(0, 6).map((t) => (
                  <li key={t.id} className="text-[color:var(--wp-text-secondary)] line-clamp-2">
                    <span className="text-rose-700 font-medium">{t.dueDateDate?.toLocaleDateString("cs-CZ")}</span> · {t.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádné týmové úkoly po termínu v tomto rozsahu (okno −90 dní).</p>
          )}
          {computed.upcomingTasks.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-[color:var(--wp-text)] mb-1">Blížící se termíny úkolů</p>
              <ul className="space-y-1 text-xs text-[color:var(--wp-text-secondary)] max-h-24 overflow-y-auto">
                {computed.upcomingTasks.slice(0, 5).map((t) => (
                  <li key={t.id} className="line-clamp-2">
                    {t.dueDateDate?.toLocaleDateString("cs-CZ")} · {t.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {canCreate ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  onOpenTask({
                    title: "Follow-up — týmový přehled",
                    memberUserIds: undefined,
                  })
                }
                className="min-h-[40px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-xs font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
              >
                Přidat follow-up úkol
              </button>
              <button
                type="button"
                onClick={() =>
                  onOpenEvent({
                    title: "Porada — rozvoj týmu",
                    memberUserIds: undefined,
                  })
                }
                className="min-h-[40px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-xs font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
              >
                Naplánovat poradu
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showCadence ? (
        <div className="mt-5 pt-4 border-t border-[color:var(--wp-surface-card-border)]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-2">
            Doporučená cadence (ne povinný řád — podle kariéry, adaptace a týmového kalendáře)
          </p>
          {computed.cadenceWithoutUpcomingTouch.length === 0 ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">
              Buď jsou navázané termíny v souladu s doporučeními, nebo stačí průběžně sledovat — výborná práce.
            </p>
          ) : (
            <ul className="space-y-2">
              {computed.cadenceWithoutUpcomingTouch.slice(0, 6).map((c) => (
                <li
                  key={c.userId}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/30 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <Link href={memberDetailHref(c.userId)} className="font-medium text-sm text-[color:var(--wp-text)] hover:underline">
                      {resolveMemberLabel(c.userId)}
                    </Link>
                    <p className="text-[11px] text-[color:var(--wp-text-secondary)] mt-0.5">{c.reasonCs}</p>
                    <p className="text-[11px] font-semibold text-teal-900 mt-1">{cadenceKindLabel(c.cadenceKind)}</p>
                  </div>
                  {canCreate ? (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenEvent({
                            title: c.suggestEventTitle,
                            notes: c.reasonCs,
                            memberUserIds: [c.userId],
                          })
                        }
                        className="min-h-[40px] rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white hover:bg-teal-800"
                      >
                        Naplánovat 1:1 / schůzku
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenTask({
                            title: c.suggestTaskTitle,
                            description: c.reasonCs,
                            memberUserIds: [c.userId],
                          })
                        }
                        className="min-h-[40px] rounded-lg border border-[color:var(--wp-surface-card-border)] px-3 py-2 text-xs font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                      >
                        Úkol
                      </button>
                    </div>
                  ) : (
                    <Link
                      href={memberDetailHref(c.userId)}
                      className="text-xs font-medium text-teal-700 hover:underline shrink-0"
                    >
                      Otevřít detail
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[color:var(--wp-text-secondary)]">
          V režimu „Já“ vidíte jen vlastní rozsah — plný cadence panel je pro manažerské zobrazení týmu.
        </p>
      )}
    </section>
  );
}
