import type { CareerEvaluationViewModel } from "@/lib/career/career-evaluation-vm";

/**
 * Origin/confidence indikátor pro každý KPI slot (F3 — hybrid KPI badges).
 * - `auto` — odvozeno plně z CRM (contracts/events/activity_log).
 * - `manual_confirmed` — manager explicitně potvrdil hodnotu za období.
 * - `manual_estimated` — manager zadal, ale označil jako odhad / neúplné.
 * - `derived` — vypočítáno z jiných polí (např. trend z auto + prev).
 * - `missing` — data nejsou k dispozici (zatím).
 */
export type MetricSource = "auto" | "manual_confirmed" | "manual_estimated" | "derived" | "missing";

export type MetricSourceMap = Partial<
  Record<
    | "unitsThisPeriod"
    | "productionThisPeriod"
    | "meetingsThisPeriod"
    | "callsThisPeriod"
    | "newContactsThisPeriod"
    | "followUpsThisPeriod"
    | "closedDealsThisPeriod"
    | "closedOpportunitiesThisPeriod"
    | "activityCount"
    | "pipelineValue"
    | "careerEvaluation"
    | "unitsTrend"
    | "productionTrend"
    | "meetingsTrend"
    | "targetProgressPercent",
    MetricSource
  >
>;

export type TeamMemberMetrics = {
  userId: string;
  /** F1 canonical team_members.id; null pro synteticke externi (pred F1 dokoncenim) */
  teamMemberId: string | null;
  memberKind: "internal_user" | "external_manual";
  /** F3 hybrid KPI map — chybějící klíč = `auto`. */
  sources: MetricSourceMap;
  roleName: string;
  parentId: string | null;
  managerName: string | null;
  joinedAt: Date;
  unitsThisPeriod: number;
  productionThisPeriod: number;
  meetingsThisPeriod: number;
  callsThisPeriod: number;
  newContactsThisPeriod: number;
  followUpsThisPeriod: number;
  closedDealsThisPeriod: number;
  closedOpportunitiesThisPeriod: number;
  conversionRate: number;
  pipelineValue: number;
  targetProgressPercent: number | null;
  activityCount: number;
  tasksOpen: number;
  tasksCompleted: number;
  opportunitiesOpen: number;
  lastActivityAt: Date | null;
  daysSinceMeeting: number;
  daysWithoutActivity: number;
  unitsTrend: number;
  productionTrend: number;
  meetingsTrend: number;
  riskLevel: "ok" | "warning" | "critical";
  directReportsCount: number;
  careerEvaluation: CareerEvaluationViewModel;
};

export type TeamAlert = {
  memberId: string;
  type: string;
  severity: "warning" | "critical";
  title: string;
  description: string;
  createdAt: Date;
};

export function buildAlertsFromMetric(metric: TeamMemberMetrics): TeamAlert[] {
  const now = new Date();
  const alerts: TeamAlert[] = [];
  if (metric.daysWithoutActivity >= 7) {
    alerts.push({
      memberId: metric.userId,
      type: "no_activity",
      severity: metric.daysWithoutActivity >= 14 ? "critical" : "warning",
      title: `${metric.daysWithoutActivity} dní bez aktivity`,
      description: "Člen týmu dlouho neevidoval aktivitu v CRM.",
      createdAt: now,
    });
  }
  if (metric.meetingsTrend <= -3 || metric.daysSinceMeeting >= 14) {
    alerts.push({
      memberId: metric.userId,
      type: "meeting_drop",
      severity: metric.daysSinceMeeting >= 21 ? "critical" : "warning",
      title: metric.daysSinceMeeting >= 14 ? `${metric.daysSinceMeeting} dní bez schůzky` : "Pokles schůzek",
      description: "Počet schůzek se propadá oproti minulému období.",
      createdAt: now,
    });
  }
  if (metric.activityCount < 3) {
    alerts.push({
      memberId: metric.userId,
      type: "low_activity",
      severity: metric.activityCount === 0 ? "critical" : "warning",
      title: "Nízká aktivita",
      description: "Nízká práce v CRM v aktuálním období.",
      createdAt: now,
    });
  }
  if (metric.closedOpportunitiesThisPeriod >= 3 && metric.conversionRate < 0.2) {
    alerts.push({
      memberId: metric.userId,
      type: "weak_conversion",
      severity: metric.conversionRate < 0.1 ? "critical" : "warning",
      title: "Slabý conversion",
      description: "Nízká úspěšnost uzavírání obchodních příležitostí.",
      createdAt: now,
    });
  }
  if (metric.newContactsThisPeriod === 0 && metric.daysWithoutActivity >= 7) {
    alerts.push({
      memberId: metric.userId,
      type: "no_new_leads",
      severity: metric.daysWithoutActivity >= 14 ? "critical" : "warning",
      title: "Dlouho bez nového leadu",
      description: "V období nebyl evidován žádný nový kontakt.",
      createdAt: now,
    });
  }
  if (metric.productionTrend < 0 && Math.abs(metric.productionTrend) > Math.max(metric.productionThisPeriod, 1000) * 0.5) {
    alerts.push({
      memberId: metric.userId,
      type: "production_drop",
      severity: Math.abs(metric.productionTrend) > Math.max(metric.productionThisPeriod, 1000) ? "critical" : "warning",
      title: "Výrazný pokles výkonu",
      description: "Produkce je výrazně pod minulým obdobím.",
      createdAt: now,
    });
  }

  const ce = metric.careerEvaluation;
  if (ce.progressEvaluation === "data_missing" || ce.progressEvaluation === "not_configured") {
    alerts.push({
      memberId: metric.userId,
      type: "career_data_gap",
      severity: "warning",
      title: "Kariéra: chybí nastavení nebo údaje",
      description:
        ce.progressEvaluation === "not_configured"
          ? "Není doplněn kariérní program / větev / pozice — doporučujeme nastavit v Nastavení → Tým."
          : "Kariérní údaje jsou neúplné nebo v rozporu — zkontrolujte kombinaci program, větev a pozice.",
      createdAt: now,
    });
  } else if (ce.progressEvaluation === "blocked" || ce.progressEvaluation === "unknown") {
    alerts.push({
      memberId: metric.userId,
      type: "career_review",
      severity: "warning",
      title: "Kariéra: ověřte konfiguraci",
      description: "Evaluace narazila na nejasnou nebo neplatnou kombinaci údajů. Ověřte záznam u člena.",
      createdAt: now,
    });
  } else if (ce.evaluationCompleteness === "low_confidence") {
    alerts.push({
      memberId: metric.userId,
      type: "career_low_confidence",
      severity: "warning",
      title: "Kariéra: nízká jistota evaluace",
      description: "Jsou přítomny legacy hodnoty nebo chybí explicitní větev — doporučujeme upřesnit údaje v Nastavení → Tým.",
      createdAt: now,
    });
  }

  return alerts;
}

/** Sdílené odvození alertů z metrik (Team Overview, AI kontext, detail člena). */
export function buildTeamAlertsFromMemberMetrics(metrics: TeamMemberMetrics[]): TeamAlert[] {
  return metrics
    .filter((m) => m.memberKind !== "external_manual")
    .flatMap((m) => buildAlertsFromMetric(m))
    .sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === "critical" ? -1 : 1;
    });
}
