"use client";

import Link from "next/link";
import { X, Briefcase, Target, ExternalLink } from "lucide-react";
import type { TeamMemberDetail } from "@/app/actions/team-overview";
import { formatCareerProgramLabel, formatCareerTrackLabel } from "@/lib/career/evaluate-career-progress";
import { careerCompletenessShortLabel, careerProgressShortLabel } from "@/lib/career/career-ui-labels";
import { buildTeamMemberCoachingSummaryBullets } from "@/lib/team-member-coaching-bullets";
import { crmUnitsFootnoteForProgram } from "@/lib/career/crm-units-copy";
import { SkeletonBlock } from "@/app/components/Skeleton";
import { MemberCareerQuickActions } from "@/app/portal/team-overview/[userId]/MemberCareerQuickActions";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("cs-CZ");
}

export function TeamOverviewSelectedMemberPanel({
  detail,
  loading,
  fullDetailHref,
  onClose,
  canCreateTeamCalendar,
  canEditTeamCareer,
}: {
  detail: TeamMemberDetail | null;
  loading: boolean;
  fullDetailHref: string;
  onClose: () => void;
  canCreateTeamCalendar: boolean;
  canEditTeamCareer: boolean;
}) {
  if (loading) {
    return (
      <aside
        className="xl:sticky xl:top-6 space-y-4 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm h-fit"
        aria-busy="true"
        aria-label="Načítání detailu člena"
      >
        <SkeletonBlock className="h-8 w-3/4 rounded-lg" />
        <SkeletonBlock className="h-24 rounded-xl" />
        <SkeletonBlock className="h-32 rounded-xl" />
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="xl:sticky xl:top-6 rounded-2xl border border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/30 p-5 text-sm text-[color:var(--wp-text-secondary)] h-fit">
        <p className="font-medium text-[color:var(--wp-text)]">Vyberte člena</p>
        <p className="mt-2 text-xs leading-relaxed">
          Klikněte na jméno ve struktuře týmu nebo v tabulce — zobrazí se souhrn z týchž dat jako na stránce detailu (serverové akce Team Overview).
        </p>
      </aside>
    );
  }

  const name = detail.displayName || "Člen týmu";
  const m = detail.metrics;
  const ce = detail.careerEvaluation;
  const coachingBullets = buildTeamMemberCoachingSummaryBullets(detail);

  return (
    <aside className="xl:sticky xl:top-6 space-y-4 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm h-fit max-h-[min(85vh,calc(100vh-4rem))] overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[color:var(--wp-text)] leading-tight">{name}</h2>
          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">
            {detail.roleName}
            {detail.email ? ` · ${detail.email}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-2 text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)]"
          aria-label="Zavřít výběr"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Link
        href={fullDetailHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
      >
        Plný detail člena
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </Link>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-2 flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-violet-500" />
          Kariéra (stejný evaluator jako detail)
        </h3>
        <div className="rounded-xl border border-violet-200/60 bg-violet-50/40 p-3 text-xs space-y-2">
          <p>
            <span className="text-[color:var(--wp-text-tertiary)]">Program:</span>{" "}
            <strong className="text-[color:var(--wp-text)]">{formatCareerProgramLabel(ce.careerProgramId)}</strong>
          </p>
          <p>
            <span className="text-[color:var(--wp-text-tertiary)]">Větev:</span>{" "}
            {formatCareerTrackLabel(ce.careerTrackId)}
          </p>
          {ce.careerPositionLabel ? (
            <p>
              <span className="text-[color:var(--wp-text-tertiary)]">Pozice:</span> {ce.careerPositionLabel}
            </p>
          ) : (
            <p className="text-[color:var(--wp-text-secondary)]">Pozice: chybí data nebo neodpovídá konfiguraci</p>
          )}
          <p className="flex flex-wrap gap-1">
            <span className="rounded-full bg-white/80 px-2 py-0.5 font-medium text-violet-900">
              {careerProgressShortLabel(ce.progressEvaluation)}
            </span>
            <span className="rounded-full border border-violet-200 px-2 py-0.5">{careerCompletenessShortLabel(ce.evaluationCompleteness)}</span>
          </p>
          {ce.nextCareerPositionLabel ? (
            <p className="text-[color:var(--wp-text-secondary)]">Další krok: {ce.nextCareerPositionLabel}</p>
          ) : null}
        </div>
      </section>

      {m ? (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-2">CRM (období)</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/30 p-2">
              <p className="tabular-nums font-semibold text-[color:var(--wp-text)]">{m.unitsThisPeriod}</p>
              <p className="text-[color:var(--wp-text-tertiary)]">Jednotky</p>
            </div>
            <div className="rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/30 p-2">
              <p className="tabular-nums font-semibold text-[color:var(--wp-text)]">{formatNumber(m.productionThisPeriod)}</p>
              <p className="text-[color:var(--wp-text-tertiary)]">Produkce</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-[color:var(--wp-text-tertiary)] leading-snug">{crmUnitsFootnoteForProgram(ce.careerProgramId)}</p>
        </section>
      ) : null}

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-2 flex items-center gap-2">
          <Target className="h-4 w-4 text-indigo-500" />
          Coaching a 1:1
        </h3>
        <p className="text-xs font-medium text-[color:var(--wp-text)]">{detail.careerCoaching.suggestedNextStepLine}</p>
        <p className="text-[11px] text-violet-900 font-medium mt-1">{detail.careerCoaching.recommendedActionLabelCs}</p>
        <ul className="mt-2 space-y-1.5 text-xs text-[color:var(--wp-text-secondary)]">
          {detail.careerCoaching.oneOnOneAgenda.slice(0, 4).map((item, i) => (
            <li key={i} className="leading-snug">
              {item.text}
            </li>
          ))}
        </ul>
        <MemberCareerQuickActions
          memberUserId={detail.userId}
          coaching={detail.careerCoaching}
          canCreateTeamCalendar={canCreateTeamCalendar}
          canEditTeamCareer={canEditTeamCareer}
        />
      </section>

      {coachingBullets.length > 0 ? (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-1">Shrnutí pro coaching</h3>
          <ul className="list-disc list-inside text-xs text-[color:var(--wp-text-secondary)] space-y-1">
            {coachingBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
