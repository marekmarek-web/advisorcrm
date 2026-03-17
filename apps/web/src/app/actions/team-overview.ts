"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import {
  memberships,
  roles,
  contracts,
  events,
  tasks,
  opportunities,
  activityLog,
  financialAnalyses,
  userProfiles,
  teamGoals,
} from "db";
import { eq, and, gte, lt, isNull, isNotNull, sql, desc, asc, inArray } from "db";

export type TeamOverviewPeriod = "week" | "month" | "quarter";

const NEWCOMER_DAYS = 90;

export type TeamOverviewKpis = {
  memberCount: number;
  activeMemberCount: number;
  unitsThisPeriod: number;
  productionThisPeriod: number;
  meetingsThisWeek: number;
  newcomersInAdaptation: number;
  riskyMemberCount: number;
  periodLabel: string;
  previousPeriodLabel: string;
  unitsTrend: number;
  productionTrend: number;
  meetingsTrend: number;
  teamGoalTarget: number | null;
  teamGoalActual: number | null;
  teamGoalProgressPercent: number | null;
  teamGoalType: "units" | "production" | "meetings" | null;
};

function getPeriodRange(
  period: TeamOverviewPeriod,
  refDate?: Date
): { start: Date; end: Date; label: string } {
  const ref = refDate ?? new Date();
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();

  if (period === "week") {
    const day = ref.getDay();
    const monOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(ref);
    start.setDate(d + monOffset);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end, label: `Týden ${start.getDate()}.–${end.getDate() - 1}.${m + 1}.` };
  }
  if (period === "month") {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    const label = start.toLocaleString("cs-CZ", { month: "long", year: "numeric" });
    return { start, end, label };
  }
  const q = Math.floor(m / 3);
  const start = new Date(y, q * 3, 1);
  const end = new Date(y, q * 3 + 3, 1);
  return { start, end, label: `Q${q + 1} ${y}` };
}

export async function getTeamOverviewKpis(
  period: TeamOverviewPeriod = "month"
): Promise<TeamOverviewKpis | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");

  const { start, end, label } = getPeriodRange(period);
  const prev = getPeriodRange(period, new Date(start.getTime() - 1));
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const prevStartStr = prev.start.toISOString().slice(0, 10);
  const prevEndStr = prev.end.toISOString().slice(0, 10);

  const alertsPromise = getTeamAlerts(period).catch(() => [] as TeamAlert[]);
  const [memberRows, activeCountRows, contractsCurrent, contractsPrev, meetingsThisWeekRows, newcomerCountRows, alertsRows] = await Promise.all([
    db.select({ userId: memberships.userId }).from(memberships).innerJoin(roles, eq(memberships.roleId, roles.id)).where(and(eq(memberships.tenantId, auth.tenantId), inArray(roles.name, ["Admin", "Manager", "Advisor", "Viewer"]))),
    db.select({ userId: activityLog.userId }).from(activityLog).where(and(eq(activityLog.tenantId, auth.tenantId), gte(activityLog.createdAt, start), lt(activityLog.createdAt, end))).groupBy(activityLog.userId),
    db.select({ count: sql<number>`count(*)::int`, totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`, totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)` }).from(contracts).where(and(eq(contracts.tenantId, auth.tenantId), gte(contracts.startDate, startStr), lt(contracts.startDate, endStr))),
    db.select({ count: sql<number>`count(*)::int`, totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`, totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)` }).from(contracts).where(and(eq(contracts.tenantId, auth.tenantId), gte(contracts.startDate, prevStartStr), lt(contracts.startDate, prevEndStr))),
    db.select({ id: events.id }).from(events).where(and(eq(events.tenantId, auth.tenantId), eq(events.eventType, "schuzka"), gte(events.startAt, weekStart), lt(events.startAt, weekEnd))),
    db.select({ userId: memberships.userId }).from(memberships).innerJoin(roles, eq(memberships.roleId, roles.id)).where(and(eq(memberships.tenantId, auth.tenantId), inArray(roles.name, ["Admin", "Manager", "Advisor", "Viewer"]), gte(memberships.joinedAt, new Date(now.getTime() - NEWCOMER_DAYS * 24 * 60 * 60 * 1000)))),
    alertsPromise,
  ]);

  const memberCount = memberRows.length;
  const activeMemberCount = new Set(activeCountRows.map((r) => r.userId)).size;
  const unitsThisPeriod = Number(contractsCurrent[0]?.count ?? 0);
  const productionThisPeriod = Number(contractsCurrent[0]?.totalAnnual ?? contractsCurrent[0]?.totalPremium ?? 0) || Number(contractsCurrent[0]?.totalPremium ?? 0);
  const meetingsThisWeek = meetingsThisWeekRows.length;
  const newcomersInAdaptation = newcomerCountRows.length;
  const riskyMemberCount = alertsRows.length > 0 ? new Set(alertsRows.map((a) => a.memberId)).size : 0;

  const prevUnits = Number(contractsPrev[0]?.count ?? 0);
  const prevProduction = Number(contractsPrev[0]?.totalAnnual ?? contractsPrev[0]?.totalPremium ?? 0) || Number(contractsPrev[0]?.totalPremium ?? 0);

  const periodYear = start.getFullYear();
  const periodMonth = period === "month" ? start.getMonth() + 1 : Math.floor(start.getMonth() / 3) + 1;
  const goalRows = await db
    .select({ goalType: teamGoals.goalType, targetValue: teamGoals.targetValue })
    .from(teamGoals)
    .where(
      and(
        eq(teamGoals.tenantId, auth.tenantId),
        eq(teamGoals.period, period),
        eq(teamGoals.year, periodYear),
        eq(teamGoals.month, periodMonth)
      )
    )
    .limit(1);
  const goal = goalRows[0];
  let teamGoalTarget: number | null = null;
  let teamGoalActual: number | null = null;
  let teamGoalProgressPercent: number | null = null;
  let teamGoalType: "units" | "production" | "meetings" | null = null;
  if (goal && goal.targetValue > 0) {
    teamGoalType = goal.goalType as "units" | "production" | "meetings";
    teamGoalTarget = goal.targetValue;
    if (goal.goalType === "units") teamGoalActual = unitsThisPeriod;
    else if (goal.goalType === "production") teamGoalActual = Math.round(productionThisPeriod);
    else if (goal.goalType === "meetings") teamGoalActual = meetingsThisWeek;
    if (teamGoalActual != null && teamGoalTarget != null) {
      teamGoalProgressPercent = Math.round((teamGoalActual / teamGoalTarget) * 100);
    }
  }

  return {
    memberCount,
    activeMemberCount,
    unitsThisPeriod,
    productionThisPeriod,
    meetingsThisWeek,
    newcomersInAdaptation,
    riskyMemberCount,
    periodLabel: label,
    previousPeriodLabel: prev.label,
    unitsTrend: unitsThisPeriod - prevUnits,
    productionTrend: productionThisPeriod - prevProduction,
    meetingsTrend: meetingsThisWeek,
    teamGoalTarget,
    teamGoalActual,
    teamGoalProgressPercent,
    teamGoalType,
  };
}

export type TeamMemberInfo = {
  userId: string;
  membershipId: string;
  roleName: string;
  joinedAt: Date;
  displayName: string | null;
  email: string | null;
};

export async function listTeamMembersWithNames(): Promise<TeamMemberInfo[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");

  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      roleName: roles.name,
      joinedAt: memberships.joinedAt,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .leftJoin(userProfiles, eq(memberships.userId, userProfiles.userId))
    .where(and(eq(memberships.tenantId, auth.tenantId), inArray(roles.name, ["Admin", "Manager", "Advisor", "Viewer"])))
    .orderBy(memberships.joinedAt);

  return rows.map((r) => ({
    userId: r.userId,
    membershipId: r.membershipId,
    roleName: r.roleName,
    joinedAt: r.joinedAt,
    displayName: r.fullName?.trim() || null,
    email: r.email?.trim() || null,
  }));
}

export type TeamMemberMetrics = {
  userId: string;
  roleName: string;
  joinedAt: Date;
  unitsThisPeriod: number;
  productionThisPeriod: number;
  meetingsThisPeriod: number;
  activityCount: number;
  tasksOpen: number;
  tasksCompleted: number;
  opportunitiesOpen: number;
  lastActivityAt: Date | null;
  daysWithoutActivity: number;
  unitsTrend: number;
  productionTrend: number;
  riskLevel: "ok" | "warning" | "critical";
};

export async function getTeamMemberMetrics(
  period: TeamOverviewPeriod = "month"
): Promise<TeamMemberMetrics[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");

  const { start, end } = getPeriodRange(period);
  const prev = getPeriodRange(period, new Date(start.getTime() - 1));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const prevStartStr = prev.start.toISOString().slice(0, 10);
  const prevEndStr = prev.end.toISOString().slice(0, 10);

  const memberRows = await db
    .select({ userId: memberships.userId, roleName: roles.name, joinedAt: memberships.joinedAt })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(and(eq(memberships.tenantId, auth.tenantId), inArray(roles.name, ["Admin", "Manager", "Advisor", "Viewer"])));

  const alerts = await getTeamAlerts(period);
  const alertUserIds = new Set(alerts.map((a) => a.memberId));
  const criticalUserIds = new Set(alerts.filter((a) => a.severity === "critical").map((a) => a.memberId));

  const result: TeamMemberMetrics[] = [];

  for (const mem of memberRows) {
    const [contractsCur, contractsPrevRow, eventsCount, activityCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int`, totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`, totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)` }).from(contracts).where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.advisorId, mem.userId), gte(contracts.startDate, startStr), lt(contracts.startDate, endStr))),
      db.select({ count: sql<number>`count(*)::int`, totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`, totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)` }).from(contracts).where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.advisorId, mem.userId), gte(contracts.startDate, prevStartStr), lt(contracts.startDate, prevEndStr))),
      db.select({ id: events.id }).from(events).where(and(eq(events.tenantId, auth.tenantId), eq(events.assignedTo, mem.userId), gte(events.startAt, start), lt(events.startAt, end))),
      db.select({ id: activityLog.id }).from(activityLog).where(and(eq(activityLog.tenantId, auth.tenantId), eq(activityLog.userId, mem.userId), gte(activityLog.createdAt, start), lt(activityLog.createdAt, end))),
    ]);
    const [lastActivity, tasksOpen, tasksDone, oppsOpen] = await Promise.all([
      db.select({ createdAt: activityLog.createdAt }).from(activityLog).where(and(eq(activityLog.tenantId, auth.tenantId), eq(activityLog.userId, mem.userId))).orderBy(desc(activityLog.createdAt)).limit(1),
      db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.assignedTo, mem.userId), isNull(tasks.completedAt))),
      db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.assignedTo, mem.userId), isNotNull(tasks.completedAt))),
      db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.assignedTo, mem.userId), isNull(opportunities.closedAt))),
    ]);

    const unitsThisPeriod = Number(contractsCur[0]?.count ?? 0);
    const productionThisPeriod = Number(contractsCur[0]?.totalAnnual ?? contractsCur[0]?.totalPremium ?? 0) || Number(contractsCur[0]?.totalPremium ?? 0);
    const prevUnits = Number(contractsPrevRow[0]?.count ?? 0);
    const prevProduction = Number(contractsPrevRow[0]?.totalAnnual ?? contractsPrevRow[0]?.totalPremium ?? 0) || Number(contractsPrevRow[0]?.totalPremium ?? 0);
    const lastActivityAt = lastActivity[0]?.createdAt ?? null;
    const now = new Date();
    const daysWithoutActivity = lastActivityAt
      ? Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    let riskLevel: "ok" | "warning" | "critical" = "ok";
    if (criticalUserIds.has(mem.userId)) riskLevel = "critical";
    else if (alertUserIds.has(mem.userId)) riskLevel = "warning";

    result.push({
      userId: mem.userId,
      roleName: mem.roleName,
      joinedAt: mem.joinedAt,
      unitsThisPeriod,
      productionThisPeriod,
      meetingsThisPeriod: eventsCount.length,
      activityCount: activityCount.length,
      tasksOpen: tasksOpen.length,
      tasksCompleted: tasksDone.length,
      opportunitiesOpen: oppsOpen.length,
      lastActivityAt,
      daysWithoutActivity: Math.min(daysWithoutActivity, 999),
      unitsTrend: unitsThisPeriod - prevUnits,
      productionTrend: productionThisPeriod - prevProduction,
      riskLevel,
    });
  }

  return result;
}

export type TeamAlert = {
  memberId: string;
  type: string;
  severity: "warning" | "critical";
  title: string;
  description: string;
  createdAt: Date;
};

export async function getTeamAlerts(period: TeamOverviewPeriod = "month"): Promise<TeamAlert[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");

  const alerts: TeamAlert[] = [];
  const now = new Date();
  const periodStart = getPeriodRange(period).start;
  const periodEnd = getPeriodRange(period).end;
  const prevRange = getPeriodRange(period, new Date(periodStart.getTime() - 1));
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr = periodEnd.toISOString().slice(0, 10);
  const prevStartStr = prevRange.start.toISOString().slice(0, 10);
  const prevEndStr = prevRange.end.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const memberRows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(and(eq(memberships.tenantId, auth.tenantId), inArray(roles.name, ["Admin", "Manager", "Advisor", "Viewer"])));

  for (const mem of memberRows) {
    const [lastActivity, lastMeeting, activityCount, contractsCur, contractsPrev, tasksOpen, oppsOpen] = await Promise.all([
      db.select({ createdAt: activityLog.createdAt }).from(activityLog).where(and(eq(activityLog.tenantId, auth.tenantId), eq(activityLog.userId, mem.userId))).orderBy(desc(activityLog.createdAt)).limit(1),
      db.select({ startAt: events.startAt }).from(events).where(and(eq(events.tenantId, auth.tenantId), eq(events.assignedTo, mem.userId), eq(events.eventType, "schuzka"))).orderBy(desc(events.startAt)).limit(1),
      db.select({ id: activityLog.id }).from(activityLog).where(and(eq(activityLog.tenantId, auth.tenantId), eq(activityLog.userId, mem.userId), gte(activityLog.createdAt, thirtyDaysAgo))),
      db.select({ totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`, totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)` }).from(contracts).where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.advisorId, mem.userId), gte(contracts.startDate, startStr), lt(contracts.startDate, endStr))),
      db.select({ totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`, totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)` }).from(contracts).where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.advisorId, mem.userId), gte(contracts.startDate, prevStartStr), lt(contracts.startDate, prevEndStr))),
      db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.assignedTo, mem.userId), isNull(tasks.completedAt))),
      db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.assignedTo, mem.userId), isNull(opportunities.closedAt))),
    ]);

    const lastActivityAt = lastActivity[0]?.createdAt;
    const lastMeetingAt = lastMeeting[0]?.startAt;
    const daysSinceActivity = lastActivityAt
      ? Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / (24 * 60 * 60 * 1000))
      : 999;
    const daysSinceMeeting = lastMeetingAt
      ? Math.floor((now.getTime() - new Date(lastMeetingAt).getTime()) / (24 * 60 * 60 * 1000))
      : 999;
    const productionCur = Number(contractsCur[0]?.totalAnnual ?? contractsCur[0]?.totalPremium ?? 0) || Number(contractsCur[0]?.totalPremium ?? 0);
    const productionPrev = Number(contractsPrev[0]?.totalAnnual ?? contractsPrev[0]?.totalPremium ?? 0) || Number(contractsPrev[0]?.totalPremium ?? 0);
    const tasksOpenCount = tasksOpen.length;
    const oppsOpenCount = oppsOpen.length;

    if (daysSinceActivity >= 7) {
      alerts.push({
        memberId: mem.userId,
        type: "no_activity",
        severity: daysSinceActivity >= 14 ? "critical" : "warning",
        title: `${daysSinceActivity} dní bez aktivity`,
        description: "Člen týmu dlouho neevidoval aktivitu v CRM.",
        createdAt: now,
      });
    }
    if (daysSinceMeeting >= 14) {
      alerts.push({
        memberId: mem.userId,
        type: "no_meeting",
        severity: daysSinceMeeting >= 21 ? "critical" : "warning",
        title: `${daysSinceMeeting} dní bez schůzky`,
        description: "Žádná evidovaná schůzka.",
        createdAt: now,
      });
    }
    if (activityCount.length < 3) {
      if (activityCount.length === 0) {
        alerts.push({
          memberId: mem.userId,
          type: "low_crm_usage",
          severity: "warning",
          title: "Velmi nízká aktivita v CRM",
          description: "Za posledních 30 dní téměř žádná aktivita.",
          createdAt: now,
        });
      } else if (activityCount.length < 3 && daysSinceActivity >= 7) {
        alerts.push({
          memberId: mem.userId,
          type: "weak_crm_discipline",
          severity: "warning",
          title: "Slabá CRM disciplína",
          description: "Za 30 dní jen několik záznamů aktivity.",
          createdAt: now,
        });
      }
    }
    if (productionPrev > 1000 && productionCur < productionPrev * 0.5) {
      alerts.push({
        memberId: mem.userId,
        type: "production_drop",
        severity: productionCur < productionPrev * 0.25 ? "critical" : "warning",
        title: "Výrazný pokles výkonu",
        description: `Produkce oproti předchozímu období klesla (${Math.round(productionCur)} vs ${Math.round(productionPrev)}).`,
        createdAt: now,
      });
    }
    if (oppsOpenCount > 0 && daysSinceActivity >= 7) {
      alerts.push({
        memberId: mem.userId,
        type: "cases_no_action",
        severity: daysSinceActivity >= 14 ? "critical" : "warning",
        title: "Případy bez další akce",
        description: "Otevřené případy a dlouho žádná aktivita.",
        createdAt: now,
      });
    }
    if (tasksOpenCount >= 10 && daysSinceMeeting >= 7) {
      alerts.push({
        memberId: mem.userId,
        type: "weak_followup",
        severity: tasksOpenCount >= 20 ? "critical" : "warning",
        title: "Slabý follow-up",
        description: "Mnoho otevřených úkolů a dlouho žádná schůzka.",
        createdAt: now,
      });
    }
  }

  return alerts;
}

export type AdaptationStep = {
  key: string;
  label: string;
  completed: boolean;
  completedAt: Date | null;
};

export type NewcomerAdaptation = {
  userId: string;
  joinedAt: Date;
  daysInTeam: number;
  adaptationScore: number;
  adaptationStatus: "Začíná" | "V adaptaci" | "Aktivní" | "Stabilizovaný" | "Rizikový";
  checklist: AdaptationStep[];
  lastActivityAt: Date | null;
  warnings: string[];
};

/** Weights by category: profil/setup, aktivita, schůzky, analýza, obchod, pravidelnost. Sum = 100. */
const ADAPTATION_WEIGHTS: Record<string, number> = {
  profile_created: 10,
  first_activity: 15,
  first_meeting: 20,
  first_analysis: 15,
  first_contract: 25,
  regular_crm: 15,
};

function getStepLabel(key: string): string {
  const labels: Record<string, string> = {
    profile_created: "Profil vytvořen",
    first_activity: "První aktivita",
    first_meeting: "První schůzka",
    first_analysis: "První analýza",
    first_contract: "První obchod",
    regular_crm: "Pravidelná práce v CRM",
  };
  return labels[key] ?? key;
}

export async function getNewcomerAdaptation(): Promise<NewcomerAdaptation[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NEWCOMER_DAYS);

  const newcomerRows = await db
    .select({ userId: memberships.userId, joinedAt: memberships.joinedAt })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(
      and(
        eq(memberships.tenantId, auth.tenantId),
        inArray(roles.name, ["Advisor", "Manager"]),
        gte(memberships.joinedAt, cutoff)
      )
    );

  const result: NewcomerAdaptation[] = [];

  for (const row of newcomerRows) {
    const joinedAt = new Date(row.joinedAt);
    const daysInTeam = Math.floor((Date.now() - joinedAt.getTime()) / (24 * 60 * 60 * 1000));

    const [firstActivity, lastActivityRow, firstMeeting, firstAnalysis, firstContract, recentActivity] = await Promise.all([
      db.select({ createdAt: activityLog.createdAt }).from(activityLog).where(and(eq(activityLog.tenantId, auth.tenantId), eq(activityLog.userId, row.userId))).orderBy(asc(activityLog.createdAt)).limit(1),
      db.select({ createdAt: activityLog.createdAt }).from(activityLog).where(and(eq(activityLog.tenantId, auth.tenantId), eq(activityLog.userId, row.userId))).orderBy(desc(activityLog.createdAt)).limit(1),
      db.select({ startAt: events.startAt }).from(events).where(and(eq(events.tenantId, auth.tenantId), eq(events.assignedTo, row.userId))).orderBy(asc(events.startAt)).limit(1),
      db.select({ createdAt: financialAnalyses.createdAt }).from(financialAnalyses).where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.createdBy, row.userId))).orderBy(asc(financialAnalyses.createdAt)).limit(1),
      db.select({ startDate: contracts.startDate }).from(contracts).where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.advisorId, row.userId))).orderBy(contracts.startDate).limit(1),
      db.select({ id: activityLog.id }).from(activityLog).where(and(eq(activityLog.tenantId, auth.tenantId), eq(activityLog.userId, row.userId), gte(activityLog.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))),
    ]);

    const checklist: AdaptationStep[] = [
      { key: "profile_created", label: getStepLabel("profile_created"), completed: true, completedAt: joinedAt },
      {
        key: "first_activity",
        label: getStepLabel("first_activity"),
        completed: firstActivity.length > 0,
        completedAt: firstActivity[0]?.createdAt ?? null,
      },
      {
        key: "first_meeting",
        label: getStepLabel("first_meeting"),
        completed: firstMeeting.length > 0,
        completedAt: firstMeeting[0]?.startAt ?? null,
      },
      {
        key: "first_analysis",
        label: getStepLabel("first_analysis"),
        completed: firstAnalysis.length > 0,
        completedAt: firstAnalysis[0]?.createdAt ?? null,
      },
      {
        key: "first_contract",
        label: getStepLabel("first_contract"),
        completed: firstContract.length > 0,
        completedAt: firstContract[0]?.startDate ? new Date(firstContract[0].startDate) : null,
      },
      {
        key: "regular_crm",
        label: getStepLabel("regular_crm"),
        completed: recentActivity.length >= 5,
        completedAt: recentActivity.length >= 5 ? new Date() : null,
      },
    ];

    const weightedScore = checklist.reduce(
      (sum, s) => sum + (s.completed ? (ADAPTATION_WEIGHTS[s.key] ?? 0) : 0),
      0
    );
    const adaptationScore = Math.round(weightedScore);
    let adaptationStatus: NewcomerAdaptation["adaptationStatus"] = "Začíná";
    if (adaptationScore >= 90) adaptationStatus = "Stabilizovaný";
    else if (adaptationScore >= 70) adaptationStatus = "Aktivní";
    else if (adaptationScore >= 40) adaptationStatus = "V adaptaci";
    else if (daysInTeam > 30 && adaptationScore < 30) adaptationStatus = "Rizikový";
    else adaptationStatus = "V adaptaci";

    const lastActivityAt = lastActivityRow.length > 0 ? lastActivityRow[0].createdAt : null;
    const warnings: string[] = [];
    if (daysInTeam >= 14 && !firstMeeting.length) warnings.push("Zatím žádná schůzka");
    if (daysInTeam >= 30 && !firstContract.length) warnings.push("Zatím žádný uzavřený obchod");
    if (recentActivity.length < 2 && daysInTeam >= 7) warnings.push("Nízká aktivita v CRM");

    result.push({
      userId: row.userId,
      joinedAt,
      daysInTeam,
      adaptationScore,
      adaptationStatus,
      checklist,
      lastActivityAt,
      warnings,
    });
  }

  return result;
}

export type TeamPerformancePoint = {
  label: string;
  units: number;
  production: number;
};

/** Last 6 periods (months or weeks) for chart. */
export async function getTeamPerformanceOverTime(
  period: TeamOverviewPeriod = "month"
): Promise<TeamPerformancePoint[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");

  const points: TeamPerformancePoint[] = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const ref = new Date(now);
    if (period === "month") {
      ref.setMonth(ref.getMonth() - i);
    } else if (period === "quarter") {
      ref.setMonth(ref.getMonth() - i * 3);
    } else {
      ref.setDate(ref.getDate() - i * 7);
    }
    const { start, end, label } = getPeriodRange(period, ref);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const rows = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
        totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, auth.tenantId),
          gte(contracts.startDate, startStr),
          lt(contracts.startDate, endStr)
        )
      );
    const units = Number(rows[0]?.count ?? 0);
    const production = Number(rows[0]?.totalAnnual ?? rows[0]?.totalPremium ?? 0) || Number(rows[0]?.totalPremium ?? 0);
    points.push({ label, units, production });
  }

  return points;
}

export type TeamMemberDetail = {
  userId: string;
  roleName: string;
  joinedAt: Date;
  displayName: string | null;
  email: string | null;
  metrics: TeamMemberMetrics | null;
  performanceOverTime: TeamPerformancePoint[];
  adaptation: NewcomerAdaptation | null;
  alerts: TeamAlert[];
};

export async function getTeamMemberDetail(userId: string): Promise<TeamMemberDetail | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");

  const memberRows = await db
    .select({ userId: memberships.userId, roleName: roles.name, joinedAt: memberships.joinedAt })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(
      and(
        eq(memberships.tenantId, auth.tenantId),
        eq(memberships.userId, userId),
        inArray(roles.name, ["Admin", "Manager", "Advisor", "Viewer"])
      )
    );
  const member = memberRows[0];
  if (!member) return null;

  const [profileRows, metricsList, alerts, newcomers, perf] = await Promise.all([
    db.select({ fullName: userProfiles.fullName, email: userProfiles.email }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
    getTeamMemberMetrics("month"),
    getTeamAlerts("month"),
    getNewcomerAdaptation(),
    getTeamPerformanceOverTime("month"),
  ]);
  const profile = profileRows[0];
  const displayName = profile?.fullName?.trim() || null;
  const email = profile?.email?.trim() || null;

  const metrics = metricsList.find((m) => m.userId === userId) ?? null;
  const memberAlerts = alerts.filter((a) => a.memberId === userId);
  const adaptation = newcomers.find((n) => n.userId === userId) ?? null;

  const advisorPoints: TeamPerformancePoint[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(now);
    ref.setMonth(ref.getMonth() - i);
    const { start, end, label } = getPeriodRange("month", ref);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const rows = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
        totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, auth.tenantId),
          eq(contracts.advisorId, userId),
          gte(contracts.startDate, startStr),
          lt(contracts.startDate, endStr)
        )
      );
    const units = Number(rows[0]?.count ?? 0);
    const production = Number(rows[0]?.totalAnnual ?? rows[0]?.totalPremium ?? 0) || Number(rows[0]?.totalPremium ?? 0);
    advisorPoints.push({ label, units, production });
  }

  return {
    userId: member.userId,
    roleName: member.roleName,
    joinedAt: member.joinedAt,
    displayName,
    email,
    metrics,
    performanceOverTime: advisorPoints,
    adaptation,
    alerts: memberAlerts,
  };
}
