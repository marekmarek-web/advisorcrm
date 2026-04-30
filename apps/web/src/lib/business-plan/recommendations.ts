/**
 * Generate slippage recommendations and CTAs from plan progress.
 */

import type { PlanProgress, SlippageRecommendation, SlippageRecommendationType } from "./types";
import { METRIC_TYPE_LABELS } from "./types";

const CTA_MAP: Record<
  string,
  { actionType: string; href: string; recType: SlippageRecommendationType }
> = {
  meetings: {
    actionType: "schedule_meeting",
    href: "/portal/calendar?newEvent=1",
    recType: "meetings_shortfall",
  },
  deals_closed: {
    actionType: "open_pipeline",
    href: "/portal/pipeline",
    recType: "deals_shortfall",
  },
  follow_ups: {
    actionType: "open_tasks",
    href: "/portal/tasks",
    recType: "follow_ups_low",
  },
  volume_hypo: {
    actionType: "open_pipeline",
    href: "/portal/pipeline",
    recType: "volume_shortfall",
  },
  volume_investments: {
    actionType: "open_pipeline",
    href: "/portal/pipeline",
    recType: "volume_shortfall",
  },
  production: {
    actionType: "open_production",
    href: "/portal/production",
    recType: "volume_shortfall",
  },
  service_activities: {
    actionType: "open_service",
    href: "/portal/today",
    recType: "service_activity_low",
  },
  new_clients: {
    actionType: "new_client",
    href: "/portal/contacts/new",
    recType: "new_clients_shortfall",
  },
  opportunities_open: {
    actionType: "open_pipeline",
    href: "/portal/pipeline",
    recType: "deals_shortfall",
  },
};

function formatGap(unit: string, gap: number): string {
  if (unit === "bj") return `${Math.round(gap).toLocaleString("cs-CZ")} BJ`;
  if (unit === "czk") return `${Math.round(gap).toLocaleString("cs-CZ")} Kč`;
  return String(Math.round(gap));
}

function buildDescription(
  metricType: string,
  gap: number,
  target: number,
  unit: string
): string {
  const label = METRIC_TYPE_LABELS[metricType as keyof typeof METRIC_TYPE_LABELS] ?? metricType;
  const gapStr = formatGap(unit, gap);
  const targetStr =
    unit === "bj"
      ? `${target.toLocaleString("cs-CZ")} BJ`
      : unit === "czk"
        ? `${target.toLocaleString("cs-CZ")} Kč`
        : target.toLocaleString("cs-CZ");
  return `Chybí ${gapStr} do cíle ${targetStr}.`;
}

/**
 * Build recommendations from plan progress. Only metrics in slight_slip or significant_slip.
 * Sorted: significant_slip first, then slight_slip; within each by gap descending.
 */
export function getSlippageRecommendations(progress: PlanProgress): SlippageRecommendation[] {
  const slipping = progress.metrics.filter(
    (m) => m.health === "significant_slip" || m.health === "slight_slip"
  );
  const recs: SlippageRecommendation[] = [];
  for (const m of slipping) {
    const cta = CTA_MAP[m.metricType];
    if (!cta) continue;
    const gap = Math.max(0, m.target - m.actual);
    const title =
      m.health === "significant_slip"
        ? `${METRIC_TYPE_LABELS[m.metricType]} výrazně zaostávají`
        : `${METRIC_TYPE_LABELS[m.metricType]} mírně zaostávají`;
    recs.push({
      type: cta.recType,
      metricType: m.metricType,
      title,
      description: buildDescription(m.metricType, gap, m.target, m.unit),
      gap,
      actionType: cta.actionType,
      href: cta.href,
    });
  }
  recs.sort((a, b) => {
    const aSevere = progress.metrics.find((m) => m.metricType === a.metricType)?.health === "significant_slip" ? 1 : 0;
    const bSevere = progress.metrics.find((m) => m.metricType === b.metricType)?.health === "significant_slip" ? 1 : 0;
    if (bSevere !== aSevere) return bSevere - aSevere;
    return b.gap - a.gap;
  });
  return recs;
}
