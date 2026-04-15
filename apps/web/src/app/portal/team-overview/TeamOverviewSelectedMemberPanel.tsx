"use client";

import Link from "next/link";
import clsx from "clsx";
import { X, Calendar, CheckSquare, Layers3, FileText, ExternalLink } from "lucide-react";
import type { TeamMemberDetail } from "@/app/actions/team-overview";
import { formatCareerProgramLabel, formatCareerTrackLabel } from "@/lib/career/evaluate-career-progress";
import { careerProgressShortLabel } from "@/lib/career/career-ui-labels";
import { buildTeamMemberCoachingSummaryBullets } from "@/lib/team-member-coaching-bullets";
import { crmUnitsFootnoteForProgram } from "@/lib/career/crm-units-copy";
import { SkeletonBlock } from "@/app/components/Skeleton";
import { formatTeamOverviewProduction, poolProgramLabel } from "@/lib/team-overview-format";
import type { TeamMemberMetrics } from "@/lib/team-overview-alerts";
import type { CareerProgramId } from "@/lib/career/types";

function poolLine(programId: CareerProgramId): string {
  if (programId === "beplan" || programId === "premium_brokers") return poolProgramLabel(programId);
  return formatCareerProgramLabel(programId);
}

const PANEL_CLASS =
  "h-full min-h-0 overflow-hidden rounded-[28px] border border-slate-800 bg-[#16192b] text-white shadow-[0_20px_48px_rgba(0,0,0,0.18)]";

export function TeamOverviewSelectedMemberPanel({
  detail,
  loading,
  fullDetailHref: fullDetailHrefProp,
  onClose,
  canCreateTeamCalendar: _canCreateTeamCalendar,
  canEditTeamCareer: _canEditTeamCareer,
  outsideFilter = false,
  /** variant prop kept for call-site compatibility — always renders dark panel. */
  variant: _variant = "premium",
  selectedUserId = null,
  metricsSnapshot = null,
  onOpenCrm,
  onOpenProgress,
  onOpenCheckIn: _onOpenCheckIn,
  onOpenOneToOne,
  onOpenTask,
}: {
  detail: TeamMemberDetail | null;
  loading: boolean;
  /** Volitelný odkaz na legacy stránku detailu — v Team Overview se nepredvyplňuje, aby byl hlavní průvodce pravý panel. */
  fullDetailHref?: string | null;
  onClose: () => void;
  canCreateTeamCalendar: boolean;
  canEditTeamCareer: boolean;
  outsideFilter?: boolean;
  variant?: "default" | "premium";
  selectedUserId?: string | null;
  metricsSnapshot?: TeamMemberMetrics | null;
  onOpenCrm?: () => void;
  onOpenProgress?: () => void;
  onOpenCheckIn?: () => void;
  onOpenOneToOne?: () => void;
  onOpenTask?: () => void;
}) {
  const fullDetailHref = fullDetailHrefProp?.trim() ? fullDetailHrefProp : null;

  if (loading) {
    return (
      <aside
        className={clsx(PANEL_CLASS, "flex flex-col p-7")}
        aria-busy="true"
        aria-label="Načítání detailu člena"
      >
        <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" aria-hidden />
        <div className="space-y-4">
          <SkeletonBlock className="h-4 w-2/5 rounded-lg bg-white/10" />
          <SkeletonBlock className="h-8 w-4/5 rounded-xl bg-white/10" />
          <SkeletonBlock className="h-28 rounded-[18px] bg-white/[0.06]" />
          <SkeletonBlock className="h-24 rounded-[18px] bg-white/[0.06]" />
          <SkeletonBlock className="h-20 rounded-[18px] bg-white/[0.06]" />
        </div>
      </aside>
    );
  }

  if (!detail) {
    if (selectedUserId) {
      return (
        <aside className={clsx(PANEL_CLASS, "flex flex-col justify-between p-7 text-sm")} role="alert">
          <div>
            <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" aria-hidden />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">Stav načtení</p>
            <p className="mt-3 text-[18px] font-black tracking-tight text-white">Souhrn se nepodařilo načíst</p>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
              Zkuste znovu načíst data tlačítkem Obnovit v hlavičce.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
            {fullDetailHref ? (
              <Link
                href={fullDetailHref}
                className="inline-flex items-center gap-1.5 rounded-[12px] bg-white/10 px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
              >
                Starý detail (záloha)
                <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-semibold text-slate-400 underline transition hover:text-white"
            >
              Zrušit výběr
            </button>
          </div>
        </aside>
      );
    }

    return (
      <aside className={clsx(PANEL_CLASS, "flex flex-col")}>
        <div className="flex flex-1 flex-col justify-center px-7 py-10">
          <div className="mb-6 h-px w-full bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden />
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-slate-500">Souhrn člena</p>
          <h2 className="mt-4 text-[22px] font-black leading-tight tracking-tight text-white">Vyberte člena týmu</h2>
          <p className="mt-3 max-w-[22rem] text-[14px] leading-relaxed text-slate-300">
            Klikněte na řádek v <span className="font-semibold text-white/95">Lidé</span> nebo{" "}
            <span className="font-semibold text-white/95">Kariéra</span>, na uzel ve{" "}
            <span className="font-semibold text-white/95">Struktuře</span>, nebo na jméno v přehledu pozornosti či cadence.
          </p>
          <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
            V tomto panelu se zobrazí kariéra, plnění cíle, coaching a akce 1:1 / CRM — ve stejném rytmu ve všech záložkách
            přehledu.
          </p>
        </div>
        <div className="border-t border-white/10 px-7 py-4 text-center">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-600">Žádný výběr</p>
        </div>
      </aside>
    );
  }

  const name = detail.displayName || "Člen týmu";
  const m = detail.metrics ?? metricsSnapshot;
  const ce = detail.careerEvaluation;
  const coachingBullets = buildTeamMemberCoachingSummaryBullets(detail);
  const progressValue = Math.max(0, Math.min(100, m?.targetProgressPercent ?? 0));
  const readinessLabel =
    ce.missingRequirements.length > 0
      ? `Blokace: ${ce.missingRequirements[0].labelCs}`
      : "Všechny podmínky pro postup splněny";
  const hasModalActions = onOpenCrm || onOpenProgress || onOpenOneToOne || onOpenTask;

  const actionBtnClass =
    "flex min-h-[60px] flex-col items-start justify-between gap-1 rounded-[14px] border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 active:bg-white/15";

  return (
    <aside
      className={clsx(
        PANEL_CLASS,
        "flex max-h-[min(90vh,calc(100vh-4rem))] flex-col overscroll-contain"
      )}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 px-7 pb-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-slate-500">Vybraný člen</p>
            <h2 className="mt-2 text-[24px] font-black leading-none tracking-tight text-white">{name}</h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="rounded-[8px] border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white">
                {detail.roleName}
              </span>
              {detail.adaptation ? (
                <span className="rounded-[8px] border border-sky-500/20 bg-sky-500/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-sky-300">
                  V adaptaci
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 rounded-full bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Zavřít výběr"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {fullDetailHref ? (
          <Link
            href={fullDetailHref}
            className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500 transition hover:text-white"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            Starý detail (záloha)
          </Link>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-7 pb-8 pt-4">
        {outsideFilter && (
          <div
            className="rounded-[12px] border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-[11px] text-amber-200"
            role="status"
          >
            Člen není v aktuálním filtru — souhrn je platný.
          </div>
        )}

        {/* Career info */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[14px] border border-white/5 bg-white/5 px-4 py-3">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Skupina</div>
            <div className="mt-1.5 text-[13px] font-extrabold leading-snug text-white">{poolLine(ce.careerProgramId)}</div>
            <div className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">
              {careerProgressShortLabel(ce.progressEvaluation)}
            </div>
          </div>
          <div className="rounded-[14px] border border-white/5 bg-white/5 px-4 py-3">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Větev / pozice</div>
            <div className="mt-1.5 text-[13px] font-extrabold leading-snug text-white">{formatCareerTrackLabel(ce.careerTrackId)}</div>
            <div className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
              {ce.careerPositionLabel ?? "—"}
            </div>
          </div>
        </div>

        {/* Production */}
        {m ? (
          <section className="rounded-[14px] border border-white/5 bg-white/5 p-4">
            <div className="flex items-end justify-between gap-3">
              <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Plnění cíle</span>
              <span className="text-[18px] font-black text-white tabular-nums">
                {formatTeamOverviewProduction(m.productionThisPeriod)}
                {m.targetProgressPercent != null ? (
                  <span className="ml-1 text-[11px] font-bold text-slate-500">/ {m.targetProgressPercent}%</span>
                ) : null}
              </span>
            </div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-700">
              <div
                className={clsx("h-full rounded-full transition-all", progressValue >= 100 ? "bg-emerald-500" : "bg-amber-400")}
                style={{ width: `${progressValue}%` }}
              />
            </div>
            <div className="mt-2 text-[10px] font-bold text-slate-500">
              {m.meetingsThisPeriod} schůzek evidováno
            </div>
          </section>
        ) : null}

        {/* Next career step */}
        <section className="border-t border-white/10 pt-4">
          <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-violet-400">
            Další krok: {ce.nextCareerPositionLabel ?? "—"}
          </div>
          <div
            className={clsx(
              "rounded-[12px] border px-3.5 py-3 text-[11px] font-bold",
              ce.missingRequirements.length > 0
                ? "border-red-500/20 bg-red-500/10 text-red-300"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            )}
          >
            {readinessLabel}
          </div>
          <div className="mt-2 text-[11px] font-bold text-slate-500">
            Poslední kontakt:{" "}
            <span className="text-white">
              {m?.daysSinceMeeting != null ? `před ${m.daysSinceMeeting} dny` : "Bez kontaktu"}
            </span>
          </div>
        </section>

        {/* Adaptation */}
        {detail.adaptation ? (
          <section className="rounded-[14px] border border-white/5 bg-white/5 p-4">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Adaptace</div>
            <div className="mt-1.5 text-[13px] font-extrabold text-white">
              {detail.adaptation.adaptationStatus} · {detail.adaptation.adaptationScore} %
            </div>
          </section>
        ) : null}

        {/* Coaching */}
        <section>
          <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Coaching a 1:1</div>
          <div className="rounded-[14px] border border-white/5 bg-white/5 p-4">
            <p className="text-[13px] font-extrabold leading-snug text-white">
              {detail.careerCoaching.suggestedNextStepLine}
            </p>
            <p className="mt-1.5 text-[11px] font-bold text-violet-300">
              {detail.careerCoaching.recommendedActionLabelCs}
            </p>
            {detail.careerCoaching.oneOnOneAgenda.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-[11px] text-slate-300">
                {detail.careerCoaching.oneOnOneAgenda.slice(0, 4).map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                    {item.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        {coachingBullets.length > 0 ? (
          <section>
            <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Coaching summary</div>
            <ul className="space-y-1 text-[11px] text-slate-400">
              {coachingBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                  {b}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {m ? (
          <p className="text-[10px] leading-snug text-slate-600">
            {crmUnitsFootnoteForProgram(ce.careerProgramId)}
          </p>
        ) : null}

        {/* Modal actions */}
        {hasModalActions ? (
          <div className="grid grid-cols-2 gap-2.5 border-t border-white/10 pt-5">
            {onOpenOneToOne ? (
              <button type="button" onClick={onOpenOneToOne} className={actionBtnClass}>
                <Calendar className="h-4 w-4 text-white" aria-hidden />
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">1:1</span>
              </button>
            ) : null}
            {onOpenTask ? (
              <button type="button" onClick={onOpenTask} className={actionBtnClass}>
                <CheckSquare className="h-4 w-4 text-slate-300" aria-hidden />
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">Úkol</span>
              </button>
            ) : null}
            {onOpenProgress ? (
              <button type="button" onClick={onOpenProgress} className={actionBtnClass}>
                <Layers3 className="h-4 w-4 text-slate-300" aria-hidden />
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">Progres</span>
              </button>
            ) : null}
            {onOpenCrm ? (
              <button type="button" onClick={onOpenCrm} className={actionBtnClass}>
                <FileText className="h-4 w-4 text-slate-300" aria-hidden />
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">CRM karta</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
