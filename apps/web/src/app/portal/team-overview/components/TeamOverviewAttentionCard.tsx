"use client";

import { useMemo, useState } from "react";
import type { TeamMemberMetrics } from "@/lib/team-overview-alerts";
import type { TeamHierarchyMember } from "@/lib/team-hierarchy-types";
import { buildRecommendations, type Recommendation } from "@/lib/team-overview/recommendation-engine";
import { ExplanationDrawer } from "./ExplanationDrawer";

/**
 * F5 AttentionCard \u2014 "Co m\u011bj d\u00edky tento t\u00fdden" cockpit card.
 * Agreguje recommendations z pure engine + otev\u00edr\u00e1 ExplanationDrawer.
 */
export function TeamOverviewAttentionCard({
  metrics,
  members,
  newcomers,
  onAction,
}: {
  metrics: TeamMemberMetrics[];
  members: TeamHierarchyMember[];
  newcomers?: Array<{ userId: string; adaptationStatus: string; daysSinceJoin: number }>;
  onAction?: (rec: Recommendation) => void;
}) {
  const [selected, setSelected] = useState<Recommendation | null>(null);

  const displayByUser = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const mem of members) m.set(mem.userId, mem.displayName ?? mem.email);
    return m;
  }, [members]);

  const adaptByUser = useMemo(() => {
    const m = new Map<string, { adaptationStatus: string; daysSinceJoin: number }>();
    for (const n of newcomers ?? []) m.set(n.userId, { adaptationStatus: n.adaptationStatus, daysSinceJoin: n.daysSinceJoin });
    return m;
  }, [newcomers]);

  const recommendations = useMemo(() => {
    return buildRecommendations(
      metrics.map((metric) => ({
        metric,
        displayName: displayByUser.get(metric.userId) ?? null,
        adaptationStatus: adaptByUser.get(metric.userId)?.adaptationStatus ?? null,
        daysSinceJoin: adaptByUser.get(metric.userId)?.daysSinceJoin ?? null,
      }))
    );
  }, [metrics, displayByUser, adaptByUser]);

  const top = recommendations.slice(0, 8);

  if (top.length === 0) {
    return (
      <div className="rounded-lg border border-[color:var(--wp-surface-card-border)] bg-white p-4 text-sm text-[color:var(--wp-text-secondary)]">
        \u017d\u00e1dn\u00e1 otev\u0159en\u00e1 doporu\u010den\u00ed pro tento t\u00fdden. V\u0161e klape.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[color:var(--wp-surface-card-border)] bg-white">
      <div className="flex items-center justify-between border-b border-[color:var(--wp-surface-card-border)] px-4 py-2">
        <h3 className="text-sm font-semibold text-[color:var(--wp-text)]">Na co se pod\u00edvat jako prvn\u00ed</h3>
        <span className="text-xs text-[color:var(--wp-text-secondary)]">{recommendations.length} doporu\u010den\u00ed</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {top.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => setSelected(r)}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-[color:var(--wp-main-scroll-bg)]"
            >
              <span className={`mt-0.5 inline-flex h-2 w-2 flex-none rounded-full ${priorityDot(r.priority)}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[color:var(--wp-text)]">{r.title}</div>
                <div className="truncate text-xs text-[color:var(--wp-text-secondary)]">{r.summary}</div>
              </div>
              <span className="whitespace-nowrap text-[11px] text-[color:var(--wp-text-tertiary)]">{timingShort(r.timing)}</span>
            </button>
          </li>
        ))}
      </ul>
      <ExplanationDrawer recommendation={selected} onClose={() => setSelected(null)} onAction={onAction} />
    </div>
  );
}

function priorityDot(p: Recommendation["priority"]): string {
  switch (p) {
    case "critical": return "bg-rose-500";
    case "high": return "bg-amber-500";
    case "medium": return "bg-sky-500";
    case "low": return "bg-[color:var(--wp-surface-card-border)]";
  }
}

function timingShort(t: Recommendation["timing"]): string {
  switch (t) {
    case "today": return "Dnes";
    case "this_week": return "Tento t\u00fdden";
    case "this_month": return "Tento m\u011bs\u00edc";
  }
}
