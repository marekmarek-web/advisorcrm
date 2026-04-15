"use client";

import Link from "next/link";
import { Briefcase, ChevronRight } from "lucide-react";
import type { TeamMemberInfo } from "@/app/actions/team-overview";
import type { TeamOverviewPageModel } from "@/lib/team-overview-page-model";
import type { TeamMemberMetrics } from "@/lib/team-overview-alerts";
import { formatCareerProgramLabel, formatCareerTrackLabel } from "@/lib/career/evaluate-career-progress";
import {
  completenessToPercent,
  readinessPercentFromRequirements,
} from "@/lib/team-overview-structure-classification";

const STATUS_ROWS = [
  "Na dobré cestě",
  "Potřebuje pozornost",
  "Vyžaduje doplnění",
  "Částečně vyhodnoceno",
  "Bez dostatku dat",
] as const;

const STATUS_STYLES: Record<string, string> = {
  "Na dobré cestě": "text-emerald-700",
  "Potřebuje pozornost": "text-amber-700 font-semibold",
  "Vyžaduje doplnění": "text-violet-700",
  "Částečně vyhodnoceno": "text-blue-700",
  "Bez dostatku dat": "text-slate-500",
};

/** Součty pro horní tři karty — vzájemně disjunktní kubky podle progressEvaluation / completeness. */
export function computeCareerStatBuckets(metrics: TeamMemberMetrics[]) {
  let readyToAdvance = 0;
  let pendingReview = 0;
  let blocked = 0;
  for (const m of metrics) {
    const pe = m.careerEvaluation.progressEvaluation;
    const ec = m.careerEvaluation.evaluationCompleteness;
    if (pe === "blocked") {
      blocked += 1;
    } else if (pe === "promoted_ready" || pe === "close_to_promotion") {
      readyToAdvance += 1;
    } else if (ec === "manual_required") {
      pendingReview += 1;
    }
  }
  return { readyToAdvance, pendingReview, blocked };
}

export function TeamOverviewCareerSummarySection({
  members,
  metrics,
  pageModel,
  displayName,
  selectMember,
  onOpenCrm,
  onOpenProgress,
  periodLabel,
  scopeLabel,
  selectedUserId = null,
}: {
  members: TeamMemberInfo[];
  metrics: TeamMemberMetrics[];
  pageModel: TeamOverviewPageModel;
  displayName: (m: TeamMemberInfo) => string;
  selectMember: (userId: string) => void;
  onOpenCrm: (userId: string) => void;
  onOpenProgress: (userId: string) => void;
  periodLabel?: string;
  scopeLabel?: string;
  selectedUserId?: string | null;
}) {
  if (members.length === 0) return null;

  const hasTracks = pageModel.careerTeamSummary.byTrack.length > 0;
  const metricsByUser = new Map(metrics.map((x) => [x.userId, x]));
  const statBuckets = computeCareerStatBuckets(metrics);

  return (
    <section
      className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]"
      aria-labelledby="team-career-growth-heading"
    >
      {/* Header */}
      <div className="border-b border-slate-100 px-7 py-5">
        {(periodLabel || scopeLabel) ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
            {periodLabel ? <span>{periodLabel}</span> : null}
            {periodLabel && scopeLabel ? <span>·</span> : null}
            {scopeLabel ? <span>{scopeLabel}</span> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="team-career-growth-heading"
              className="flex items-center gap-2 text-[22px] font-black tracking-tight text-slate-950"
            >
              <Briefcase className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
              Kariérní přehled
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              {hasTracks
                ? `${pageModel.careerTeamSummary.byTrack.reduce((s, t) => s + t.count, 0)} lidí v kariérních větvích`
                : "Doplňte kariérní větve pro detailnější přehled."}
            </p>
          </div>
          <Link
            href="/portal/team-overview#sprava-tymu"
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600 transition hover:text-violet-800 hover:underline"
          >
            Správa kariéry
          </Link>
        </div>
      </div>

      {/* 3 stat cards — jednotná výška karet */}
      <div className="grid grid-cols-1 gap-4 border-b border-slate-100 px-7 py-5 sm:grid-cols-3">
        <div className="flex min-h-[112px] flex-col justify-between rounded-[20px] border border-emerald-200/70 bg-emerald-50/60 px-5 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-emerald-700/80">Připraveno k posunu</p>
          <p className="mt-2 text-[30px] font-black leading-none tabular-nums text-emerald-900">{statBuckets.readyToAdvance}</p>
        </div>
        <div className="flex min-h-[112px] flex-col justify-between rounded-[20px] border border-amber-200/70 bg-amber-50/60 px-5 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-800/80">Ke schválení</p>
          <p className="mt-2 text-[30px] font-black leading-none tabular-nums text-amber-950">{statBuckets.pendingReview}</p>
        </div>
        <div className="flex min-h-[112px] flex-col justify-between rounded-[20px] border border-rose-200/70 bg-rose-50/60 px-5 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-rose-800/80">Blokováno</p>
          <p className="mt-2 text-[30px] font-black leading-none tabular-nums text-rose-950">{statBuckets.blocked}</p>
        </div>
      </div>

      {/* Career table — jedna plocha se staty výše */}
      <div className="overflow-x-auto border-t border-slate-100/90 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
            <tr>
              <th className="border-b border-slate-100 px-7 py-3.5">Poradce</th>
              <th className="border-b border-slate-100 px-4 py-3.5">Kariérní krok</th>
              <th className="border-b border-slate-100 px-4 py-3.5">Plnění</th>
              <th className="border-b border-slate-100 px-4 py-3.5">Status</th>
              <th className="border-b border-slate-100 px-7 py-3.5 text-right">Akce</th>
            </tr>
          </thead>
          <tbody>
            {members.map((mem) => {
              const mm = metricsByUser.get(mem.userId);
              if (!mm) return null;
              const ce = mm.careerEvaluation;
              const readiness = Math.max(
                completenessToPercent(ce.evaluationCompleteness),
                readinessPercentFromRequirements(ce.missingRequirements)
              );
              const isRowSelected = selectedUserId === mem.userId;
              return (
                <tr
                  key={mem.userId}
                  className={`cursor-pointer transition ${isRowSelected ? "bg-slate-50" : "hover:bg-slate-50/60"}`}
                  onClick={() => selectMember(mem.userId)}
                >
                  <td
                    className={`border-b border-slate-100/80 px-7 py-4 font-extrabold ${isRowSelected ? "text-[#16192b]" : "text-slate-950"}`}
                  >
                    {displayName(mem)}
                  </td>
                  <td className="border-b border-slate-100/80 px-4 py-4">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                      <span className="rounded-[8px] bg-slate-100 px-2.5 py-1 text-slate-700">
                        {ce.careerPositionLabel ?? "—"}
                      </span>
                      <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" aria-hidden />
                      <span className="text-[#16192b]">{ce.nextCareerPositionLabel ?? "—"}</span>
                    </div>
                  </td>
                  <td className="border-b border-slate-100/80 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-full max-w-[80px] overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${readiness === 100 ? "bg-emerald-500" : "bg-[#16192b]"}`}
                          style={{ width: `${readiness}%` }}
                        />
                      </div>
                      <span className="text-[12px] font-black text-slate-900 tabular-nums">{readiness}%</span>
                    </div>
                  </td>
                  <td className="border-b border-slate-100/80 px-4 py-4">
                    {ce.missingRequirements[0]?.labelCs ? (
                      <span className="inline-flex items-center rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-extrabold text-rose-600">
                        {ce.missingRequirements[0].labelCs}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-extrabold text-emerald-700">
                        Připraveno k posunu
                      </span>
                    )}
                  </td>
                  <td className="border-b border-slate-100/80 px-7 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenProgress(mem.userId);
                          selectMember(mem.userId);
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-[10px] bg-slate-100 px-3.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#16192b] transition hover:bg-slate-200"
                      >
                        Progres
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCrm(mem.userId);
                          selectMember(mem.userId);
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white px-3.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-50"
                      >
                        CRM
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom details grid — stejná sekce jako tabulka */}
      <div className="grid gap-6 border-t border-slate-100 bg-slate-50/40 px-7 py-7 lg:grid-cols-3">
        {/* Větve */}
        <div className="space-y-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Podle větve</p>
          {!hasTracks ? (
            <p className="text-xs leading-relaxed text-slate-500">
              Bez rozlišených větví — doplněním zpřesníte doporučení.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {pageModel.careerTeamSummary.byTrack.map((t) => (
                <li key={t.trackId} className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-500">{t.label}</span>
                  <span className="shrink-0 rounded-full bg-violet-100/80 px-2 py-0.5 text-[11px] font-bold tabular-nums text-violet-900">
                    {t.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-1.5 rounded-[16px] border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs">
            <p className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Chybí data</span>
              <span className="font-semibold tabular-nums text-slate-900">{pageModel.careerTeamSummary.needsAttentionDataCount}</span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Ruční ověření</span>
              <span className="font-semibold tabular-nums text-slate-900">{pageModel.careerTeamSummary.manualOrPartialCount}</span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span className="text-slate-500">V adaptaci</span>
              <span className="font-semibold tabular-nums text-slate-900">{pageModel.careerTeamSummary.startersInAdaptationCount}</span>
            </p>
          </div>
        </div>

        {/* Stav evaluace */}
        <div className="space-y-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Stav evaluace</p>
          <ul className="space-y-1.5">
            {STATUS_ROWS.map((label) => {
              const c = pageModel.careerTeamSummary.byManagerLabel[label] ?? 0;
              if (c === 0) return null;
              return (
                <li key={label} className="flex items-center justify-between gap-2 text-xs">
                  <span className={STATUS_STYLES[label] ?? "text-slate-500"}>{label}</span>
                  <span className="font-semibold tabular-nums text-slate-900">{c}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Doporučená 1:1 */}
        <div className="space-y-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Doporučená 1:1</p>
          {pageModel.careerTeamSummary.topAttention.length === 0 ? (
            <div className="rounded-[16px] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
              <p className="text-[13px] font-bold text-slate-900">Na dobré cestě</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Z kariérního pohledu nikdo nezasahuje.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pageModel.careerTeamSummary.topAttention.map((x) => {
                const mem = members.find((m) => m.userId === x.userId);
                const name = mem ? displayName(mem) : x.displayName || x.email || "Člen týmu";
                return (
                  <li key={x.userId}>
                    <button
                      type="button"
                      onClick={() => selectMember(x.userId)}
                      className="group block w-full rounded-[16px] border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-left transition hover:border-violet-200 hover:bg-violet-50/60"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-extrabold text-slate-900">{name}</p>
                        <ChevronRight className="ml-auto h-3 w-3 text-violet-400 opacity-0 transition group-hover:opacity-100" aria-hidden />
                      </div>
                      <p className="mt-0.5 text-[11px] font-bold text-violet-700">{x.managerProgressLabel}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{x.reason}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {!hasTracks && members.length > 0 ? (
        <div className="border-t border-slate-100 bg-amber-50/35 px-7 py-4">
          <div className="rounded-[14px] border border-amber-200/50 bg-amber-50/50 px-4 py-3">
            <p className="text-xs text-amber-900/90">
              <span className="font-semibold">Příležitost:</span> bez vyplněných kariérních větví zůstávají souhrny obecnější.{" "}
              <Link href="/portal/team-overview#sprava-tymu" className="font-semibold underline hover:text-amber-800">
                Doplnit v Správa týmu →
              </Link>
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
