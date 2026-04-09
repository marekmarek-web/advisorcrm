import type { TeamMemberInfo, TeamMemberMetrics, NewcomerAdaptation } from "@/app/actions/team-overview";
import type { TeamCoachingAttentionItem } from "@/lib/career/career-coaching";
import { classifyInternalTeamTitle, type InternalRhythmCategory } from "./internal-classification";
import { lastPersonalTouchByUser } from "./last-touch";
import { buildTeamCadenceRows, cadenceNeedsAttention, type TeamCadenceRow } from "./build-cadence";

export type TeamRhythmCalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  /** Z serveru (heuristika z názvu); klient může doplnit classify, pokud chybí. */
  category?: InternalRhythmCategory;
  targetUserIds: string[];
};

export type TeamRhythmCalendarTask = {
  id: string;
  title: string;
  dueDate: string | null;
  category?: InternalRhythmCategory;
  targetUserIds: string[];
};

export type TeamRhythmCalendarData = {
  events: TeamRhythmCalendarEvent[];
  tasks: TeamRhythmCalendarTask[];
  disclaimerCs: string;
};

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function parseIso(s: string): Date {
  return new Date(s);
}

export type TeamRhythmComputed = {
  upcomingEvents: Array<TeamRhythmCalendarEvent & { startAtDate: Date; withinWeek: boolean }>;
  recentPastEvents: Array<TeamRhythmCalendarEvent & { startAtDate: Date }>;
  overdueTasks: Array<TeamRhythmCalendarTask & { dueDateDate: Date | null }>;
  upcomingTasks: Array<TeamRhythmCalendarTask & { dueDateDate: Date | null }>;
  cadenceRows: TeamCadenceRow[];
  cadenceAttention: TeamCadenceRow[];
  /** Doporučení bez naplánovaného osobního doteku v příštích 7 dnech */
  cadenceWithoutUpcomingTouch: TeamCadenceRow[];
  /** Kolik lidí z coaching „kdo potřebuje krok“ současně v cadence „vyžaduje pozornost“ */
  coachingCadenceAlignedCount: number;
  stats: {
    adaptationCheckinsThisWeek: number;
    oneOnOneTaggedThisWeek: number;
    teamMeetingsThisWeek: number;
    overdueTeamTasks: number;
    upcomingTeamTasksInHorizon: number;
    cadenceAttentionCount: number;
  };
};

function eventTouchesUserInWeek(
  ev: { startAtDate: Date; targetUserIds: string[]; category: InternalRhythmCategory },
  userId: string,
  weekEnd: Date
): boolean {
  if (!ev.targetUserIds.includes(userId)) return false;
  if (ev.startAtDate > weekEnd) return false;
  if (ev.category !== "one_on_one_hint" && ev.category !== "adaptation_checkin_hint") return false;
  return true;
}

/** Propojení s coaching attention: kdo je v obou seznamech */
export function coachingCadenceOverlap(
  coachingAttention: TeamCoachingAttentionItem[],
  cadenceAttention: TeamCadenceRow[]
): Map<string, { coaching: TeamCoachingAttentionItem; cadence: TeamCadenceRow }> {
  const cadenceByUser = new Map(cadenceAttention.map((c) => [c.userId, c]));
  const map = new Map<string, { coaching: TeamCoachingAttentionItem; cadence: TeamCadenceRow }>();
  for (const co of coachingAttention) {
    const cad = cadenceByUser.get(co.userId);
    if (cad) map.set(co.userId, { coaching: co, cadence: cad });
  }
  return map;
}

export function computeTeamRhythmView(
  calendar: TeamRhythmCalendarData | null,
  members: TeamMemberInfo[],
  metrics: TeamMemberMetrics[],
  newcomers: NewcomerAdaptation[],
  coachingAttention: TeamCoachingAttentionItem[],
  now: Date = new Date()
): TeamRhythmComputed {
  const empty: TeamRhythmComputed = {
    upcomingEvents: [],
    recentPastEvents: [],
    overdueTasks: [],
    upcomingTasks: [],
    cadenceRows: [],
    cadenceAttention: [],
    cadenceWithoutUpcomingTouch: [],
    stats: {
      adaptationCheckinsThisWeek: 0,
      oneOnOneTaggedThisWeek: 0,
      teamMeetingsThisWeek: 0,
      overdueTeamTasks: 0,
      upcomingTeamTasksInHorizon: 0,
      cadenceAttentionCount: 0,
    },
    coachingCadenceAlignedCount: 0,
  };

  if (!calendar) return empty;

  const startToday = startOfLocalDay(now);
  const weekEnd = addDays(startToday, 7);
  const horizonEnd = addDays(startToday, 14);
  const pastCut = addDays(startToday, -7);

  const eventsParsed = calendar.events.map((e) => ({
    ...e,
    startAtDate: parseIso(e.startAt),
    category: e.category ?? classifyInternalTeamTitle(e.title),
  }));

  const tasksParsed = calendar.tasks.map((t) => ({
    ...t,
    dueDateDate: t.dueDate ? parseIso(t.dueDate) : null,
    category: t.category ?? classifyInternalTeamTitle(t.title),
  }));

  const upcomingEvents = eventsParsed
    .filter((e) => e.startAtDate >= now && e.startAtDate <= horizonEnd)
    .sort((a, b) => a.startAtDate.getTime() - b.startAtDate.getTime())
    .map((e) => ({
      ...e,
      withinWeek: e.startAtDate >= startToday && e.startAtDate < weekEnd,
    }));

  const recentPastEvents = eventsParsed
    .filter((e) => e.startAtDate < now && e.startAtDate >= pastCut)
    .sort((a, b) => b.startAtDate.getTime() - a.startAtDate.getTime())
    .slice(0, 8);

  const overdueTasks = tasksParsed.filter(
    (t) => t.dueDateDate != null && t.dueDateDate < startToday
  );

  const upcomingTasks = tasksParsed.filter(
    (t) =>
      t.dueDateDate != null && t.dueDateDate >= startToday && t.dueDateDate <= horizonEnd
  );

  const stats = {
    adaptationCheckinsThisWeek: eventsParsed.filter(
      (e) =>
        e.category === "adaptation_checkin_hint" &&
        e.startAtDate >= startToday &&
        e.startAtDate < weekEnd
    ).length,
    oneOnOneTaggedThisWeek: eventsParsed.filter(
      (e) =>
        e.category === "one_on_one_hint" &&
        e.startAtDate >= startToday &&
        e.startAtDate < weekEnd
    ).length,
    teamMeetingsThisWeek: eventsParsed.filter(
      (e) =>
        e.category === "team_meeting_hint" &&
        e.startAtDate >= startToday &&
        e.startAtDate < weekEnd
    ).length,
    overdueTeamTasks: overdueTasks.length,
    upcomingTeamTasksInHorizon: upcomingTasks.length,
    cadenceAttentionCount: 0,
  };

  const newcomerByUser = new Map(newcomers.map((n) => [n.userId, n]));
  const metricsByUser = new Map(metrics.map((m) => [m.userId, m]));

  const touchEvents = eventsParsed.map((e) => ({
    startAt: e.startAtDate,
    targetUserIds: e.targetUserIds,
    category: e.category,
  }));
  const lastTouch = lastPersonalTouchByUser(touchEvents, now);

  const cadenceInput = members
    .map((m) => {
      const met = metricsByUser.get(m.userId);
      if (!met) return null;
      const n = newcomerByUser.get(m.userId);
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
        lastPersonalTouchAt: lastTouch.get(m.userId) ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const cadenceRows = buildTeamCadenceRows(cadenceInput, now);
  const cadenceAttention = cadenceRows.filter(cadenceNeedsAttention);
  stats.cadenceAttentionCount = cadenceAttention.length;

  const upcomingForTouchCheck = upcomingEvents;

  const cadenceWithoutUpcomingTouch = cadenceAttention.filter((c) => {
    if (c.cadenceKind === "monitor_only") return false;
    const has = upcomingForTouchCheck.some((e) => eventTouchesUserInWeek(e, c.userId, weekEnd));
    return !has;
  });

  const coachingCadenceAlignedCount = coachingCadenceOverlap(coachingAttention, cadenceAttention).size;

  return {
    upcomingEvents,
    recentPastEvents,
    overdueTasks,
    upcomingTasks,
    cadenceRows,
    cadenceAttention,
    cadenceWithoutUpcomingTouch,
    coachingCadenceAlignedCount,
    stats,
  };
}
