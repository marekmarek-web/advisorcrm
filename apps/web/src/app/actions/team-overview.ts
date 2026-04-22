"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import type { TenantContextDb } from "@/lib/db/with-tenant-context";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import {
  getTeamTree,
  getVisibleUserIds,
  listTenantHierarchyMembers,
  resolveScopeForRole,
  type TeamOverviewScope,
  type TeamTreeNode,
} from "@/lib/team-hierarchy";
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
  teamEvents,
  teamTasks,
} from "db";
import { buildCareerEvaluationViewModel } from "@/lib/career/career-evaluation-vm";
import { buildCareerCoachingPackage, type CareerCoachingPackage } from "@/lib/career/career-coaching";
import { buildCareerInsights } from "@/lib/career/career-insights";
import type { CareerEvaluationViewModel } from "@/lib/career/career-evaluation-vm";
import type { CareerInsight } from "@/lib/career/career-insights";
import { eq, and, gte, lt, lte, isNull, isNotNull, sql, desc, asc, inArray, or } from "db";
import { assertCapabilityForAction } from "@/lib/billing/server-action-plan-guard";

/**
 * Effective production date for a contract:
 * - AI review contracts use `advisorConfirmedAt` (moment of review apply), falling back to startDate.
 * - All other contracts use `startDate` (user entered effective date).
 * This ensures AI review contracts show up in production the period they were confirmed,
 * not based on the historical startDate extracted from the document.
 */
function contractProdDateGte(startStr: string) {
  return sql`(CASE WHEN ${contracts.sourceKind} = 'ai_review'
    THEN COALESCE(${contracts.advisorConfirmedAt}::date, ${contracts.startDate}::date)
    ELSE ${contracts.startDate}::date END) >= ${startStr}`;
}

function contractProdDateLt(endStr: string) {
  return sql`(CASE WHEN ${contracts.sourceKind} = 'ai_review'
    THEN COALESCE(${contracts.advisorConfirmedAt}::date, ${contracts.startDate}::date)
    ELSE ${contracts.startDate}::date END) < ${endStr}`;
}
import { classifyInternalTeamTitle } from "@/lib/team-rhythm/internal-classification";
import {
  buildAlertsFromMetric,
  buildTeamAlertsFromMemberMetrics,
  type TeamAlert,
  type TeamMemberMetrics,
  type MetricSourceMap,
  type MetricSource,
} from "@/lib/team-overview-alerts";
import { listManualPeriodsForMembers, type ManualPeriodRow } from "@/lib/team-members/read";

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
  /** True pokud v tenantu existuje aspoň jedna vazba nadřízenosti (parent_id) — jinak je „Můj tým“ omezený. */
  hierarchyParentLinksConfigured: boolean;
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

/**
 * F3 — převod (period, refDate) → canonical period_index použitý v team_member_manual_periods.
 *   week: ISO week (1..53), month: 1..12, quarter: 1..4.
 */
function getPeriodIndexForManual(period: TeamOverviewPeriod, ref: Date): { year: number; periodIndex: number } {
  if (period === "month") return { year: ref.getFullYear(), periodIndex: ref.getMonth() + 1 };
  if (period === "quarter") return { year: ref.getFullYear(), periodIndex: Math.floor(ref.getMonth() / 3) + 1 };
  // week — ISO week
  const d = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), periodIndex: week };
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

async function getScopeContext(scope?: TeamOverviewScope) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) throw new Error("Forbidden");
  await assertCapabilityForAction(auth, "team_overview");
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
  tx: TenantContextDb,
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
    tx
      .select({
        count: sql<number>`count(*)::int`,
        totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
        totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`,
      })
      .from(contracts)
      .where(and(eq(contracts.tenantId, tenantId), eq(contracts.advisorId, userId), contractProdDateGte(startStr), contractProdDateLt(endStr))),
    tx
      .select({
        count: sql<number>`count(*)::int`,
        totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
        totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`,
      })
      .from(contracts)
      .where(and(eq(contracts.tenantId, tenantId), eq(contracts.advisorId, userId), contractProdDateGte(prevStartStr), contractProdDateLt(prevEndStr))),
    tx
      .select({ eventType: events.eventType })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.assignedTo, userId), gte(events.startAt, current.start), lt(events.startAt, current.end))),
    tx
      .select({ eventType: events.eventType })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.assignedTo, userId), gte(events.startAt, previous.start), lt(events.startAt, previous.end))),
    tx
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(and(eq(activityLog.tenantId, tenantId), eq(activityLog.userId, userId), gte(activityLog.createdAt, current.start), lt(activityLog.createdAt, current.end))),
    tx
      .select({ createdAt: activityLog.createdAt })
      .from(activityLog)
      .where(and(eq(activityLog.tenantId, tenantId), eq(activityLog.userId, userId)))
      .orderBy(desc(activityLog.createdAt))
      .limit(1),
    tx
      .select({ startAt: events.startAt })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.assignedTo, userId), eq(events.eventType, "schuzka")))
      .orderBy(desc(events.startAt))
      .limit(1),
    tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.assignedTo, userId), isNull(tasks.completedAt))),
    tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.assignedTo, userId), isNotNull(tasks.completedAt))),
    tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.assignedTo, userId), isNotNull(tasks.completedAt), gte(tasks.completedAt, current.start), lt(tasks.completedAt, current.end))),
    tx.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.assignedTo, userId), isNull(opportunities.closedAt))),
    tx
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.assignedTo, userId), isNotNull(opportunities.closedAt), gte(opportunities.closedAt, current.start), lt(opportunities.closedAt, current.end))),
    tx
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.assignedTo, userId), eq(opportunities.closedAs, "won"), isNotNull(opportunities.closedAt), gte(opportunities.closedAt, current.start), lt(opportunities.closedAt, current.end))),
    tx
      .select({ sumExpected: sql<number>`coalesce(sum(${opportunities.expectedValue}::numeric), 0)` })
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.assignedTo, userId), isNull(opportunities.closedAt))),
    tx
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

  const metrics = await getTeamMemberMetrics(period, ctx.scope);
  const newcomers = await getNewcomerAdaptation(ctx.scope);

  const { activeCountRows, meetingsThisWeekRows, goal } = await withTenantContextFromAuth(ctx.auth, async (tx) => {
    const [activeCountRowsInner, meetingsThisWeekRowsInner] = await Promise.all([
      tx
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
      tx
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

    const periodYear = start.getFullYear();
    const periodMonth = period === "month" ? start.getMonth() + 1 : Math.floor(start.getMonth() / 3) + 1;
    const goalRows = await tx
      .select({ goalType: teamGoals.goalType, targetValue: teamGoals.targetValue })
      .from(teamGoals)
      .where(and(eq(teamGoals.tenantId, ctx.auth.tenantId), eq(teamGoals.period, period), eq(teamGoals.year, periodYear), eq(teamGoals.month, periodMonth)))
      .limit(1);

    return {
      activeCountRows: activeCountRowsInner,
      meetingsThisWeekRows: meetingsThisWeekRowsInner,
      goal: goalRows[0],
    };
  });

  const alerts = buildTeamAlertsFromMemberMetrics(metrics);
  const hierarchyParentLinksConfigured = ctx.tenantMembers.some((m) => !!m.parentId);

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
    hierarchyParentLinksConfigured,
  };
}

export async function getTeamHierarchy(scope?: TeamOverviewScope): Promise<TeamTreeNode[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) throw new Error("Forbidden");
  await assertCapabilityForAction(auth, "team_overview");
  const resolvedScope = resolveScopeForRole(auth.roleName as RoleName, scope);
  return getTeamTree(auth.tenantId, auth.userId, auth.roleName as RoleName, resolvedScope);
}

export async function listTeamMembersWithNames(scope?: TeamOverviewScope): Promise<TeamMemberInfo[]> {
  const ctx = await getScopeContext(scope);
  const rows = await withTenantContextFromAuth(ctx.auth, (tx) =>
    tx
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
      .orderBy(memberships.joinedAt),
  );

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
  const newcomers = await getNewcomerAdaptation(ctx.scope);
  const adaptationLabelByUser = new Map(newcomers.map((n) => [n.userId, n.adaptationStatus]));

  const managerByUser = new Map(
    ctx.tenantMembers.map((m) => [
      m.userId,
      m.parentId ? ctx.tenantMembers.find((candidate) => candidate.userId === m.parentId) ?? null : null,
    ])
  );

  const { allStats, teamGoalRow } = await withTenantContextFromAuth(ctx.auth, async (tx) => {
    const allStatsInner = await Promise.all(
      ctx.visibleMembers.map((mem) => collectUserStats(tx, ctx.auth.tenantId, mem.userId, period))
    );

    const { start: rangeStart } = getPeriodRange(period);
    const periodYear = rangeStart.getFullYear();
    const periodMonth =
      period === "month" ? rangeStart.getMonth() + 1 : Math.floor(rangeStart.getMonth() / 3) + 1;
    const [teamGoalRowInner] = await tx
      .select({ goalType: teamGoals.goalType, targetValue: teamGoals.targetValue })
      .from(teamGoals)
      .where(
        and(
          eq(teamGoals.tenantId, ctx.auth.tenantId),
          eq(teamGoals.period, period),
          eq(teamGoals.year, periodYear),
          eq(teamGoals.month, periodMonth)
        )
      )
      .limit(1);

    return { allStats: allStatsInner, teamGoalRow: teamGoalRowInner };
  });

  // F3 — manual periods overlay pro aktu\u00e1ln\u00ed obdob\u00ed
  const { start: manualRangeStart } = getPeriodRange(period);
  const { year: manualYear, periodIndex: manualIdx } = getPeriodIndexForManual(period, manualRangeStart);
  const visibleTeamMemberIds = ctx.visibleMembers.map((m) => m.teamMemberId).filter((x): x is string => !!x);
  const manualAll = await listManualPeriodsForMembers(ctx.auth.tenantId, visibleTeamMemberIds);
  const manualByMember = new Map<string, ManualPeriodRow>();
  for (const mp of manualAll) {
    if (mp.period === period && mp.year === manualYear && mp.periodIndex === manualIdx) {
      manualByMember.set(mp.teamMemberId, mp);
    }
  }

  const result: TeamMemberMetrics[] = ctx.visibleMembers.map((mem, i) => {
    const stats = allStats[i]!;
    const directsForCareer = ctx.tenantMembers.filter((tm) => tm.parentId === mem.userId);
    const directReportsCount = directsForCareer.length;

    const careerEvaluation = buildCareerEvaluationViewModel(
      {
        systemRoleName: mem.roleName,
        careerProgram: mem.careerProgram,
        careerTrack: mem.careerTrack,
        careerPositionCode: mem.careerPositionCode,
        metrics: {
          unitsThisPeriod: stats.unitsThisPeriod,
          productionThisPeriod: stats.productionThisPeriod,
          meetingsThisPeriod: stats.meetingsThisPeriod,
        },
        directReportsCount,
        directReportCareerPositionCodes: directsForCareer.map((d) => d.careerPositionCode),
        activityCount: stats.activityCount,
        daysWithoutActivity: stats.daysWithoutActivity,
        newcomerAdaptationStatusLabel: adaptationLabelByUser.get(mem.userId) ?? null,
      },
      {
        careerProgram: mem.careerProgram,
        careerTrack: mem.careerTrack,
        careerPositionCode: mem.careerPositionCode,
      }
    );

    const manualRow = mem.teamMemberId ? manualByMember.get(mem.teamMemberId) ?? null : null;
    const manualConf: MetricSource =
      manualRow?.confidence === "manual_estimated" ? "manual_estimated" : "manual_confirmed";

    const autoEmpty = mem.memberKind === "external_manual";
    const sources: MetricSourceMap = {};

    function pickNum(autoVal: number, manualVal: number | null | undefined, key: keyof MetricSourceMap): number {
      if (manualVal != null && !Number.isNaN(manualVal)) {
        sources[key] = manualConf;
        return Number(manualVal);
      }
      if (autoEmpty) {
        sources[key] = "missing";
        return 0;
      }
      return autoVal;
    }

    const unitsThisPeriod = pickNum(stats.unitsThisPeriod, manualRow?.unitsCount ?? null, "unitsThisPeriod");
    const productionThisPeriod = pickNum(
      stats.productionThisPeriod,
      manualRow?.productionAmount != null ? Number(manualRow.productionAmount) : null,
      "productionThisPeriod"
    );
    const meetingsThisPeriod = pickNum(stats.meetingsThisPeriod, manualRow?.meetingsCount ?? null, "meetingsThisPeriod");
    const closedDealsThisPeriod = pickNum(
      stats.closedDealsThisPeriod,
      manualRow?.contractsCount ?? null,
      "closedDealsThisPeriod"
    );
    const activityCount = pickNum(stats.activityCount, manualRow?.activitiesCount ?? null, "activityCount");

    if (autoEmpty) {
      // external_manual — metriky bez p\u0159\u00edmo-manual overlay jsou missing.
      if (sources.unitsThisPeriod == null) sources.unitsThisPeriod = "missing";
      if (sources.productionThisPeriod == null) sources.productionThisPeriod = "missing";
      if (sources.meetingsThisPeriod == null) sources.meetingsThisPeriod = "missing";
      if (sources.closedDealsThisPeriod == null) sources.closedDealsThisPeriod = "missing";
      if (sources.activityCount == null) sources.activityCount = "missing";
      sources.callsThisPeriod = "missing";
      sources.newContactsThisPeriod = "missing";
      sources.followUpsThisPeriod = "missing";
      sources.closedOpportunitiesThisPeriod = "missing";
      sources.pipelineValue = "missing";
      sources.unitsTrend = "missing";
      sources.productionTrend = "missing";
      sources.meetingsTrend = "missing";
    }

    const metricBase: TeamMemberMetrics = {
      userId: mem.userId,
      teamMemberId: mem.teamMemberId,
      memberKind: mem.memberKind,
      sources,
      roleName: mem.roleName,
      parentId: mem.parentId,
      managerName: managerByUser.get(mem.userId)?.displayName || managerByUser.get(mem.userId)?.email || null,
      joinedAt: mem.joinedAt,
      unitsThisPeriod,
      productionThisPeriod,
      meetingsThisPeriod,
      callsThisPeriod: autoEmpty ? 0 : stats.callsThisPeriod,
      newContactsThisPeriod: autoEmpty ? 0 : stats.newContactsThisPeriod,
      followUpsThisPeriod: autoEmpty ? 0 : stats.followUpsThisPeriod,
      closedDealsThisPeriod,
      closedOpportunitiesThisPeriod: autoEmpty ? 0 : stats.closedOpportunitiesThisPeriod,
      conversionRate: autoEmpty ? 0 : stats.conversionRate,
      pipelineValue: autoEmpty ? 0 : stats.pipelineValue,
      targetProgressPercent: null,
      activityCount,
      tasksOpen: autoEmpty ? 0 : stats.tasksOpen,
      tasksCompleted: autoEmpty ? 0 : stats.tasksCompleted,
      opportunitiesOpen: autoEmpty ? 0 : stats.opportunitiesOpen,
      lastActivityAt: autoEmpty ? null : stats.lastActivityAt,
      daysSinceMeeting: autoEmpty ? 999 : stats.daysSinceMeeting,
      daysWithoutActivity: autoEmpty ? 999 : stats.daysWithoutActivity,
      unitsTrend: autoEmpty ? 0 : stats.unitsTrend,
      productionTrend: autoEmpty ? 0 : stats.productionTrend,
      meetingsTrend: autoEmpty ? 0 : stats.meetingsTrend,
      riskLevel: "ok",
      directReportsCount,
      careerEvaluation,
    };

    if (autoEmpty) {
      // external_manual \u2014 CRM-based alerty jsou irelevantn\u00ed (data chyb\u00ed). Risk level nech\u00e1me
      // na \"ok\"; F5 recommendation-engine bude generovat data_completion doporu\u010den\u00ed zvl\u00e1\u0161\u0165.
      metricBase.riskLevel = "ok";
    } else {
      const memberAlerts = buildAlertsFromMetric(metricBase);
      const hasCritical = memberAlerts.some((a) => a.severity === "critical");
      metricBase.riskLevel = hasCritical ? "critical" : memberAlerts.length > 0 ? "warning" : "ok";
    }

    return metricBase;
  });

  if (
    teamGoalRow &&
    teamGoalRow.targetValue > 0 &&
    teamGoalRow.goalType === "production" &&
    result.length > 0
  ) {
    const perMemberTarget = teamGoalRow.targetValue / result.length;
    for (const m of result) {
      m.targetProgressPercent = Math.min(
        100,
        Math.round((m.productionThisPeriod / perMemberTarget) * 100)
      );
    }
  }

  return result;
}

/** Složení produkce podle segmentů smluv (mock CRM karta) — Kč za období. */
export type AdvisorProductionMix = {
  investice: number;
  penze: number;
  zivot: number;
  hypoteky: number;
  other: number;
  total: number;
};

export async function getAdvisorProductionMix(
  advisorUserId: string,
  period: TeamOverviewPeriod = "month"
): Promise<AdvisorProductionMix> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) throw new Error("Forbidden");

    const { start, end } = getPeriodRange(period);
    const { startStr, endStr } = toDateRangeStr(start, end);

    const rows = await tx
      .select({
        segment: contracts.segment,
        amount: sql<number>`coalesce(sum(coalesce(${contracts.premiumAnnual}::numeric, ${contracts.premiumAmount}::numeric, 0)), 0)`,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, auth.tenantId),
          eq(contracts.advisorId, advisorUserId),
          contractProdDateGte(startStr),
          contractProdDateLt(endStr)
        )
      )
      .groupBy(contracts.segment);

    const empty: AdvisorProductionMix = {
      investice: 0,
      penze: 0,
      zivot: 0,
      hypoteky: 0,
      other: 0,
      total: 0,
    };

    for (const r of rows) {
      const v = Number(r.amount) || 0;
      const seg = (r.segment ?? "").toUpperCase();
      if (seg === "INV" || seg === "DIP") empty.investice += v;
      else if (seg === "DPS") empty.penze += v;
      else if (seg === "HYPO" || seg === "UVER") empty.hypoteky += v;
      else if (
        seg === "ZP" ||
        seg === "MAJ" ||
        seg === "ODP" ||
        seg === "AUTO_PR" ||
        seg === "AUTO_HAV" ||
        seg === "CEST" ||
        seg === "FIRMA_POJ"
      )
        empty.zivot += v;
      else empty.other += v;
      empty.total += v;
    }

    return empty;
  });
}

export async function getTeamAlerts(
  period: TeamOverviewPeriod = "month",
  scope?: TeamOverviewScope
): Promise<TeamAlert[]> {
  const metrics = await getTeamMemberMetrics(period, scope);
  return buildTeamAlertsFromMemberMetrics(metrics);
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

  if (newcomerRows.length === 0) return [];

  return withTenantContextFromAuth(ctx.auth, async (tx) => {
    const result: NewcomerAdaptation[] = [];

    for (const row of newcomerRows) {
      const joinedAt = new Date(row.joinedAt);
      const daysInTeam = Math.floor((Date.now() - joinedAt.getTime()) / (24 * 60 * 60 * 1000));

      const [firstActivity, lastActivityRow, firstMeeting, firstAnalysis, firstContract, recentActivity] = await Promise.all([
        tx.select({ createdAt: activityLog.createdAt }).from(activityLog).where(and(eq(activityLog.tenantId, ctx.auth.tenantId), eq(activityLog.userId, row.userId))).orderBy(asc(activityLog.createdAt)).limit(1),
        tx.select({ createdAt: activityLog.createdAt }).from(activityLog).where(and(eq(activityLog.tenantId, ctx.auth.tenantId), eq(activityLog.userId, row.userId))).orderBy(desc(activityLog.createdAt)).limit(1),
        tx.select({ startAt: events.startAt }).from(events).where(and(eq(events.tenantId, ctx.auth.tenantId), eq(events.assignedTo, row.userId))).orderBy(asc(events.startAt)).limit(1),
        tx.select({ createdAt: financialAnalyses.createdAt }).from(financialAnalyses).where(and(eq(financialAnalyses.tenantId, ctx.auth.tenantId), eq(financialAnalyses.createdBy, row.userId))).orderBy(asc(financialAnalyses.createdAt)).limit(1),
        tx.select({ startDate: contracts.startDate }).from(contracts).where(and(eq(contracts.tenantId, ctx.auth.tenantId), eq(contracts.advisorId, row.userId))).orderBy(contracts.startDate).limit(1),
        tx.select({ id: activityLog.id }).from(activityLog).where(and(eq(activityLog.tenantId, ctx.auth.tenantId), eq(activityLog.userId, row.userId), gte(activityLog.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))),
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
  });
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
  const now = new Date();

  return withTenantContextFromAuth(ctx.auth, async (tx) => {
    const points: TeamPerformancePoint[] = [];

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

      const rows = await tx
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
            contractProdDateGte(startStr),
            contractProdDateLt(endStr)
          )
        );
      const units = Number(rows[0]?.count ?? 0);
      const production = Number(rows[0]?.totalAnnual ?? rows[0]?.totalPremium ?? 0) || Number(rows[0]?.totalPremium ?? 0);
      points.push({ label, units, production });
    }

    return points;
  });
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
  /** Stejný kanonický výstup jako u řádku v Team Overview (včetně summaryLine, proxy) */
  careerEvaluation: CareerEvaluationViewModel;
  /** Krátké manažerské insighty odvozené z CRM + kariéry (ne řád) */
  careerInsights: CareerInsight[];
  /** Coaching, 1:1 agenda, doporučená akce, CTA předvolby */
  careerCoaching: CareerCoachingPackage;
};

export async function getTeamMemberDetail(
  userId: string,
  options?: { period?: TeamOverviewPeriod; scope?: TeamOverviewScope }
): Promise<TeamMemberDetail | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) throw new Error("Forbidden");

  const period: TeamOverviewPeriod = options?.period ?? "month";
  const scope = resolveScopeForRole(auth.roleName as RoleName, options?.scope);

  const visibleIds = await getVisibleUserIds(auth.tenantId, auth.userId, auth.roleName as RoleName, scope);
  if (!visibleIds.includes(userId)) throw new Error("Forbidden");

  const tenantMembersForDetail = await listTenantHierarchyMembers(auth.tenantId);
  const member = tenantMembersForDetail.find((m) => m.userId === userId);
  if (!member) return null;

  const [metricsList, newcomers] = await Promise.all([
    getTeamMemberMetrics(period, scope),
    getNewcomerAdaptation(scope),
  ]);

  const allAlerts = buildTeamAlertsFromMemberMetrics(metricsList);
  const metrics = metricsList.find((m) => m.userId === userId) ?? null;
  const memberAlerts = allAlerts.filter((a) => a.memberId === userId);
  const adaptation = newcomers.find((n) => n.userId === userId) ?? null;

  const careerEvaluation =
    metrics?.careerEvaluation ??
    buildCareerEvaluationViewModel(
      {
        systemRoleName: member.roleName,
        careerProgram: member.careerProgram,
        careerTrack: member.careerTrack,
        careerPositionCode: member.careerPositionCode,
        metrics: null,
        directReportsCount: tenantMembersForDetail.filter((m) => m.parentId === userId).length,
        directReportCareerPositionCodes: tenantMembersForDetail
          .filter((m) => m.parentId === userId)
          .map((d) => d.careerPositionCode),
        newcomerAdaptationStatusLabel: adaptation?.adaptationStatus ?? null,
      },
      {
        careerProgram: member.careerProgram,
        careerTrack: member.careerTrack,
        careerPositionCode: member.careerPositionCode,
      }
    );

  const careerInsights = buildCareerInsights(
    careerEvaluation,
    metrics
      ? {
          meetingsThisPeriod: metrics.meetingsThisPeriod,
          unitsThisPeriod: metrics.unitsThisPeriod,
          activityCount: metrics.activityCount,
          daysWithoutActivity: metrics.daysWithoutActivity,
          directReportsCount: metrics.directReportsCount,
        }
      : null,
    adaptation
      ? { adaptationStatus: adaptation.adaptationStatus, daysInTeam: adaptation.daysInTeam }
      : null
  );

  const coachingAdaptation =
    adaptation != null
      ? {
          adaptationStatus: adaptation.adaptationStatus,
          daysInTeam: adaptation.daysInTeam,
          adaptationScore: adaptation.adaptationScore,
          warnings: adaptation.warnings,
          incompleteChecklistLabels: adaptation.checklist.filter((c) => !c.completed).map((c) => c.label),
        }
      : null;

  const coachingMetrics =
    metrics != null
      ? {
          meetingsThisPeriod: metrics.meetingsThisPeriod,
          unitsThisPeriod: metrics.unitsThisPeriod,
          activityCount: metrics.activityCount,
          daysWithoutActivity: metrics.daysWithoutActivity,
          directReportsCount: metrics.directReportsCount,
        }
      : null;

  const careerCoaching = buildCareerCoachingPackage(
    careerEvaluation,
    coachingMetrics,
    coachingAdaptation,
    memberAlerts.map((a) => a.title)
  );

  const advisorPoints = await withTenantContextFromAuth({ tenantId: auth.tenantId, userId: auth.userId }, async (tx) => {
    const points: TeamPerformancePoint[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(now);
      ref.setMonth(ref.getMonth() - i);
      const { start, end, label } = getPeriodRange("month", ref);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const rows = await tx
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
            contractProdDateGte(startStr),
            contractProdDateLt(endStr)
          )
        );
      const units = Number(rows[0]?.count ?? 0);
      const production = Number(rows[0]?.totalAnnual ?? rows[0]?.totalPremium ?? 0) || Number(rows[0]?.totalPremium ?? 0);
      points.push({ label, units, production });
    }
    return points;
  });

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
    careerInsights,
    careerCoaching,
  };
}

export type { TeamRhythmCalendarData } from "@/lib/team-rhythm/compute-view";

function teamRhythmTargetsOverlapScope(targetUserIds: string[], visibleSet: Set<string>): boolean {
  return targetUserIds.some((id) => visibleSet.has(id));
}

/**
 * Lehký read model: týmové události a úkoly v časovém okně, filtrované podle Team Overview scope.
 * Typy 1:1 / porada jsou jen z heuristiky názvu — viz disclaimer v payloadu.
 */
export async function getTeamRhythmCalendarData(scope?: TeamOverviewScope) {
  const ctx = await getScopeContext(scope);
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 45);
  const future = new Date(now);
  future.setDate(future.getDate() + 14);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const overdueCutoff = new Date(now);
  overdueCutoff.setDate(overdueCutoff.getDate() - 90);

  const { evRows, taskRows } = await withTenantContextFromAuth(ctx.auth, async (tx) => {
    const [evRowsInner, taskRowsInner] = await Promise.all([
      tx
        .select({
          id: teamEvents.id,
          title: teamEvents.title,
          startAt: teamEvents.startAt,
          targetUserIds: teamEvents.targetUserIds,
        })
        .from(teamEvents)
        .where(
          and(
            eq(teamEvents.tenantId, ctx.auth.tenantId),
            isNull(teamEvents.cancelledAt),
            gte(teamEvents.startAt, past),
            lte(teamEvents.startAt, future)
          )
        ),
      tx
        .select({
          id: teamTasks.id,
          title: teamTasks.title,
          dueDate: teamTasks.dueDate,
          targetUserIds: teamTasks.targetUserIds,
        })
        .from(teamTasks)
        .where(
          and(
            eq(teamTasks.tenantId, ctx.auth.tenantId),
            isNull(teamTasks.cancelledAt),
            isNotNull(teamTasks.dueDate),
            or(
              and(lt(teamTasks.dueDate, startOfToday), gte(teamTasks.dueDate, overdueCutoff)),
              and(gte(teamTasks.dueDate, startOfToday), lte(teamTasks.dueDate, future))
            )
          )
        ),
    ]);
    return { evRows: evRowsInner, taskRows: taskRowsInner };
  });

  const events = evRows
    .filter((r) => teamRhythmTargetsOverlapScope(r.targetUserIds ?? [], ctx.visibleSet))
    .map((r) => ({
      id: r.id,
      title: r.title,
      startAt: r.startAt.toISOString(),
      category: classifyInternalTeamTitle(r.title),
      targetUserIds: r.targetUserIds ?? [],
    }));

  const tasks = taskRows
    .filter((r) => teamRhythmTargetsOverlapScope(r.targetUserIds ?? [], ctx.visibleSet))
    .map((r) => ({
      id: r.id,
      title: r.title,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      category: classifyInternalTeamTitle(r.title),
      targetUserIds: r.targetUserIds ?? [],
    }));

  return {
    events,
    tasks,
    disclaimerCs:
      "Typy událostí (1:1, adaptace, porada, follow-up) jsou odvozeny z názvu záznamu — v databázi nejsou jako striktní typ. Slouží jako operační nápověda, ne jako kalendářový systém.",
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
  await assertCapabilityForAction(auth, "team_goals_events");
  const conditions = [eq(teamGoals.tenantId, auth.tenantId)];
  if (year) conditions.push(eq(teamGoals.year, year));
  if (period) conditions.push(eq(teamGoals.period, period));
  const rows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select()
      .from(teamGoals)
      .where(and(...conditions))
      .orderBy(asc(teamGoals.year), asc(teamGoals.month)),
  );
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
  await assertCapabilityForAction(auth, "team_goals_events");
  await withTenantContextFromAuth(auth, async (tx) => {
    const [existing] = await tx
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
      await tx.update(teamGoals).set({ targetValue: input.targetValue, updatedAt: new Date() }).where(eq(teamGoals.id, existing.id));
    } else {
      await tx.insert(teamGoals).values({ tenantId: auth.tenantId, ...input });
    }
  });
  return { ok: true };
}

export async function deleteTeamGoal(goalId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_goals:write")) {
    return { ok: false, error: "Nedostatečná oprávnění." };
  }
  await assertCapabilityForAction(auth, "team_goals_events");
  return withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx.select({ tenantId: teamGoals.tenantId }).from(teamGoals).where(eq(teamGoals.id, goalId)).limit(1);
    if (!row || row.tenantId !== auth.tenantId) return { ok: false, error: "Cíl nenalezen." };
    await tx.delete(teamGoals).where(eq(teamGoals.id, goalId));
    return { ok: true };
  });
}

/** Jeden paralelní read pro Team Overview — stejné zdroje jako stránka; bez duplicitního shaping v klientovi. */
export type TeamOverviewPageSnapshot = {
  kpis: TeamOverviewKpis | null;
  members: Awaited<ReturnType<typeof listTeamMembersWithNames>>;
  metrics: TeamMemberMetrics[];
  newcomers: NewcomerAdaptation[];
  performanceOverTime: TeamPerformancePoint[];
  rhythmCalendar: Awaited<ReturnType<typeof getTeamRhythmCalendarData>> | null;
  hierarchy: TeamTreeNode[];
  alerts: TeamAlert[];
};

export async function getTeamOverviewPageSnapshot(
  period: TeamOverviewPeriod = "month",
  scope?: TeamOverviewScope
): Promise<TeamOverviewPageSnapshot> {
  const [kpis, members, metrics, newcomers, performanceOverTime, rhythmCalendar, hierarchy] = await Promise.all([
    getTeamOverviewKpis(period, scope).catch(() => null),
    listTeamMembersWithNames(scope).catch(() => []),
    getTeamMemberMetrics(period, scope).catch(() => []),
    getNewcomerAdaptation(scope).catch(() => []),
    getTeamPerformanceOverTime(period, scope).catch(() => []),
    getTeamRhythmCalendarData(scope).catch(() => null),
    getTeamHierarchy(scope).catch(() => []),
  ]);
  const alerts = buildTeamAlertsFromMemberMetrics(metrics);
  return {
    kpis,
    members,
    metrics,
    newcomers,
    performanceOverTime,
    rhythmCalendar,
    hierarchy,
    alerts,
  };
}
