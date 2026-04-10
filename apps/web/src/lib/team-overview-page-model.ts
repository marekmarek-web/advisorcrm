/**
 * Centrální odvozený model pro Team Overview — jeden vstup ze skutečných dat (actions),
 * bez duplikace shaping logiky v jednotlivých sekcích.
 */

import type { TeamOverviewKpis, TeamMemberInfo, NewcomerAdaptation } from "@/app/actions/team-overview";
import type { TeamMemberMetrics, TeamAlert } from "@/lib/team-overview-alerts";
import type { TeamOverviewScope } from "@/lib/team-hierarchy-types";
import { buildTeamCoachingAttentionList } from "@/lib/career/career-coaching";
import { buildTeamCareerSummaryBlock, type TeamCareerSummaryBlock } from "@/lib/career/team-career-aggregate";
import type { TeamCoachingAttentionItem } from "@/lib/career/career-coaching";
import { computeTeamRhythmView, type TeamRhythmCalendarData, type TeamRhythmComputed } from "@/lib/team-rhythm/compute-view";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("cs-CZ");
}

export type TeamOverviewPoolSplit = {
  counts: { beplan: number; premium_brokers: number; not_set: number; other: number };
  units: { beplan: number; premium_brokers: number };
};

export type TeamOverviewBriefingCopy = {
  headline: string;
  lead: string;
  valueFramingLine: string;
  weeklySnapshotLine: string | null;
  teamStandingLine: string | null;
  /** Unikátní členové se signály (CRM/kariéra) — pro briefing kartu a filtr „pozornost“ */
  attentionCount: number;
};

export type TeamOverviewPageModel = {
  briefing: TeamOverviewBriefingCopy;
  careerTeamSummary: TeamCareerSummaryBlock;
  coachingAttention: TeamCoachingAttentionItem[];
  poolSplit: TeamOverviewPoolSplit;
  rhythmComputed: TeamRhythmComputed;
  /** Pro filtr „Pozornost“: CRM alerty ∪ coaching výběr */
  attentionUserIds: string[];
};

export type BuildTeamOverviewPageModelInput = {
  scope: TeamOverviewScope;
  kpis: TeamOverviewKpis | null;
  members: TeamMemberInfo[];
  metrics: TeamMemberMetrics[];
  newcomers: NewcomerAdaptation[];
  alerts: TeamAlert[];
  rhythmCalendar: TeamRhythmCalendarData | null;
};

function buildPoolSplit(metrics: TeamMemberMetrics[]): TeamOverviewPoolSplit {
  const counts = { beplan: 0, premium_brokers: 0, not_set: 0, other: 0 };
  const units = { beplan: 0, premium_brokers: 0 };
  for (const m of metrics) {
    const pid = m.careerEvaluation.careerProgramId;
    if (pid === "beplan") {
      counts.beplan += 1;
      units.beplan += m.unitsThisPeriod;
    } else if (pid === "premium_brokers") {
      counts.premium_brokers += 1;
      units.premium_brokers += m.unitsThisPeriod;
    } else if (pid === "not_set") {
      counts.not_set += 1;
    } else {
      counts.other += 1;
    }
  }
  return { counts, units };
}

function buildBriefingCopy(
  scope: TeamOverviewScope,
  kpis: TeamOverviewKpis | null,
  alerts: TeamAlert[],
  newcomers: NewcomerAdaptation[]
): TeamOverviewBriefingCopy {
  const attentionCount = kpis?.riskyMemberCount ?? new Set(alerts.map((a) => a.memberId)).size;
  const headline = scope === "me" ? "Váš přehled" : "Přehled týmu";
  const lead =
    scope === "me"
      ? "Váš kariérní kontext, metriky a doporučení na jednom místě — podklad pro rozhovor s vedením nebo vlastní plán."
      : attentionCount > 0
        ? `${attentionCount} ${attentionCount === 1 ? "člověk" : "lidí"} v tomto rozsahu má signály k pozornosti (CRM i kariéra), na které stojí za to reagovat — podpora, ne kontrola.`
        : newcomers.length > 0
          ? `${newcomers.length} ${newcomers.length === 1 ? "nováček potřebuje" : "nováčci potřebují"} hlavně klidný rytmus a krátké check-iny — adaptace je investice do týmu.`
          : "V tomto rozsahu neevidujeme naléhavé signály. Udržujte pravidelný kontakt, rytmus 1:1 a prostor pro růst.";

  const valueFramingLine =
    scope === "me"
      ? "Jeden přehled místo lovu dat v tabulkách — vhodné pro osobní plánování a přípravu na 1:1."
      : "Komu pomoct, kdo roste, kde doplnit data a co naplánovat — bez dalšího „reporting wall“. Doporučení vycházejí z kariéry, adaptace a signálů z CRM.";

  const weeklySnapshotLine =
    scope !== "me" && kpis
      ? `Tento týden: ${kpis.meetingsThisWeek} schůzek v CRM (tento rozsah) · období ${kpis.periodLabel}.`
      : scope === "me" && kpis
        ? `Období ${kpis.periodLabel}: ${kpis.unitsThisPeriod} jednotek · produkce ${formatNumber(kpis.productionThisPeriod)}.`
        : null;

  const teamStandingLine =
    kpis && scope !== "me"
      ? (() => {
          const goalBit =
            kpis.teamGoalProgressPercent != null && kpis.teamGoalType
              ? ` Týmový cíl (${kpis.teamGoalType}): ${kpis.teamGoalProgressPercent} %.`
              : "";
          if (kpis.productionTrend > 0) {
            return `Jak si tým stojí: souhrnná produkce roste oproti předchozímu období (orientační trend z CRM).${goalBit}`;
          }
          if (kpis.productionTrend < 0) {
            return `Jak si tým stojí: souhrnná produkce zaostává za předchozím obdobím — vhodný moment na krátký manažerský check-in a podporu, ne sankce.${goalBit}`;
          }
          return `Jak si tým stojí: produkce je v podobné úrovni jako minulé období (CRM).${goalBit}`;
        })()
      : kpis && scope === "me"
        ? `Váš výkon v období ${kpis.periodLabel}: ${formatNumber(kpis.productionThisPeriod)} produkce, ${kpis.unitsThisPeriod} jednotek (CRM — ne BJ/BJS z řádu).`
        : null;

  return {
    headline,
    lead,
    valueFramingLine,
    weeklySnapshotLine,
    teamStandingLine,
    attentionCount,
  };
}

/**
 * Jednotný odvozený model pro všechny sekce Team Overview (klient i server mohou volat se stejnými vstupy).
 */
export function buildTeamOverviewPageModel(input: BuildTeamOverviewPageModelInput): TeamOverviewPageModel {
  const { scope, kpis, members, metrics, newcomers, alerts, rhythmCalendar } = input;

  const newcomerSet = new Set(newcomers.map((n) => n.userId));
  const byUser = new Map(metrics.map((m) => [m.userId, m]));
  const careerRows = members
    .map((m) => {
      const met = byUser.get(m.userId);
      if (!met) return null;
      return {
        userId: m.userId,
        displayName: m.displayName,
        email: m.email,
        careerEvaluation: met.careerEvaluation,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const careerTeamSummary = buildTeamCareerSummaryBlock(careerRows, newcomerSet);

  const coachingAttention =
    scope === "me"
      ? []
      : buildTeamCoachingAttentionList(
          members
            .map((m) => {
              const met = byUser.get(m.userId);
              if (!met) return null;
              const n = newcomers.find((x) => x.userId === m.userId);
              return {
                userId: m.userId,
                displayName: m.displayName,
                email: m.email,
                careerEvaluation: met.careerEvaluation,
                metrics: {
                  meetingsThisPeriod: met.meetingsThisPeriod,
                  unitsThisPeriod: met.unitsThisPeriod,
                  activityCount: met.activityCount,
                  daysWithoutActivity: met.daysWithoutActivity,
                  directReportsCount: met.directReportsCount,
                },
                adaptation: n
                  ? {
                      adaptationStatus: n.adaptationStatus,
                      daysInTeam: n.daysInTeam,
                      adaptationScore: n.adaptationScore,
                      warnings: n.warnings,
                      incompleteChecklistLabels: n.checklist.filter((c) => !c.completed).map((c) => c.label),
                    }
                  : null,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r != null),
          5
        );

  const poolSplit = buildPoolSplit(metrics);

  const rhythmComputed = computeTeamRhythmView(rhythmCalendar, members, metrics, newcomers, coachingAttention);

  const briefing = buildBriefingCopy(scope, kpis, alerts, newcomers);

  const attentionUserIds = Array.from(
    new Set([
      ...alerts.map((a) => a.memberId),
      ...coachingAttention.map((c) => c.userId),
    ])
  );

  return {
    briefing,
    careerTeamSummary,
    coachingAttention,
    poolSplit,
    rhythmComputed,
    attentionUserIds,
  };
}

export type PeopleSegmentFilter = "all" | "attention" | "adaptation" | "managers" | "healthy";

export function memberMatchesPeopleSegment(
  m: TeamMemberInfo,
  segment: PeopleSegmentFilter,
  ctx: {
    metricsByUser: Map<string, TeamMemberMetrics>;
    newcomerSet: Set<string>;
    attentionUserIds: Set<string>;
  }
): boolean {
  const mm = ctx.metricsByUser.get(m.userId);
  switch (segment) {
    case "all":
      return true;
    case "attention":
      return ctx.attentionUserIds.has(m.userId);
    case "adaptation":
      return ctx.newcomerSet.has(m.userId);
    case "managers":
      return m.roleName === "Manager" || m.roleName === "Director";
    case "healthy":
      return (mm?.riskLevel ?? "ok") === "ok" && !ctx.newcomerSet.has(m.userId);
    default:
      return true;
  }
}
