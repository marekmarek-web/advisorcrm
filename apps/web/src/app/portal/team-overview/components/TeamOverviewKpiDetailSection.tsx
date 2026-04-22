"use client";

import Link from "next/link";
import {
  Users,
  TrendingUp,
  Calendar,
  UserPlus,
  AlertTriangle,
  Target,
} from "lucide-react";
import type { TeamOverviewKpis } from "@/app/actions/team-overview";
import type { TeamMemberMetrics } from "@/lib/team-overview-alerts";
import type { TeamMemberInfo } from "@/app/actions/team-overview";
import { formatTeamOverviewProduction } from "@/lib/team-overview-format";
import { SkeletonBlock } from "@/app/components/Skeleton";
import { TeamOverviewTrendIndicator } from "./TeamOverviewTrendIndicator";

const KPI_THEMES = {
  green: { bg: "bg-emerald-500/20", glow: "bg-emerald-500", subtitle: "text-emerald-600" },
  blue: { bg: "bg-blue-500/20", glow: "bg-blue-500", subtitle: "text-blue-600" },
  purple: { bg: "bg-violet-500/20", glow: "bg-violet-500", subtitle: "text-violet-600" },
  amber: { bg: "bg-amber-500/20", glow: "bg-amber-500", subtitle: "text-amber-600" },
  rose: { bg: "bg-rose-500/20", glow: "bg-rose-500", subtitle: "text-rose-600" },
} as const;

export function TeamOverviewKpiDetailSection({
  loading,
  kpis,
  members,
  topMetric,
  bottomMetric,
}: {
  loading: boolean;
  kpis: TeamOverviewKpis | null;
  members: TeamMemberInfo[];
  topMetric: TeamMemberMetrics | null;
  bottomMetric: TeamMemberMetrics | null;
}) {
  const topPerformerName = topMetric ? (members.find((m) => m.userId === topMetric.userId)?.displayName || "Člen týmu") : "—";
  const supportName = bottomMetric
    ? (members.find((m) => m.userId === bottomMetric.userId)?.displayName || "Člen týmu")
    : "—";

  return (
    <section
      className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)]/80 bg-white p-4 shadow-sm"
      aria-labelledby="team-kpi-detail-heading"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="team-kpi-detail-heading" className="text-lg font-black tracking-tight text-[color:var(--wp-text)]">
            Výkon a funnel
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--wp-text-secondary)]">
            CRM metriky za zvolené období.
          </p>
        </div>
        {kpis ? (
          <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">
            Období: <span className="font-semibold text-[color:var(--wp-text)]">{kpis.periodLabel}</span>
          </p>
        ) : null}
      </div>
      {loading && !kpis ? (
        <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.4fr)_minmax(248px,0.8fr)]">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonBlock key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <SkeletonBlock key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : kpis ? (
        <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.4fr)_minmax(248px,0.8fr)]">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="#lide-v-tymu"
            className="group rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)]/35 p-4 shadow-sm transition hover:border-[color:var(--wp-surface-card-border)] hover:bg-white"
          >
            <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.blue.bg}`}>
              <Users className={`h-5 w-5 ${KPI_THEMES.blue.subtitle}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.memberCount}</p>
            <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Lidé ve scope</p>
          </Link>
          <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)]/35 p-4 shadow-sm">
            <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.green.bg}`}>
              <TrendingUp className={`h-5 w-5 ${KPI_THEMES.green.subtitle}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.unitsThisPeriod}</p>
            <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Jednotky</p>
            <div className="mt-1">
              <TeamOverviewTrendIndicator trend={kpis.unitsTrend} />
            </div>
          </div>
          <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)]/35 p-4 shadow-sm">
            <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.purple.bg}`}>
              <TrendingUp className={`h-5 w-5 ${KPI_THEMES.purple.subtitle}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">
              {formatTeamOverviewProduction(kpis.productionThisPeriod)}
            </p>
            <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Produkce</p>
            <div className="mt-1">
              <TeamOverviewTrendIndicator trend={Math.round(kpis.productionTrend)} />
            </div>
          </div>
          <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)]/35 p-4 shadow-sm">
            <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.green.bg}`}>
              <Calendar className={`h-5 w-5 ${KPI_THEMES.green.subtitle}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.meetingsThisWeek}</p>
            <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Schůzky tento týden</p>
          </div>
          <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)]/35 p-4 shadow-sm">
            <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.amber.bg}`}>
              <UserPlus className={`h-5 w-5 ${KPI_THEMES.amber.subtitle}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.newcomersInAdaptation}</p>
            <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Nováčci v adaptaci</p>
          </div>
          <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)]/35 p-4 shadow-sm">
            <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.rose.bg}`}>
              <AlertTriangle className={`h-5 w-5 ${KPI_THEMES.rose.subtitle}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.riskyMemberCount}</p>
            <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Vyžaduje pozornost</p>
          </div>
          </div>
          <div className="space-y-2.5">
            <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)] p-4 shadow-sm">
              <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Hodnota obchodů</p>
              <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">
                {formatTeamOverviewProduction(Math.round(kpis.pipelineValue))}
              </p>
              <p className="mt-1 text-xs font-medium text-[color:var(--wp-text-secondary)]">
                Konverze: {Math.round(kpis.conversionRate * 100)} %
              </p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)] p-4 shadow-sm">
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Top performer</p>
                <p className="mt-2 text-base font-bold text-[color:var(--wp-text)]">{topPerformerName}</p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">
                  {topMetric ? formatTeamOverviewProduction(topMetric.productionThisPeriod) : "—"}
                </p>
              </div>
              <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)] p-4 shadow-sm">
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Podpora ve výkonu</p>
                <p className="mt-2 text-base font-bold text-[color:var(--wp-text)]">{supportName}</p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">
                  {bottomMetric ? formatTeamOverviewProduction(bottomMetric.productionThisPeriod) : "—"}
                </p>
              </div>
            </div>
            {kpis.teamGoalTarget != null && kpis.teamGoalType && (
              <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)] p-4 shadow-sm">
                <div className="inline-flex rounded-xl bg-indigo-500/20 p-2">
                  <Target className="h-5 w-5 text-indigo-600" />
                </div>
                <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">
                  {kpis.teamGoalProgressPercent != null ? `${kpis.teamGoalProgressPercent} %` : "—"}
                </p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Splnění týmového cíle</p>
                <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                  {kpis.teamGoalActual != null ? formatTeamOverviewProduction(kpis.teamGoalActual) : "0"} /{" "}
                  {formatTeamOverviewProduction(kpis.teamGoalTarget)}
                  {kpis.teamGoalType === "units" && " jednotek"}
                  {kpis.teamGoalType === "production" && " produkce"}
                  {kpis.teamGoalType === "meetings" && " schůzek"}
                </p>
                {kpis.teamGoalProgressPercent != null && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--wp-surface-muted)]/80">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${Math.min(kpis.teamGoalProgressPercent, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
