"use client";

import { Users, TrendingUp, ShieldAlert, GraduationCap } from "lucide-react";
import type { TeamOverviewKpis } from "@/app/actions/team-overview";
export function TeamOverviewCockpitFourCards({
  kpis,
  inProductionCount,
  loading,
}: {
  kpis: TeamOverviewKpis | null;
  inProductionCount: number;
  loading: boolean;
}) {
  if (loading && !kpis) {
    return <div className="h-28 animate-pulse rounded-[28px] bg-slate-200/80" />;
  }
  if (!kpis) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="flex min-h-[152px] flex-col rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5">
        <div className="mb-4 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
          <Users className="h-4 w-4 text-slate-400" />
          Velikost týmu
        </div>
        <p className="text-[36px] font-black leading-none tracking-tight text-[#16192b]">{kpis.memberCount}</p>
        <p className="mt-2 text-[11px] font-semibold text-slate-500">Lidé v aktivním scope přehledu</p>
      </div>
      <div className="flex min-h-[152px] flex-col rounded-[24px] border border-emerald-200/80 bg-emerald-50/60 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5">
        <div className="mb-4 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          Aktivní produkce
        </div>
        <p className="text-[36px] font-black leading-none tracking-tight text-emerald-700">{inProductionCount}</p>
        <p className="mt-2 text-[11px] font-semibold text-emerald-700/80">Členové s produkcí &gt; 0</p>
      </div>
      <div className="flex min-h-[152px] flex-col rounded-[24px] border border-rose-200/80 bg-rose-50/60 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5">
        <div className="mb-4 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-rose-700">
          <ShieldAlert className="h-4 w-4 text-rose-500" />
          Krizový zásah
        </div>
        <p
          className={`text-[36px] font-black leading-none tracking-tight ${kpis.riskyMemberCount > 0 ? "text-rose-600" : "text-emerald-600"}`}
        >
          {kpis.riskyMemberCount}
        </p>
        <p className="mt-2 text-[11px] font-semibold text-rose-700/80">Signály rizika z CRM a kariéry</p>
      </div>
      <div className="flex min-h-[152px] flex-col rounded-[24px] border border-sky-200/80 bg-sky-50/60 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5">
        <div className="mb-4 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-700">
          <GraduationCap className="h-4 w-4 text-blue-600" />
          Nováčci v adaptaci
        </div>
        <p className="text-[36px] font-black leading-none tracking-tight text-sky-700">{kpis.newcomersInAdaptation}</p>
        <p className="mt-2 text-[11px] font-semibold text-sky-700/80">Aktivní adaptační okno ve scope</p>
      </div>
    </div>
  );
}
