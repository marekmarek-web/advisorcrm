/**
 * Team Overview F5 \u2014 recommendation engine.
 *
 * Vstupem je TeamMemberMetrics (v\u010d. sources map + memberKind) + adaptation status
 * + volitelne career coaching package. V\u00fdstupem je pole `Recommendation` s explainable
 * rationale. Engine je **pure** \u2014 pouze po\u010d\u00edt\u00e1 nad vstupy; UI/drawer \u0159e\u0161\u00ed F5 UI vrstva.
 *
 * Kl\u00ed\u010dov\u00e1 pravidla:
 * - external_manual \u010dlen\u016fm nen\u00edkdy nep\u0159i\u0159azujeme CRM-based doporu\u010den\u00ed (irelevantn\u00ed).
 * - Pokud klju\u010dov\u00e9 metriky maj\u00ed source = "missing" nebo "manual_estimated", engine to
 *   reflektuje p\u0159es `data_completion` / `data_confirm` recommendation.
 * - V\u0161echna doporu\u010den\u00ed nesou `explanation` (co data \u0159\u00edkaj\u00ed) a `cta` (co u\u010din\u00edt dal\u0161\u00edho).
 */

import type { TeamMemberMetrics } from "@/lib/team-overview-alerts";

export type RecommendationKind =
  | "adaptation_checkin"
  | "one_on_one"
  | "data_completion"
  | "data_confirm"
  | "career_review"
  | "career_promote"
  | "production_dip"
  | "meeting_dip"
  | "celebrate_win"
  | "no_activity"
  | "hierarchy_gap";

export type RecommendationPriority = "critical" | "high" | "medium" | "low";

export type RecommendationOwner = "manager" | "director" | "admin" | "member_self";

export type RecommendationTiming = "today" | "this_week" | "this_month";

export type Recommendation = {
  /** Stabiln\u00ed id \u2014 uk\u00e1z\u00e1n\u00ed v UI pro dismiss / snooze. */
  id: string;
  memberUserId: string;
  memberTeamMemberId: string | null;
  kind: RecommendationKind;
  priority: RecommendationPriority;
  owner: RecommendationOwner;
  timing: RecommendationTiming;
  /** Kr\u00e1tk\u00fd title (1 \u0159\u00e1dek) \u2014 pro card. */
  title: string;
  /** Jedna v\u011bta / v\u00fdsledek; `co?`. */
  summary: string;
  /** Strukturovan\u00fd explain blok \u2014 drawer uka\u017ee tyto \u0159\u00e1dky. */
  explanation: Array<{ label: string; value: string }>;
  /** Navrhovan\u00e9 CTA \u2014 UI m\u016f\u017ee zapnout deep-link / modal. */
  cta: { label: string; action: string; payload?: Record<string, unknown> };
};

export type RecommendationInput = {
  metric: TeamMemberMetrics;
  displayName: string | null;
  adaptationStatus?: string | null;
  /** Po\u010det dn\u00ed od joinedAt \u2014 u\u017eite\u010dn\u00e9 pro adaptation windows. */
  daysSinceJoin?: number | null;
};

const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function buildRecommendations(inputs: RecommendationInput[]): Recommendation[] {
  const all: Recommendation[] = [];
  for (const inp of inputs) {
    all.push(...buildForMember(inp));
  }
  return all.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

function buildForMember(inp: RecommendationInput): Recommendation[] {
  const { metric, displayName, adaptationStatus, daysSinceJoin } = inp;
  const name = displayName ?? metric.userId;
  const out: Recommendation[] = [];

  const baseId = (suffix: string) => `${metric.userId}:${suffix}`;
  const member = { memberUserId: metric.userId, memberTeamMemberId: metric.teamMemberId };

  // 1) Extern\u00ed \u010dlen bez manu\u00e1ln\u00edch dat \u2014 n\u00e1vrh vyplnit.
  if (metric.memberKind === "external_manual") {
    const missingKeys: string[] = [];
    for (const k of ["unitsThisPeriod", "productionThisPeriod", "meetingsThisPeriod", "closedDealsThisPeriod"] as const) {
      if (metric.sources[k] === "missing") missingKeys.push(k);
    }
    if (missingKeys.length > 0) {
      out.push({
        ...member,
        id: baseId("data_completion"),
        kind: "data_completion",
        priority: missingKeys.length >= 3 ? "high" : "medium",
        owner: "manager",
        timing: "this_week",
        title: `Dopl\u0148te produkci za aktu\u00e1ln\u00ed obdob\u00ed \u2014 ${name}`,
        summary: "Extern\u00ed \u010dlen bez \u017e\u00e1dn\u00e9ho z\u00e1znamu za obdob\u00ed. Bez dat nem\u016f\u017eeme hodnotit v\u00fdkon.",
        explanation: [
          { label: "Typ \u010dlena", value: "Extern\u00ed / manu\u00e1ln\u00ed" },
          { label: "Chyb\u011bj\u00edc\u00ed KPI", value: missingKeys.join(", ") },
          { label: "Zdroj", value: "team_member_manual_periods (neexistuje)" },
        ],
        cta: { label: "Zadat m\u011bs\u00ed\u010dn\u00ed data", action: "manual_period_upsert", payload: { teamMemberId: metric.teamMemberId } },
      });
    }
    // Pro extern\u00ed v\u011bt\u0161inou sk\u00e1\u010dneme d\u00e1l \u2014 ostatn\u00ed CRM pravidla neplat\u00ed.
    return out;
  }

  // 2) Odhadovan\u00e1 data \u2014 pot\u0159eba potvrdit.
  const estimated: string[] = Object.entries(metric.sources)
    .filter(([, v]) => v === "manual_estimated")
    .map(([k]) => k);
  if (estimated.length > 0) {
    out.push({
      ...member,
      id: baseId("data_confirm"),
      kind: "data_confirm",
      priority: "low",
      owner: "manager",
      timing: "this_week",
      title: `Potvr\u010fte odhadovan\u00e1 \u010d\u00edsla \u2014 ${name}`,
      summary: "Hodnoty jsou ozna\u010den\u00e9 jako odhad; potvr\u010fte / upravte p\u0159ed z\u00e1v\u011brkou obdob\u00ed.",
      explanation: [
        { label: "Odhadovan\u00e9 KPI", value: estimated.join(", ") },
        { label: "Zdroj", value: "team_member_manual_periods (confidence = manual_estimated)" },
      ],
      cta: { label: "Potvrdit obdob\u00ed", action: "manual_period_confirm", payload: { teamMemberId: metric.teamMemberId } },
    });
  }

  // 3) Adaptation check-in (newcomer window)
  if (adaptationStatus && daysSinceJoin != null && daysSinceJoin <= 90) {
    const priority: RecommendationPriority = daysSinceJoin <= 30 ? "high" : daysSinceJoin <= 60 ? "medium" : "low";
    out.push({
      ...member,
      id: baseId("adaptation_checkin"),
      kind: "adaptation_checkin",
      priority,
      owner: "manager",
      timing: daysSinceJoin <= 30 ? "today" : "this_week",
      title: `Adapta\u010dn\u00ed check-in \u2014 ${name} (D+${daysSinceJoin})`,
      summary: `\u010clen je v adaptaci: ${adaptationStatus}. Udr\u017eujte rytmus 30/60/90.`,
      explanation: [
        { label: "Dn\u016f od n\u00e1stupu", value: String(daysSinceJoin) },
        { label: "Adapta\u010dn\u00ed status", value: adaptationStatus },
      ],
      cta: { label: "Otev\u0159\u00edt adapta\u010dn\u00ed kartu", action: "open_adaptation", payload: { userId: metric.userId } },
    });
  }

  // 4) No activity — critical if >=14 dní, high if >=7.
  if (metric.daysWithoutActivity >= 7) {
    const priority: RecommendationPriority = metric.daysWithoutActivity >= 14 ? "critical" : "high";
    out.push({
      ...member,
      id: baseId("no_activity"),
      kind: "no_activity",
      priority,
      owner: "manager",
      timing: priority === "critical" ? "today" : "this_week",
      title: `${metric.daysWithoutActivity} dn\u00ed bez aktivity \u2014 ${name}`,
      summary: "\u010clen dlouho neeviduje nic v CRM. D\u00f4vod m\u016f\u017ee b\u00fdt b\u011b\u017en\u00fd (dovolen\u00e1), ale potvr\u010fte.",
      explanation: [
        { label: "Dn\u016f bez aktivity", value: String(metric.daysWithoutActivity) },
        { label: "Posledn\u00ed aktivita", value: metric.lastActivityAt ? metric.lastActivityAt.toISOString().slice(0, 10) : "\u2014" },
        { label: "Zdroj", value: "activity_log (auto)" },
      ],
      cta: { label: "Naplanovat 1:1", action: "schedule_1on1", payload: { userId: metric.userId } },
    });
  }

  // 5) Production dip
  if (metric.productionTrend <= -0.25 && metric.productionThisPeriod > 0) {
    out.push({
      ...member,
      id: baseId("production_dip"),
      kind: "production_dip",
      priority: metric.productionTrend <= -0.5 ? "high" : "medium",
      owner: "manager",
      timing: "this_week",
      title: `Pokles produkce \u2014 ${name} (${Math.round(metric.productionTrend * 100)} %)`,
      summary: "Produkce klesla oproti p\u0159edchoz\u00edmu obdob\u00ed.",
      explanation: [
        { label: "Produkce (aktu\u00e1ln\u00ed)", value: metric.productionThisPeriod.toLocaleString("cs-CZ") },
        { label: "Trend", value: `${Math.round(metric.productionTrend * 100)} %` },
        { label: "Zdroj", value: metric.sources.productionThisPeriod ?? "auto" },
      ],
      cta: { label: "Otev\u0159\u00edt detail \u010dlena", action: "open_member", payload: { userId: metric.userId } },
    });
  }

  // 6) Meeting dip
  if (metric.daysSinceMeeting >= 14) {
    out.push({
      ...member,
      id: baseId("meeting_dip"),
      kind: "meeting_dip",
      priority: metric.daysSinceMeeting >= 21 ? "high" : "medium",
      owner: "manager",
      timing: "this_week",
      title: `${metric.daysSinceMeeting} dn\u00ed bez sch\u016fzky \u2014 ${name}`,
      summary: "Dlouh\u00e1 mezera ve sch\u016fzk\u00e1ch. Zjist\u011bte, zda v\u011b\u010d klientsky nev\u00e1zne.",
      explanation: [
        { label: "Dn\u016f od posledn\u00ed sch\u016fzky", value: String(metric.daysSinceMeeting) },
        { label: "Sch\u016fzky (obdob\u00ed)", value: String(metric.meetingsThisPeriod) },
      ],
      cta: { label: "Otev\u0159\u00edt rytmus", action: "open_rhythm", payload: { userId: metric.userId } },
    });
  }

  // 7) Celebrate win \u2014 silný trend + target progress
  if (metric.productionTrend >= 0.3 && (metric.targetProgressPercent ?? 0) >= 80) {
    out.push({
      ...member,
      id: baseId("celebrate_win"),
      kind: "celebrate_win",
      priority: "low",
      owner: "manager",
      timing: "this_week",
      title: `Pochvalte v\u00fdkon \u2014 ${name}`,
      summary: "Produkce roste a plnen\u00ed c\u00edle je na hran\u011b / nad pl\u00e1nem. Uznan\u00ed zvy\u0161uje motivaci.",
      explanation: [
        { label: "Produk\u010dn\u00ed trend", value: `${Math.round(metric.productionTrend * 100)} %` },
        { label: "Pln\u011bn\u00ed c\u00edle", value: `${metric.targetProgressPercent ?? "?"} %` },
      ],
      cta: { label: "Poslat uzn\u00e1n\u00ed", action: "send_kudos", payload: { userId: metric.userId } },
    });
  }

  // 8) Career review \u2014 trigger na z\u00e1klad\u011b career evaluation model completeness
  if (
    metric.careerEvaluation?.evaluationCompleteness === "low_confidence" ||
    metric.careerEvaluation?.evaluationCompleteness === "manual_required" ||
    metric.careerEvaluation?.progressEvaluation === "data_missing" ||
    metric.careerEvaluation?.progressEvaluation === "not_configured"
  ) {
    out.push({
      ...member,
      id: baseId("career_review"),
      kind: "career_review",
      priority: "medium",
      owner: "manager",
      timing: "this_month",
      title: `Kari\u00e9rn\u00ed revize \u2014 ${name}`,
      summary: "Kari\u00e9rn\u00ed evaluaci nelze spo\u010d\u00edtat: chyb\u00ed vstupn\u00ed data (program, pozice, KPI).",
      explanation: [
        { label: "Program", value: metric.careerEvaluation.careerProgramId ?? "not_set" },
        { label: "Pozice", value: metric.careerEvaluation.careerPositionLabel ?? "\u2014" },
      ],
      cta: { label: "Otev\u0159\u00edt kari\u00e9ru", action: "open_career", payload: { userId: metric.userId } },
    });
  }
  if (
    metric.careerEvaluation?.progressEvaluation === "close_to_promotion" ||
    metric.careerEvaluation?.progressEvaluation === "promoted_ready"
  ) {
    out.push({
      ...member,
      id: baseId("career_promote"),
      kind: "career_promote",
      priority: "medium",
      owner: "director",
      timing: "this_month",
      title: `Zv\u00e1\u017eit posun pozice \u2014 ${name}`,
      summary: "\u010clen spl\u0148uje pr\u00e1h pro dal\u0161\u00ed kari\u00e9rn\u00ed pozici.",
      explanation: [
        { label: "Aktu\u00e1ln\u00ed pozice", value: metric.careerEvaluation.careerPositionLabel ?? "\u2014" },
        { label: "Doporu\u010den\u00e1 dal\u0161\u00ed", value: metric.careerEvaluation.nextCareerPositionLabel ?? "\u2014" },
        { label: "Progress", value: metric.careerEvaluation.progressEvaluation },
      ],
      cta: { label: "Otev\u0159\u00edt kari\u00e9ru", action: "open_career", payload: { userId: metric.userId } },
    });
  }

  return out;
}
