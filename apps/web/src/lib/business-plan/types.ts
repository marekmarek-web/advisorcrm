/**
 * Business plan types and constants (Phase 5.5).
 */

export type PeriodType = "month" | "quarter" | "year";

export const BUSINESS_PLAN_METRIC_TYPES = [
  "new_clients",
  "meetings",
  "follow_ups",
  "opportunities_open",
  "deals_closed",
  "volume_hypo",
  "volume_investments",
  "service_activities",
  "production",
  "referrals",
] as const;

export type BusinessPlanMetricType = (typeof BUSINESS_PLAN_METRIC_TYPES)[number];

export type PlanHealthStatus =
  | "achieved"
  | "exceeded"
  | "on_track"
  | "slight_slip"
  | "significant_slip"
  | "no_data"
  | "not_applicable";

export type MetricUnit = "count" | "czk" | "pct" | "bj";

export interface PlanPeriod {
  start: Date;
  end: Date;
  label: string;
}

export interface MetricProgress {
  metricType: BusinessPlanMetricType;
  target: number;
  actual: number;
  progressPct: number;
  health: PlanHealthStatus;
  unit: MetricUnit;
}

export interface PlanProgress {
  planId: string;
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  metrics: MetricProgress[];
  overallHealth: PlanHealthStatus;
}

export type SlippageRecommendationType =
  | "meetings_shortfall"
  | "deals_shortfall"
  | "follow_ups_low"
  | "volume_shortfall"
  | "service_activity_low"
  | "new_clients_shortfall";

export interface SlippageRecommendation {
  type: SlippageRecommendationType;
  metricType: BusinessPlanMetricType;
  title: string;
  description: string;
  gap: number;
  actionType: string;
  href: string;
}

/** Labels for metric types (Czech). */
export const METRIC_TYPE_LABELS: Record<BusinessPlanMetricType, string> = {
  new_clients: "Noví klienti",
  meetings: "Schůzky",
  follow_ups: "Follow-upy",
  opportunities_open: "Rozpracované obchody",
  deals_closed: "Uzavřené obchody",
  volume_hypo: "Objem hypoték",
  volume_investments: "Objem investic",
  service_activities: "Servisní aktivity",
  production: "Produkce BJ",
  referrals: "Doporučení",
};

/** Labels for health status. */
export const HEALTH_STATUS_LABELS: Record<PlanHealthStatus, string> = {
  achieved: "Splněno",
  exceeded: "Překročeno",
  on_track: "Podle plánu",
  slight_slip: "Mírný skluz",
  significant_slip: "Výrazný skluz",
  no_data: "Bez dat",
  not_applicable: "Nerelevantní",
};

/** Get period range from periodType, year, periodNumber. */
export function getPlanPeriod(
  periodType: PeriodType,
  year: number,
  periodNumber: number
): PlanPeriod {
  if (periodType === "month") {
    const start = new Date(year, periodNumber - 1, 1);
    const end = new Date(year, periodNumber, 1);
    return {
      start,
      end,
      label: start.toLocaleString("cs-CZ", { month: "long", year: "numeric" }),
    };
  }
  if (periodType === "quarter") {
    const start = new Date(year, (periodNumber - 1) * 3, 1);
    const end = new Date(year, periodNumber * 3, 1);
    return {
      start,
      end,
      label: `Q${periodNumber} ${year}`,
    };
  }
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  return {
    start,
    end,
    label: String(year),
  };
}

/** Current period numbers for today. */
export function getCurrentPeriodNumbers(): {
  year: number;
  month: number;
  quarter: number;
} {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    quarter: Math.floor(now.getMonth() / 3) + 1,
  };
}

/** Reverse math: from production BJ / meetings targets compute suggested calls, meetings and contracts. */
export function computeReverseMath(
  productionTargetBj: number,
  meetingsTarget: number
): { calls: number; meetings: number; contracts: number; productionK: number } {
  const avgBjPerContract = 40;
  const contracts = productionTargetBj > 0 ? Math.round(productionTargetBj / avgBjPerContract) : 0;
  const callsPerMeeting = 5; // reference: 120/25
  const calls = Math.round(meetingsTarget * callsPerMeeting);
  return {
    calls,
    meetings: meetingsTarget,
    contracts,
    productionK: Math.round(productionTargetBj),
  };
}
