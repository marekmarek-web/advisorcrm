"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import {
  getTeamTree,
  getVisibleUserIds,
  listTenantHierarchyMembers,
  resolveScopeForRole,
  type TeamOverviewScope,
  type TeamTreeNode,
} from "@/lib/team-hierarchy";
import { db } from "db";
import {
  contracts,
  events,
  tasks,
  opportunities,
  activityLog,
  financialAnalyses,
  userProfiles,
  teamGoals,
  memberships,
  roles,
} from "db";
import { evaluateCareerProgress } from "@/lib/career";
import type { CareerEvaluationResult } from "@/lib/career/types";
import { eq, and, gte, lt, isNull, isNotNull, sql, desc, asc, inArray } from "db";

export type TeamOverviewPeriod = "week" | "month" | "quarter";

const NEWCOMER_DAYS = 90;
const TEAM_ROLE_NAMES = ["Admin", "Director", "Manager", "Advisor", "Viewer"] as const;

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
  callsThisPeriod: number;
  newContactsThisPeriod: number;
  followUpsThisPeriod: number;
  closedDealsThisPeriod: number;
  pipelineValue: number;
  conversionRate: number;
  scope: TeamOverviewScope;
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

export type TeamMemberInfo = {
  userId: string;
  membershipId: string;
  roleName: string;
  joinedAt: Date;
  displayName: string | null;
  email: string | null;
  parentId: string | null;
  managerName: string | null;
  careerProgram: string | null;
  careerTrack: string | null;
  careerPositionCode: string | null;
};

export type TeamMemberMetrics = {
  userId: string;
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
};

async function getScopeContext(scope?: TeamOverviewScope) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) throw new Error("Forbidden");
  const resolvedScope = resolveScopeForRole(auth.roleName as RoleName, scope);
  const tenantMembers = await listTenantHierarchyMembers(auth.tenantId);
  const visibleUserIds = await getVisibleUserIds(auth.tenantId, auth.userId, auth.roleName as RoleName, resolvedScope);
  const visibleSet = new Set(visibleUserIds);
  const visibleMembers = tenantMembers.filter((m) => visibleSet.has(m.userId));
  return { auth, scope: resolvedScope, tenantMembers, visibleUserIds, visibleSet, visibleMembers };
}

function toDateRangeStr(start: Date, end: Date): { startStr: string; endStr: string } {
  return { startStr: start.toISOString().slice(0, 10), endStr: end.toISOString().slice(0, 10) };
}

type UserStats = {
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
  activityCount: number;
  tasksOpen: number;
  tasksCompleted: number;
  opportunitiesOpen: number;
  lastActivityAt: Date | null;
  daysWithoutActivity: number;
  daysSinceMeeting: number;
  unitsTrend: number;
  productionTrend: number;
  meetingsTrend: number;
};

async function collectUserStats(
  tenantId: string,
  userId: string,
  period: TeamOverviewPeriod
): Promise<UserStats> {
  const now = new Date();
  const current = getPeriodRange(period);
  const previous = getPeriodRange(period, new Date(current.start.getTime() - 1));
  const { startStr, endStr } = toDateRangeStr(current.start, current.end);
  const { startStr: prevStartStr, endStr: prevEndStr } = toDateRangeStr(previous.start, previous.end);

  const [
    contractsCur,
    contractsPrev,
    eventCurRows,
    eventPrevRows,
    activityCurRows,
    lastActivityRows,
    lastMeetingRows,
    tasksOpenRows,
    tasksDoneTotalRows,
    tasksDonePeriodRows,
    oppOpenRows,
    oppClosedRows,
    oppWonRows,
    pipelineRows,
    newContactsRows,
  ] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)::int`,
        totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
        totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`,
      })
      .from(contracts)
      .where(and(eq(contracts.tenantId, tenantId), eq(contracts.advisorId, userId), gte(contracts.startDate, startStr), lt(contracts.startDate, endStr))),
    db
      .select({
        count: sql<number>`count(*)::int`,
        totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
        totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`,
      })
      .from(contracts)
      .where(and(eq(contracts.tenantId, tenantId), eq(contracts.advisorId, userId), gte(contracts.startDate, prevStartStr), lt(contracts.startDate, prevEndStr))),
    db
      .select({ eventType: events.eventType })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.assignedTo, userId), gte(events.startAt, current.start), lt(events.startAt, current.end))),
    db
      .select({ eventType: events.eventType })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.assignedTo, userId), gte(events.startAt, previous.start), lt(events.startAt, previous.end))),
    db
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(and(eq(activityLog.tenantId, tenantId), eq(activityLog.userId, userId), gte(activityLog.createdAt, current.start), lt(activityLog.createdAt, current.end))),
    db
      .select({ createdAt: activityLog.createdAt })
      .from(activityLog)
      .where(and(eq(activityLog.tenantId, tenantId), eq(activityLog.userId, userId)))
      .orderBy(desc(activityLog.createdAt))
      .limit(1),
    db
      .select({ startAt: events.startAt })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.assignedTo, userId), eq(events.eventType, "schuzka")))
      .orderBy(desc(events.startAt))
      .limit(1),
    db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.assignedTo, userId), isNull(tasks.completedAt))),
    db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.assignedTo, userId), isNotNull(tasks.completedAt))),
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.assignedTo, userId), isNotNull(tasks.completedAt), gte(tasks.completedAt, current.start), lt(tasks.completedAt, current.end))),
    db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.assignedTo, userId), isNull(opportunities.closedAt))),
    db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.assignedTo, userId), isNotNull(opportunities.closedAt), gte(opportunities.closedAt, current.start), lt(opportunities.closedAt, current.end))),
    db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.assignedTo, userId), eq(opportunities.closedAs, "won"), isNotNull(opportunities.closedAt), gte(opportunities.closedAt, current.start), lt(opportunities.closedAt, current.end))),
    db
      .select({ sumExpected: sql<number>`coalesce(sum(${opportunities.expectedValue}::numeric), 0)` })
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.assignedTo, userId), isNull(opportunities.closedAt))),
    db
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.tenantId, tenantId),
          eq(activityLog.userId, userId),
          eq(activityLog.entityType, "contact"),
          eq(activityLog.action, "create"),
          gte(activityLog.createdAt, current.start),
          lt(activityLog.createdAt, current.end)
        )
      ),
  ]);

  const unitsThisPeriod = Number(contractsCur[0]?.count ?? 0);
  const productionThisPeriod = Number(contractsCur[0]?.totalAnnual ?? contractsCur[0]?.totalPremium ?? 0) || Number(contractsCur[0]?.totalPremium ?? 0);
  const prevUnits = Number(contractsPrev[0]?.count ?? 0);
  const prevProduction = Number(contractsPrev[0]?.totalAnnual ?? contractsPrev[0]?.totalPremium ?? 0) || Number(contractsPrev[0]?.totalPremium ?? 0);

  const meetingsThisPeriod = eventCurRows.filter((r) => r.eventType === "schuzka").length;
  const meetingsPrev = eventPrevRows.filter((r) => r.eventType === "schuzka").length;
  const callsThisPeriod = eventCurRows.filter((r) => r.eventType === "telefonat").length;
  const lastActivityAt = lastActivityRows[0]?.createdAt ?? null;
  const lastMeetingAt = lastMeetingRows[0]?.startAt ?? null;
  const daysWithoutActivity = lastActivityAt ? Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / (24 * 60 * 60 * 1000)) : 999;
  const daysSinceMeeting = lastMeetingAt ? Math.floor((now.getTime() - new Date(lastMeetingAt).getTime()) / (24 * 60 * 60 * 1000)) : 999;
  const closedOpportunities = oppClosedRows.length;
  const wonOpportunities = oppWonRows.length;
  const conversionRate = closedOpportunities > 0 ? wonOpportunities / closedOpportunities : 0;
  const closedDealsThisPeriod = unitsThisPeriod;
  return {
    unitsThisPeriod,
    productionThisPeriod,
    meetingsThisPeriod,
    callsThisPeriod,
    newContactsThisPeriod: newContactsRows.length,
    followUpsThisPeriod: tasksDonePeriodRows.length,
    closedDealsThisPeriod,
    closedOpportunitiesThisPeriod: closedOpportunities,
    conversionRate,
    pipelineValue: Number(pipelineRows[0]?.sumExpected ?? 0),
    activityCount: activityCurRows.length,
    tasksOpen: tasksOpenRows.length,
    tasksCompleted: tasksDoneTotalRows.length,
    opportunitiesOpen: oppOpenRows.length,
    lastActivityAt,
    daysWithoutActivity: Math.min(daysWithoutActivity, 999),
    daysSinceMeeting: Math.min(daysSinceMeeting, 999),
    unitsTrend: unitsThisPeriod - prevUnits,
    productionTrend: productionThisPeriod - prevProduction,
    meetingsTrend: meetingsThisPeriod - meetingsPrev,
  };
}

function buildAlertsFromMetric(metric: TeamMemberMetrics): TeamAlert[] {
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
  return alerts;
}

export async function getTeamOverviewKpis(
  period: TeamOverviewPeriod = "month",
  scope?: TeamOverviewScope
): Promise<TeamOverviewKpis | null> {
  const ctx = await getScopeContext(scope);
  const { start, end, label } = getPeriodRange(period);
  const prev = getPeriodRange(period, new Date(start.getTime() - 1));
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const [metrics, alerts, newcomers, activeCountRows, meetingsThisWeekRows] = await Promise.all([
    getTeamMemberMetrics(period, ctx.scope),
    getTeamAlerts(period, ctx.scope),
    getNewcomerAdaptation(ctx.scope),
    db
      .select({ userId: activityLog.userId })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.tenantId, ctx.auth.tenantId),
          inArray(activityLog.userId, ctx.visibleUserIds),
          gte(activityLog.createdAt, start),
          lt(activityLog.createdAt, end)
        )
      )
      .groupBy(activityLog.userId),
    db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.tenantId, ctx.auth.tenantId),
          inArray(events.assignedTo, ctx.visibleUserIds),
          eq(events.eventType, "schuzka"),
          gte(events.startAt, weekStart),
          lt(events.startAt, weekEnd)
        )
      ),
  ]);

  const unitsThisPeriod = metrics.reduce((sum, m) => sum + m.unitsThisPeriod, 0);
  const productionThisPeriod = metrics.reduce((sum, m) => sum + m.productionThisPeriod, 0);
  const unitsTrend = metrics.reduce((sum, m) => sum + m.unitsTrend, 0);
  const productionTrend = metrics.reduce((sum, m) => sum + m.productionTrend, 0);
  const callsThisPeriod = metrics.reduce((sum, m) => sum + m.callsThisPeriod, 0);
  const newContactsThisPeriod = metrics.reduce((sum, m) => sum + m.newContactsThisPeriod, 0);
  const followUpsThisPeriod = metrics.reduce((sum, m) => sum + m.followUpsThisPeriod, 0);
  const closedDealsThisPeriod = metrics.reduce((sum, m) => sum + m.closedDealsThisPeriod, 0);
  const pipelineValue = metrics.reduce((sum, m) => sum + m.pipelineValue, 0);
  const closedOppTotal = metrics.reduce((sum, m) => sum + m.closedOpportunitiesThisPeriod, 0);
  const conversionRate = closedOppTotal > 0 ? metrics.reduce((sum, m) => sum + m.conversionRate * m.closedOpportunitiesThisPeriod, 0) / closedOppTotal : 0;

  const periodYear = start.getFullYear();
  const periodMonth = period === "month" ? start.getMonth() + 1 : Math.floor(start.getMonth() / 3) + 1;
  const goalRows = await db
    .select({ goalType: teamGoals.goalType, targetValue: teamGoals.targetValue })
    .from(teamGoals)
    .where(and(eq(teamGoals.tenantId, ctx.auth.tenantId), eq(teamGoals.period, period), eq(teamGoals.year, periodYear), eq(teamGoals.month, periodMonth)))
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
    else if (goal.goalType === "meetings") teamGoalActual = meetingsThisWeekRows.length;
    if (teamGoalActual != null) {
      teamGoalProgressPercent = Math.round((teamGoalActual / teamGoalTarget) * 100);
    }
  }

  return {
    memberCount: ctx.visibleMembers.length,
    activeMemberCount: new Set(activeCountRows.map((r) => r.userId)).size,
    unitsThisPeriod,
    productionThisPeriod,
    meetingsThisWeek: meetingsThisWeekRows.length,
    newcomersInAdaptation: newcomers.length,
    riskyMemberCount: new Set(alerts.map((a) => a.memberId)).size,
    periodLabel: label,
    previousPeriodLabel: prev.label,
    unitsTrend,
    productionTrend,
    meetingsTrend: metrics.reduce((sum, m) => sum + m.meetingsTrend, 0),
    teamGoalTarget,
    teamGoalActual,
    teamGoalProgressPercent,
    teamGoalType,
    callsThisPeriod,
    newContactsThisPeriod,
    followUpsThisPeriod,
    closedDealsThisPeriod,
    pipelineValue,
    conversionRate,
    scope: ctx.scope,
  };
}

export async function getTeamHierarchy(scope?: TeamOverviewScope): Promise<TeamTreeNode[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) throw new Error("Forbidden");
  const resolvedScope = resolveScopeForRole(auth.roleName as RoleName, scope);
  return getTeamTree(auth.tenantId, auth.userId, auth.roleName as RoleName, resolvedScope);
}

export async function listTeamMembersWithNames(scope?: TeamOverviewScope): Promise<TeamMemberInfo[]> {
  const ctx = await getScopeContext(scope);
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      parentId: memberships.parentId,
      roleName: roles.name,
      joinedAt: memberships.joinedAt,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
      careerProgram: memberships.careerProgram,
      careerTrack: memberships.careerTrack,
      careerPositionCode: memberships.careerPositionCode,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .leftJoin(userProfiles, eq(memberships.userId, userProfiles.userId))
    .where(and(eq(memberships.tenantId, ctx.auth.tenantId), inArray(memberships.userId, ctx.visibleUserIds), inArray(roles.name, TEAM_ROLE_NAMES as unknown as string[])))
    .orderBy(memberships.joinedAt);

  const byUser = new Map(ctx.tenantMembers.map((m) => [m.userId, m]));
  return rows.map((r) => {
    const manager = r.parentId ? byUser.get(r.parentId) : null;
    return {
      userId: r.userId,
      membershipId: r.membershipId,
      roleName: r.roleName,
      joinedAt: r.joinedAt,
      displayName: r.fullName?.trim() || null,
      email: r.email?.trim() || null,
      parentId: r.parentId ?? null,
      managerName: manager?.displayName || manager?.email || null,
      careerProgram: r.careerProgram ?? null,
      careerTrack: r.careerTrack ?? null,
      careerPositionCode: r.careerPositionCode ?? null,
    };
  });
}

export async function getTeamMemberMetrics(
  period: TeamOverviewPeriod = "month",
  scope?: TeamOverviewScope
): Promise<TeamMemberMetrics[]> {
  const ctx = await getScopeContext(scope);
  const managerByUser = new Map(
    ctx.tenantMembers.map((m) => [
      m.userId,
      m.parentId ? ctx.tenantMembers.find((candidate) => candidate.userId === m.parentId) ?? null : null,
    ])
  );

  const allStats = await Promise.all(
    ctx.visibleMembers.map((mem) => collectUserStats(ctx.auth.tenantId, mem.userId, period))
  );

  const result: TeamMemberMetrics[] = ctx.visibleMembers.map((mem, i) => {
    const stats = allStats[i]!;
    const metricBase: TeamMemberMetrics = {
      userId: mem.userId,
      roleName: mem.roleName,
      parentId: mem.parentId,
      managerName: managerByUser.get(mem.userId)?.displayName || managerByUser.get(mem.userId)?.email || null,
      joinedAt: mem.joinedAt,
      unitsThisPeriod: stats.unitsThisPeriod,
      productionThisPeriod: stats.productionThisPeriod,
      meetingsThisPeriod: stats.meetingsThisPeriod,
      callsThisPeriod: stats.callsThisPeriod,
      newContactsThisPeriod: stats.newContactsThisPeriod,
      followUpsThisPeriod: stats.followUpsThisPeriod,
      closedDealsThisPeriod: stats.closedDealsThisPeriod,
      closedOpportunitiesThisPeriod: stats.closedOpportunitiesThisPeriod,
      conversionRate: stats.conversionRate,
      pipelineValue: stats.pipelineValue,
      targetProgressPercent: null,
      activityCount: stats.activityCount,
      tasksOpen: stats.tasksOpen,
      tasksCompleted: stats.tasksCompleted,
      opportunitiesOpen: stats.opportunitiesOpen,
      lastActivityAt: stats.lastActivityAt,
      daysSinceMeeting: stats.daysSinceMeeting,
      daysWithoutActivity: stats.daysWithoutActivity,
      unitsTrend: stats.unitsTrend,
      productionTrend: stats.productionTrend,
      meetingsTrend: stats.meetingsTrend,
      riskLevel: "ok",
    };
    const memberAlerts = buildAlertsFromMetric(metricBase);
    const hasCritical = memberAlerts.some((a) => a.severity === "critical");
    metricBase.riskLevel = hasCritical ? "critical" : memberAlerts.length > 0 ? "warning" : "ok";
    return metricBase;
  });

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

export async function getTeamAlerts(
  period: TeamOverviewPeriod = "month",
  scope?: TeamOverviewScope
): Promise<TeamAlert[]> {
  const metrics = await getTeamMemberMetrics(period, scope);
  return metrics
    .flatMap((m) => buildAlertsFromMetric(m))
    .sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === "critical" ? -1 : 1;
    });
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

export async function getNewcomerAdaptation(scope?: TeamOverviewScope): Promise<NewcomerAdaptation[]> {
  const ctx = await getScopeContext(scope);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NEWCOMER_DAYS);

  const newcomerRows = ctx.visibleMembers
    .filter((m) => (m.roleName === "Advisor" || m.roleName === "Manager") && m.joinedAt >= cutoff)
    .map((m) => ({ userId: m.userId, joinedAt: m.joinedAt }));

  const result: NewcomerAdaptation[] = [];

  for (const row of newcomerRows) {
    const joinedAt = new Date(row.joinedAt);
    const daysInTeam = Math.floor((Date.now() - joinedAt.getTime()) / (24 * 60 * 60 * 1000));

    const [firstActivity, lastActivityRow, firstMeeting, firstAnalysis, firstContract, recentActivity] = await Promise.all([
      db.select({ createdAt: activityLog.createdAt }).from(activityLog).where(and(eq(activityLog.tenantId, ctx.auth.tenantId), eq(activityLog.userId, row.userId))).orderBy(asc(activityLog.createdAt)).limit(1),
      db.select({ createdAt: activityLog.createdAt }).from(activityLog).where(and(eq(activityLog.tenantId, ctx.auth.tenantId), eq(activityLog.userId, row.userId))).orderBy(desc(activityLog.createdAt)).limit(1),
      db.select({ startAt: events.startAt }).from(events).where(and(eq(events.tenantId, ctx.auth.tenantId), eq(events.assignedTo, row.userId))).orderBy(asc(events.startAt)).limit(1),
      db.select({ createdAt: financialAnalyses.createdAt }).from(financialAnalyses).where(and(eq(financialAnalyses.tenantId, ctx.auth.tenantId), eq(financialAnalyses.createdBy, row.userId))).orderBy(asc(financialAnalyses.createdAt)).limit(1),
      db.select({ startDate: contracts.startDate }).from(contracts).where(and(eq(contracts.tenantId, ctx.auth.tenantId), eq(contracts.advisorId, row.userId))).orderBy(contracts.startDate).limit(1),
      db.select({ id: activityLog.id }).from(activityLog).where(and(eq(activityLog.tenantId, ctx.auth.tenantId), eq(activityLog.userId, row.userId), gte(activityLog.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))),
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
  period: TeamOverviewPeriod = "month",
  scope?: TeamOverviewScope
): Promise<TeamPerformancePoint[]> {
  const ctx = await getScopeContext(scope);
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
          eq(contracts.tenantId, ctx.auth.tenantId),
          inArray(contracts.advisorId, ctx.visibleUserIds),
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
  careerProgram: string | null;
  careerTrack: string | null;
  careerPositionCode: string | null;
  careerEvaluation: CareerEvaluationResult;
};

export async function getTeamMemberDetail(userId: string): Promise<TeamMemberDetail | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) throw new Error("Forbidden");

  const visibleIds = await getVisibleUserIds(auth.tenantId, auth.userId, auth.roleName as RoleName, "full");
  if (!visibleIds.includes(userId)) throw new Error("Forbidden");

  const tenantMembersForDetail = await listTenantHierarchyMembers(auth.tenantId);
  const member = tenantMembersForDetail.find((m) => m.userId === userId);
  if (!member) return null;

  const [metricsList, alerts, newcomers] = await Promise.all([
    getTeamMemberMetrics("month", "full"),
    getTeamAlerts("month", "full"),
    getNewcomerAdaptation("full"),
  ]);

  const metrics = metricsList.find((m) => m.userId === userId) ?? null;
  const memberAlerts = alerts.filter((a) => a.memberId === userId);
  const adaptation = newcomers.find((n) => n.userId === userId) ?? null;

  const directs = tenantMembersForDetail.filter((m) => m.parentId === userId);
  const careerEvaluation = evaluateCareerProgress({
    systemRoleName: member.roleName,
    careerProgram: member.careerProgram,
    careerTrack: member.careerTrack,
    careerPositionCode: member.careerPositionCode,
    metrics: metrics
      ? {
          unitsThisPeriod: metrics.unitsThisPeriod,
          productionThisPeriod: metrics.productionThisPeriod,
          meetingsThisPeriod: metrics.meetingsThisPeriod,
        }
      : null,
    directReportsCount: directs.length,
    directReportCareerPositionCodes: directs.map((d) => d.careerPositionCode),
  });

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
    displayName: member.displayName,
    email: member.email,
    metrics,
    performanceOverTime: advisorPoints,
    adaptation,
    alerts: memberAlerts,
    careerProgram: member.careerProgram,
    careerTrack: member.careerTrack,
    careerPositionCode: member.careerPositionCode,
    careerEvaluation,
  };
}

export type TeamGoalRow = {
  id: string;
  period: string;
  goalType: string;
  targetValue: number;
  year: number;
  month: number;
};

export async function listTeamGoals(year?: number, period?: string): Promise<TeamGoalRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_goals:read")) return [];
  const conditions = [eq(teamGoals.tenantId, auth.tenantId)];
  if (year) conditions.push(eq(teamGoals.year, year));
  if (period) conditions.push(eq(teamGoals.period, period));
  const rows = await db
    .select()
    .from(teamGoals)
    .where(and(...conditions))
    .orderBy(asc(teamGoals.year), asc(teamGoals.month));
  return rows.map((r) => ({
    id: r.id,
    period: r.period,
    goalType: r.goalType,
    targetValue: r.targetValue,
    year: r.year,
    month: r.month,
  }));
}

export async function upsertTeamGoal(input: {
  period: string;
  goalType: string;
  targetValue: number;
  year: number;
  month: number;
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_goals:write")) {
    return { ok: false, error: "Nedostatečná oprávnění." };
  }
  const [existing] = await db
    .select({ id: teamGoals.id })
    .from(teamGoals)
    .where(
      and(
        eq(teamGoals.tenantId, auth.tenantId),
        eq(teamGoals.period, input.period),
        eq(teamGoals.goalType, input.goalType),
        eq(teamGoals.year, input.year),
        eq(teamGoals.month, input.month),
      )
    )
    .limit(1);
  if (existing) {
    await db.update(teamGoals).set({ targetValue: input.targetValue, updatedAt: new Date() }).where(eq(teamGoals.id, existing.id));
  } else {
    await db.insert(teamGoals).values({ tenantId: auth.tenantId, ...input });
  }
  return { ok: true };
}

export async function deleteTeamGoal(goalId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_goals:write")) {
    return { ok: false, error: "Nedostatečná oprávnění." };
  }
  const [row] = await db.select({ tenantId: teamGoals.tenantId }).from(teamGoals).where(eq(teamGoals.id, goalId)).limit(1);
  if (!row || row.tenantId !== auth.tenantId) return { ok: false, error: "Cíl nenalezen." };
  await db.delete(teamGoals).where(eq(teamGoals.id, goalId));
  return { ok: true };
}
