"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  UsersRound,
  TrendingUp,
  Calendar,
  AlertTriangle,
  UserPlus,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Check,
  X,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import type { TeamOverviewKpis, TeamMemberInfo, TeamMemberMetrics, TeamAlert, NewcomerAdaptation, TeamPerformancePoint } from "@/app/actions/team-overview";
import type { TeamOverviewPeriod } from "@/app/actions/team-overview";
import { getTeamOverviewKpis, getTeamMemberMetrics, getTeamAlerts, getNewcomerAdaptation, getTeamPerformanceOverTime } from "@/app/actions/team-overview";
import { SkeletonBlock } from "@/app/components/Skeleton";

const PERIOD_OPTIONS: { value: TeamOverviewPeriod; label: string }[] = [
  { value: "week", label: "Týden" },
  { value: "month", label: "Měsíc" },
  { value: "quarter", label: "Kvartál" },
];

const KPI_THEMES = {
  green: { bg: "bg-emerald-500/20", glow: "bg-emerald-500", subtitle: "text-emerald-600" },
  blue: { bg: "bg-blue-500/20", glow: "bg-blue-500", subtitle: "text-blue-600" },
  purple: { bg: "bg-violet-500/20", glow: "bg-violet-500", subtitle: "text-violet-600" },
  amber: { bg: "bg-amber-500/20", glow: "bg-amber-500", subtitle: "text-amber-600" },
  rose: { bg: "bg-rose-500/20", glow: "bg-rose-500", subtitle: "text-rose-600" },
} as const;

interface TeamOverviewViewProps {
  initialKpis: TeamOverviewKpis | null;
  initialMembers: TeamMemberInfo[];
  initialMetrics: TeamMemberMetrics[];
  initialAlerts: TeamAlert[];
  initialNewcomers: NewcomerAdaptation[];
  initialPerformanceOverTime: TeamPerformancePoint[];
  defaultPeriod: TeamOverviewPeriod;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("cs-CZ");
}

function TrendIndicator({ trend }: { trend: number }) {
  if (trend > 0) return <span className="inline-flex items-center text-emerald-600 text-xs font-medium"><ArrowUp className="w-3.5 h-3.5 mr-0.5" />+{trend}</span>;
  if (trend < 0) return <span className="inline-flex items-center text-rose-600 text-xs font-medium"><ArrowDown className="w-3.5 h-3.5 mr-0.5" />{trend}</span>;
  return <span className="inline-flex items-center text-slate-500 text-xs"><Minus className="w-3.5 h-3.5" /></span>;
}

export function TeamOverviewView({
  initialKpis,
  initialMembers,
  initialMetrics,
  initialAlerts,
  initialNewcomers,
  initialPerformanceOverTime,
  defaultPeriod,
}: TeamOverviewViewProps) {
  const [period, setPeriod] = useState<TeamOverviewPeriod>(defaultPeriod);
  const [kpis, setKpis] = useState<TeamOverviewKpis | null>(initialKpis);
  const [metrics, setMetrics] = useState<TeamMemberMetrics[]>(initialMetrics);
  const [alerts, setAlerts] = useState<TeamAlert[]>(initialAlerts);
  const [newcomers, setNewcomers] = useState<NewcomerAdaptation[]>(initialNewcomers);
  const [performanceOverTime, setPerformanceOverTime] = useState<TeamPerformancePoint[]>(initialPerformanceOverTime);
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [k, m, a, n, perf] = await Promise.all([
        getTeamOverviewKpis(period),
        getTeamMemberMetrics(period),
        getTeamAlerts(period),
        getNewcomerAdaptation(),
        getTeamPerformanceOverTime(period),
      ]);
      setKpis(k ?? null);
      setMetrics(m);
      setAlerts(a);
      setNewcomers(n);
      setPerformanceOverTime(perf);
    } finally {
      setLoading(false);
    }
  }, [period]);

  const loadAiSummary = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/ai/team-summary?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data.summary ?? null);
      }
    } finally {
      setAiLoading(false);
    }
  }, [period]);

  const memberCount = initialMembers.length;
  const metricsByUser = new Map(metrics.map((m) => [m.userId, m]));
  const displayName = (m: TeamMemberInfo) => m.displayName || "Člen týmu";

  return (
    <div className="min-h-screen bg-[var(--wp-bg)]">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Týmový přehled</h1>
            <p className="mt-1 text-sm text-slate-500">Výkon týmu, aktivita a adaptace nováčků na jednom místě.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <UsersRound className="w-3.5 h-3.5" />
                {memberCount} {memberCount === 1 ? "člen" : memberCount < 5 ? "členové" : "členů"} týmu
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as TeamOverviewPeriod)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              aria-label="Obnovit data"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <section className="mb-8">
          <h2 className="sr-only">Klíčové ukazatele</h2>
          {loading && !kpis ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonBlock key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : kpis ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="#clenove" className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-slate-200">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.blue.bg}`}>
                  <Users className={`w-5 h-5 ${KPI_THEMES.blue.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{kpis.memberCount}</p>
                <p className="text-xs font-medium text-slate-500">Členové týmu</p>
              </Link>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.green.bg}`}>
                  <TrendingUp className={`w-5 h-5 ${KPI_THEMES.green.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{kpis.unitsThisPeriod}</p>
                <p className="text-xs font-medium text-slate-500">Jednotky ({kpis.periodLabel})</p>
                <div className="mt-1"><TrendIndicator trend={kpis.unitsTrend} /></div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.purple.bg}`}>
                  <TrendingUp className={`w-5 h-5 ${KPI_THEMES.purple.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{formatNumber(kpis.productionThisPeriod)}</p>
                <p className="text-xs font-medium text-slate-500">Produkce ({kpis.periodLabel})</p>
                <div className="mt-1"><TrendIndicator trend={Math.round(kpis.productionTrend)} /></div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.green.bg}`}>
                  <Calendar className={`w-5 h-5 ${KPI_THEMES.green.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{kpis.meetingsThisWeek}</p>
                <p className="text-xs font-medium text-slate-500">Schůzky tento týden</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.amber.bg}`}>
                  <UserPlus className={`w-5 h-5 ${KPI_THEMES.amber.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{kpis.newcomersInAdaptation}</p>
                <p className="text-xs font-medium text-slate-500">Nováčci v adaptaci</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.rose.bg}`}>
                  <AlertTriangle className={`w-5 h-5 ${KPI_THEMES.rose.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{kpis.riskyMemberCount}</p>
                <p className="text-xs font-medium text-slate-500">Rizikoví členové</p>
              </div>
            </div>
          ) : null}
        </section>

        {/* Výkon v čase */}
        {performanceOverTime.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Výkon v čase</h2>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex gap-2 items-end justify-between h-32" aria-label="Graf jednotek po obdobích">
                {performanceOverTime.map((p, i) => {
                  const maxUnits = Math.max(...performanceOverTime.map((x) => x.units), 1);
                  const heightPct = maxUnits > 0 ? (p.units / maxUnits) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-full flex flex-col justify-end h-20 rounded-t bg-slate-100 overflow-hidden">
                        <div
                          className="w-full bg-indigo-500 rounded-t transition-all"
                          style={{ height: `${heightPct}%`, minHeight: p.units > 0 ? "4px" : 0 }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-slate-500 truncate w-full text-center" title={p.label}>{p.label}</span>
                      <span className="text-xs font-semibold text-slate-700">{p.units}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* AI summary */}
        <section className="mb-8">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" />
                AI shrnutí týmu
              </h2>
              <button
                type="button"
                onClick={loadAiSummary}
                disabled={aiLoading}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Generovat shrnutí"}
              </button>
            </div>
            {aiSummary ? (
              <p className="text-slate-700 whitespace-pre-wrap">{aiSummary}</p>
            ) : (
              <p className="text-slate-500 text-sm">Klikněte na „Generovat shrnutí“, aby AI na základě metrik a upozornění vytvořilo manažerské shrnutí.</p>
            )}
          </div>
        </section>

        {/* Rizika */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Rizika a upozornění</h2>
          {alerts.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-slate-500">
              Žádná aktivní upozornění.
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Link
                    href={`/portal/team-overview/${a.memberId}`}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm hover:border-amber-200 hover:bg-amber-50/50 transition"
                  >
                    <span className={`rounded-full p-1 ${a.severity === "critical" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"}`}>
                      <AlertTriangle className="w-4 h-4" />
                    </span>
                    <span className="font-medium text-slate-900">{a.title}</span>
                    <span className="text-slate-500 text-sm">{a.description}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 ml-auto" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Adaptace nováčků */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Adaptace nováčků</h2>
          {newcomers.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-slate-500">
              Momentálně žádní nováčci v adaptačním období.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {newcomers.map((n) => {
                const member = initialMembers.find((m) => m.userId === n.userId);
                const name = member ? displayName(member) : "Člen týmu";
                return (
                  <Link
                    key={n.userId}
                    href={`/portal/team-overview/${n.userId}`}
                    className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{name}</p>
                        <p className="text-xs text-slate-500">{n.daysInTeam} dní v týmu · {n.adaptationStatus}</p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{n.adaptationScore} %</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {n.checklist.map((s) => (
                        <span key={s.key} className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${s.completed ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`} title={s.label}>
                          {s.completed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        </span>
                      ))}
                    </div>
                    {n.warnings.length > 0 && (
                      <p className="mt-2 text-xs text-amber-600">{n.warnings.join(" · ")}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Seznam členů */}
        <section id="clenove">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Členové týmu</h2>
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Člen</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Jednotky</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Produkce</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Schůzky</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aktivita</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Stav</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {initialMembers.map((m) => {
                    const met = metricsByUser.get(m.userId);
                    return (
                      <tr key={m.userId} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <Link href={`/portal/team-overview/${m.userId}`} className="font-medium text-slate-900 hover:underline">
                            {displayName(m)}
                          </Link>
                          <p className="text-xs text-slate-500">{m.roleName}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{met?.unitsThisPeriod ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{met ? formatNumber(met.productionThisPeriod) : "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{met?.meetingsThisPeriod ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{met?.activityCount ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {met && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              met.riskLevel === "critical" ? "bg-rose-100 text-rose-700" :
                              met.riskLevel === "warning" ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-600"
                            }`}>
                              {met.riskLevel === "critical" ? "Riziko" : met.riskLevel === "warning" ? "Pozor" : "OK"}
                            </span>
                          )}
                        </td>
                        <td>
                          <Link href={`/portal/team-overview/${m.userId}`} className="inline-flex p-2 text-slate-400 hover:text-indigo-600" aria-label="Detail">
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {initialMembers.map((m) => {
                const met = metricsByUser.get(m.userId);
                return (
                  <Link key={m.userId} href={`/portal/team-overview/${m.userId}`} className="relative block p-4 hover:bg-slate-50/50 active:bg-slate-100">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{displayName(m)}</p>
                        <p className="text-xs text-slate-500">{m.roleName}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        met?.riskLevel === "critical" ? "bg-rose-100 text-rose-700" :
                        met?.riskLevel === "warning" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {met?.riskLevel === "critical" ? "Riziko" : met?.riskLevel === "warning" ? "Pozor" : "OK"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-slate-600">
                      <span>Jednotky: {met?.unitsThisPeriod ?? "—"}</span>
                      <span>Produkce: {met ? formatNumber(met.productionThisPeriod) : "—"}</span>
                      <span>Schůzky: {met?.meetingsThisPeriod ?? "—"}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2" />
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
