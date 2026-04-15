"use client";

import type { TeamPerformancePoint } from "@/app/actions/team-overview";

export function TeamOverviewPerformanceTrendSection({ performanceOverTime }: { performanceOverTime: TeamPerformancePoint[] }) {
  if (performanceOverTime.length === 0) return null;

  const maxUnits = Math.max(...performanceOverTime.map((x) => x.units), 1);

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-100 px-7 py-4">
        <h2 className="text-[17px] font-black tracking-tight text-slate-950">Trend výkonu (CRM)</h2>
        <p className="mt-0.5 text-[12px] text-slate-400">Jednotky po obdobích — rychlá orientace.</p>
      </div>
      <div className="px-7 py-5">
        <div className="flex h-28 items-end gap-2" aria-label="Graf jednotek po obdobích">
          {performanceOverTime.map((p, i) => {
            const heightPct = maxUnits > 0 ? (p.units / maxUnits) * 100 : 0;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex h-20 w-full flex-col justify-end overflow-hidden rounded-t-[10px] bg-slate-100">
                  <div
                    className="w-full rounded-t-[10px] bg-[#16192b] transition-all duration-300"
                    style={{ height: `${heightPct}%`, minHeight: p.units > 0 ? "4px" : 0 }}
                  />
                </div>
                <span className="w-full truncate text-center text-[10px] font-semibold text-slate-400" title={p.label}>
                  {p.label}
                </span>
                <span className="text-[11px] font-extrabold tabular-nums text-slate-700">{p.units}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
