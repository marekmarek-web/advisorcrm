"use client";

import Link from "next/link";
import {
  TrendingUp,
  Calendar,
  CheckSquare,
  Briefcase,
  Activity,
  AlertTriangle,
  ChevronRight,
  Check,
  X,
} from "lucide-react";
import type { TeamMemberDetail } from "@/app/actions/team-overview";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("cs-CZ");
}

export function TeamMemberDetailView({ detail }: { detail: TeamMemberDetail }) {
  const name = detail.displayName || "Člen týmu";
  const m = detail.metrics;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{name}</h1>
        <p className="text-slate-500 mt-1">{detail.roleName} · v týmu od {new Date(detail.joinedAt).toLocaleDateString("cs-CZ")}</p>
      </div>

      {detail.alerts.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Upozornění
          </h2>
          <ul className="space-y-2">
            {detail.alerts.map((a, i) => (
              <li
                key={i}
                className={`rounded-xl border px-4 py-3 ${
                  a.severity === "critical" ? "border-rose-200 bg-rose-50/50" : "border-amber-200 bg-amber-50/50"
                }`}
              >
                <p className="font-medium text-slate-900">{a.title}</p>
                <p className="text-sm text-slate-600">{a.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Metriky (tento měsíc)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-2xl font-bold text-slate-900">{m.unitsThisPeriod}</p>
              <p className="text-xs text-slate-500">Jednotky</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-2xl font-bold text-slate-900">{formatNumber(m.productionThisPeriod)}</p>
              <p className="text-xs text-slate-500">Produkce</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-2xl font-bold text-slate-900">{m.meetingsThisPeriod}</p>
              <p className="text-xs text-slate-500">Schůzky</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-2xl font-bold text-slate-900">{m.activityCount}</p>
              <p className="text-xs text-slate-500">Aktivity</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <p className="text-slate-600">Otevřené úkoly: <strong>{m.tasksOpen}</strong></p>
            <p className="text-slate-600">Splněné úkoly: <strong>{m.tasksCompleted}</strong></p>
            <p className="text-slate-600">Otevřené případy: <strong>{m.opportunitiesOpen}</strong></p>
            <p className="text-slate-600">Poslední aktivita: {m.lastActivityAt ? new Date(m.lastActivityAt).toLocaleDateString("cs-CZ") : "—"}</p>
            <p className="text-slate-600">Dnů bez aktivity: <strong>{m.daysWithoutActivity}</strong></p>
          </div>
        </section>
      )}

      {detail.performanceOverTime.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Výkon v čase</h2>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex gap-2 items-end justify-between h-28">
              {detail.performanceOverTime.map((p, i) => {
                const maxUnits = Math.max(...detail.performanceOverTime.map((x) => x.units), 1);
                const heightPct = maxUnits > 0 ? (p.units / maxUnits) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full flex flex-col justify-end h-16 rounded-t bg-slate-100 overflow-hidden">
                      <div
                        className="w-full bg-indigo-500 rounded-t"
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

      {detail.adaptation && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Adaptace nováčka</h2>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-4">
              <span className="text-slate-600">{detail.adaptation.daysInTeam} dní v týmu</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{detail.adaptation.adaptationScore} %</span>
            </div>
            <p className="text-sm text-slate-600 mb-3">Stav: <strong>{detail.adaptation.adaptationStatus}</strong></p>
            <ul className="space-y-2">
              {detail.adaptation.checklist.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  {s.completed ? <Check className="w-4 h-4 text-emerald-500" /> : <X className="w-4 h-4 text-slate-300" />}
                  <span className={s.completed ? "text-slate-700" : "text-slate-500"}>{s.label}</span>
                </li>
              ))}
            </ul>
            {detail.adaptation.warnings.length > 0 && (
              <p className="mt-3 text-sm text-amber-600">{detail.adaptation.warnings.join(" · ")}</p>
            )}
          </div>
        </section>
      )}

      <div className="pt-4">
        <Link
          href="/portal/team-overview"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          ← Zpět na Týmový přehled
        </Link>
      </div>
    </div>
  );
}
