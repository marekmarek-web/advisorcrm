"use client";

import type { TeamPerformancePoint } from "@/app/actions/team-overview";

export function TeamOverviewPerformanceTrendSection({ performanceOverTime }: { performanceOverTime: TeamPerformancePoint[] }) {
  if (performanceOverTime.length === 0) return null;

  const maxUnits = Math.max(...performanceOverTime.map((x) => x.units), 1);

  return (
    <section className="overflow-hidden rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)]/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.055)]">
      <div className="border-b border-[color:var(--wp-surface-card-border)] px-7 py-5">
        <h2 className="text-[17px] font-black tracking-tight text-[color:var(--wp-text)]">Trend výkonu (CRM)</h2>
        <p className="mt-1 text-[12px] text-[color:var(--wp-text-secondary)]">Jednotky po obdobích — rychlá orientace.</p>
      </div>
      <div className="px-7 py-6">
        <div className="flex h-28 items-end gap-2" aria-label="Graf jednotek po obdobích">
          {performanceOverTime.map((p, i) => {
            const heightPct = maxUnits > 0 ? (p.units / maxUnits) * 100 : 0;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex h-20 w-full flex-col justify-end overflow-hidden rounded-t-[10px] bg-[color:var(--wp-surface-muted)]">
                  <div
                    className="w-full rounded-t-[10px] bg-[#16192b] transition-all duration-300"
                    style={{ height: `${heightPct}%`, minHeight: p.units > 0 ? "4px" : 0 }}
                  />
                </div>
                <span className="w-full truncate text-center text-[10px] font-semibold text-[color:var(--wp-text-tertiary)]" title={p.label}>
                  {p.label}
                </span>
                <span className="text-[11px] font-extrabold tabular-nums text-[color:var(--wp-text)]">{p.units}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
