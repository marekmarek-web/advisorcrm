"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import {
  advisorBusinessPlans,
  advisorBusinessPlanTargets,
  advisorVisionGoals,
} from "db";
import { eq, and, asc, inArray } from "db";
import type { PeriodType, BusinessPlanMetricType, MetricUnit } from "@/lib/business-plan/types";
import { getPlanPeriod } from "@/lib/business-plan/types";
import { computeAllMetrics, getCallsCount, getProductionMix } from "@/lib/business-plan/metrics";
import { computeProgress, type PlanWithTargets } from "@/lib/business-plan/progress";
import { listTeamMembersWithNames } from "@/app/actions/team-overview";
import { getSlippageRecommendations } from "@/lib/business-plan/recommendations";
import type { PlanProgress, SlippageRecommendation } from "@/lib/business-plan/types";

export type PlanListItem = {
  id: string;
  periodType: string;
  year: number;
  periodNumber: number;
  periodLabel: string;
  title: string | null;
  status: string;
  createdAt: Date;
};

export type PlanWithTargetsRow = {
  planId: string;
  tenantId: string;
  userId: string;
  periodType: string;
  year: number;
  periodNumber: number;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  targets: { metricType: BusinessPlanMetricType; targetValue: number; unit: MetricUnit }[];
};

export type PlanProgressResult = {
  progress: PlanProgress;
  recommendations: SlippageRecommendation[];
  /** Funnel actuals for UI (calls = telefonat events). */
  funnelActuals?: { calls: number };
  /** Production by segment (Kč) for mix donut. */
  productionMix?: { investments: number; life: number; hypo: number };
};

export type VisionGoalRow = { id: string; title: string; progressPct: number; sortOrder: number };

/** Minimal data for dashboard widget: current month plan progress (top 3 metrics). */
export async function getBusinessPlanWidgetData(): Promise<{
  periodLabel: string;
  overallHealth: string;
  metrics: { metricType: string; label: string; actual: number; target: number; health: string; unit: string }[];
} | null> {
  const auth = await requireAuthInAction();
  const plan = await getActivePlan("month");
  if (!plan?.planId || plan.targets.length === 0) return null;
  const result = await getPlanProgress(plan.planId);
  if (!result) return null;
  const { progress } = result;
  const METRIC_LABELS: Record<string, string> = {
    new_clients: "Noví klienti",
    meetings: "Schůzky",
    follow_ups: "Follow-upy",
    opportunities_open: "Rozprac. obchody",
    deals_closed: "Uzavřené obchody",
    volume_hypo: "Objem hypoték",
    volume_investments: "Objem investic",
    service_activities: "Servis",
    production: "Produkce",
  };
  const top = progress.metrics.slice(0, 3).map((m) => ({
    metricType: m.metricType,
    label: METRIC_LABELS[m.metricType] ?? m.metricType,
    actual: m.actual,
    target: m.target,
    health: m.health,
    unit: m.unit,
  }));
  return {
    periodLabel: progress.periodLabel,
    overallHealth: progress.overallHealth,
    metrics: top,
  };
}

/** List current user's plans (own only). */
export async function listBusinessPlans(): Promise<PlanListItem[]> {
  const auth = await requireAuthInAction();
  const rows = await db
    .select({
      id: advisorBusinessPlans.id,
      periodType: advisorBusinessPlans.periodType,
      year: advisorBusinessPlans.year,
      periodNumber: advisorBusinessPlans.periodNumber,
      title: advisorBusinessPlans.title,
      status: advisorBusinessPlans.status,
      createdAt: advisorBusinessPlans.createdAt,
    })
    .from(advisorBusinessPlans)
    .where(
      and(
        eq(advisorBusinessPlans.tenantId, auth.tenantId),
        eq(advisorBusinessPlans.userId, auth.userId)
      )    )
    .orderBy(asc(advisorBusinessPlans.year), asc(advisorBusinessPlans.periodNumber));
  const periodType = (p: string) => p as PeriodType;
  return rows.map((r) => {
    const period = getPlanPeriod(periodType(r.periodType), r.year, r.periodNumber);
    return {
      id: r.id,
      periodType: r.periodType,
      year: r.year,
      periodNumber: r.periodNumber,
      periodLabel: period.label,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt,
    };
  });
}

/** Get active plan for current period (month/quarter/year). periodType defaults to "month". */
export async function getActivePlan(
  periodType: PeriodType = "month"
): Promise<PlanWithTargetsRow | null> {
  const auth = await requireAuthInAction();
  const now = new Date();
  const y = now.getFullYear();
  const periodNumber =
    periodType === "month"
      ? now.getMonth() + 1
      : periodType === "quarter"
        ? Math.floor(now.getMonth() / 3) + 1
        : 0;
  const [planRow] = await db
    .select()
    .from(advisorBusinessPlans)
    .where(
      and(
        eq(advisorBusinessPlans.tenantId, auth.tenantId),
        eq(advisorBusinessPlans.userId, auth.userId),
        eq(advisorBusinessPlans.periodType, periodType),
        eq(advisorBusinessPlans.year, y),
        eq(advisorBusinessPlans.periodNumber, periodNumber),
        eq(advisorBusinessPlans.status, "active")
      )    )
    .limit(1);
  if (!planRow) return null;
  const period = getPlanPeriod(
    periodType as PeriodType,
    planRow.year,
    planRow.periodNumber
  );
  const targetRows = await db
    .select({
      metricType: advisorBusinessPlanTargets.metricType,
      targetValue: advisorBusinessPlanTargets.targetValue,
      unit: advisorBusinessPlanTargets.unit,
    })
    .from(advisorBusinessPlanTargets)
    .where(eq(advisorBusinessPlanTargets.planId, planRow.id));
  const targets = targetRows.map((t) => ({
    metricType: t.metricType as BusinessPlanMetricType,
    targetValue: Number(t.targetValue),
    unit: (t.unit ?? "count") as MetricUnit,
  }));
  return {
    planId: planRow.id,
    tenantId: planRow.tenantId,
    userId: planRow.userId,
    periodType: planRow.periodType,
    year: planRow.year,
    periodNumber: planRow.periodNumber,
    periodLabel: period.label,
    periodStart: period.start,
    periodEnd: period.end,
    targets,
  };
}

/** Get plan by id (own only) with targets. */
export async function getPlanWithTargets(
  planId: string
): Promise<PlanWithTargetsRow | null> {
  const auth = await requireAuthInAction();
  const [planRow] = await db
    .select()
    .from(advisorBusinessPlans)
    .where(
      and(
        eq(advisorBusinessPlans.id, planId),
        eq(advisorBusinessPlans.tenantId, auth.tenantId),
        eq(advisorBusinessPlans.userId, auth.userId)
      )    )
    .limit(1);
  if (!planRow) return null;
  const period = getPlanPeriod(
    planRow.periodType as PeriodType,
    planRow.year,
    planRow.periodNumber
  );
  const targetRows = await db
    .select({
      metricType: advisorBusinessPlanTargets.metricType,
      targetValue: advisorBusinessPlanTargets.targetValue,
      unit: advisorBusinessPlanTargets.unit,
    })
    .from(advisorBusinessPlanTargets)
    .where(eq(advisorBusinessPlanTargets.planId, planRow.id));
  const targets = targetRows.map((t) => ({
    metricType: t.metricType as BusinessPlanMetricType,
    targetValue: Number(t.targetValue),
    unit: (t.unit ?? "count") as MetricUnit,
  }));
  return {
    planId: planRow.id,
    tenantId: planRow.tenantId,
    userId: planRow.userId,
    periodType: planRow.periodType,
    year: planRow.year,
    periodNumber: planRow.periodNumber,
    periodLabel: period.label,
    periodStart: period.start,
    periodEnd: period.end,
    targets,
  };
}

/** Compute progress and recommendations for a plan. Runs metrics/calls/mix sequentially to avoid exhausting DB connection pool. */
export async function getPlanProgress(
  planId: string
): Promise<PlanProgressResult | null> {
  const auth = await requireAuthInAction();
  const plan = await getPlanWithTargets(planId);
  if (!plan) return null;
  const actuals = await computeAllMetrics(
    plan.tenantId,
    plan.userId,
    plan.periodStart,
    plan.periodEnd
  );
  const calls = await getCallsCount(plan.tenantId, plan.userId, plan.periodStart, plan.periodEnd);
  const productionMix = await getProductionMix(plan.tenantId, plan.userId, plan.periodStart, plan.periodEnd);
  const planForProgress: PlanWithTargets = {
    planId: plan.planId,
    tenantId: plan.tenantId,
    userId: plan.userId,
    periodType: plan.periodType,
    year: plan.year,
    periodNumber: plan.periodNumber,
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    periodLabel: plan.periodLabel,
    targets: plan.targets,
  };
  const progress = await computeProgress(planForProgress, actuals);
  const recommendations = getSlippageRecommendations(progress);
  return {
    progress,
    recommendations,
    funnelActuals: { calls },
    productionMix,
  };
}

/** Create a plan for the given period. Returns plan id. */
export async function createBusinessPlan(params: {
  periodType: PeriodType;
  year: number;
  periodNumber: number;
  title?: string | null;
}): Promise<string> {
  const auth = await requireAuthInAction();
  const [inserted] = await db
    .insert(advisorBusinessPlans)
    .values({
      tenantId: auth.tenantId,
      userId: auth.userId,
      periodType: params.periodType,
      year: params.year,
      periodNumber: params.periodNumber,
      title: params.title ?? null,
      status: "active",
    })
    .returning({ id: advisorBusinessPlans.id });
  if (!inserted?.id) throw new Error("Failed to create plan");
  return inserted.id;
}

/** Update plan title/status. */
export async function updateBusinessPlan(
  planId: string,
  updates: { title?: string | null; status?: "active" | "archived" }
): Promise<void> {
  const auth = await requireAuthInAction();
  await db
    .update(advisorBusinessPlans)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(advisorBusinessPlans.id, planId),
        eq(advisorBusinessPlans.tenantId, auth.tenantId),
        eq(advisorBusinessPlans.userId, auth.userId)
      )    );
}

/** Delete plan (cascades to targets). */
export async function deleteBusinessPlan(planId: string): Promise<void> {
  const auth = await requireAuthInAction();
  await db
    .delete(advisorBusinessPlans)
    .where(
      and(
        eq(advisorBusinessPlans.id, planId),
        eq(advisorBusinessPlans.tenantId, auth.tenantId),
        eq(advisorBusinessPlans.userId, auth.userId)
      )    );
}

/** Set targets for a plan (replaces existing). */
export async function setPlanTargets(
  planId: string,
  targets: { metricType: BusinessPlanMetricType; targetValue: number; unit: MetricUnit }[]
): Promise<void> {
  const auth = await requireAuthInAction();
  const [plan] = await db
    .select({ id: advisorBusinessPlans.id })
    .from(advisorBusinessPlans)
    .where(
      and(
        eq(advisorBusinessPlans.id, planId),
        eq(advisorBusinessPlans.tenantId, auth.tenantId),
        eq(advisorBusinessPlans.userId, auth.userId)
      )    )
    .limit(1);
  if (!plan) throw new Error("Plan not found");
  await db
    .delete(advisorBusinessPlanTargets)
    .where(eq(advisorBusinessPlanTargets.planId, planId));
  if (targets.length === 0) return;
  await db.insert(advisorBusinessPlanTargets).values(
    targets.map((t) => ({
      planId,
      metricType: t.metricType,
      targetValue: String(t.targetValue),
      unit: t.unit,
    }))
  );
}

/** Get current user's vision goals for business plan. */
export async function getVisionGoals(): Promise<VisionGoalRow[]> {
  const auth = await requireAuthInAction();
  const rows = await db
    .select({
      id: advisorVisionGoals.id,
      title: advisorVisionGoals.title,
      progressPct: advisorVisionGoals.progressPct,
      sortOrder: advisorVisionGoals.sortOrder,
    })
    .from(advisorVisionGoals)
    .where(
      and(
        eq(advisorVisionGoals.tenantId, auth.tenantId),
        eq(advisorVisionGoals.userId, auth.userId)
      )
    )
    .orderBy(asc(advisorVisionGoals.sortOrder), asc(advisorVisionGoals.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    progressPct: r.progressPct,
    sortOrder: r.sortOrder,
  }));
}

export type TeamBusinessPlanMemberSummary = {
  userId: string;
  displayName: string | null;
  periodLabel: string | null;
  productionActual: number;
  productionTarget: number;
  meetingsActual: number;
  meetingsTarget: number;
  newClientsActual: number;
  newClientsTarget: number;
  overallHealth: string;
};

/** Team business plan: list members with their plan progress for the given period. Requires team_overview:read. Batches plan/target queries to avoid exhausting DB pool. */
export async function getTeamBusinessPlanSummary(
  periodType: PeriodType
): Promise<TeamBusinessPlanMemberSummary[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) return [];

  const members = await listTeamMembersWithNames();
  if (members.length === 0) return [];

  const now = new Date();
  const y = now.getFullYear();
  const periodNumber =
    periodType === "month"
      ? now.getMonth() + 1
      : periodType === "quarter"
        ? Math.floor(now.getMonth() / 3) + 1
        : 0;

  const memberIds = members.map((m) => m.userId);

  const planRows = await db
    .select()
    .from(advisorBusinessPlans)
    .where(
      and(
        eq(advisorBusinessPlans.tenantId, auth.tenantId),
        eq(advisorBusinessPlans.periodType, periodType),
        eq(advisorBusinessPlans.year, y),
        eq(advisorBusinessPlans.periodNumber, periodNumber),
        eq(advisorBusinessPlans.status, "active"),
        inArray(advisorBusinessPlans.userId, memberIds)
      )
    );

  const planIds = planRows.map((p) => p.id);
  const targetsByPlanId = new Map<string, { metricType: BusinessPlanMetricType; targetValue: number; unit: MetricUnit }[]>();

  if (planIds.length > 0) {
    const targetRows = await db
      .select({
        planId: advisorBusinessPlanTargets.planId,
        metricType: advisorBusinessPlanTargets.metricType,
        targetValue: advisorBusinessPlanTargets.targetValue,
        unit: advisorBusinessPlanTargets.unit,
      })
      .from(advisorBusinessPlanTargets)
      .where(inArray(advisorBusinessPlanTargets.planId, planIds));

    for (const t of targetRows) {
      const list = targetsByPlanId.get(t.planId) ?? [];
      list.push({
        metricType: t.metricType as BusinessPlanMetricType,
        targetValue: Number(t.targetValue),
        unit: (t.unit ?? "count") as MetricUnit,
      });
      targetsByPlanId.set(t.planId, list);
    }
  }

  const plansByUserId = new Map(planRows.map((p) => [p.userId, p]));

  const result: TeamBusinessPlanMemberSummary[] = [];

  for (const mem of members) {
    const planRow = plansByUserId.get(mem.userId);

    if (!planRow?.id) {
      result.push({
        userId: mem.userId,
        displayName: mem.displayName,
        periodLabel: null,
        productionActual: 0,
        productionTarget: 0,
        meetingsActual: 0,
        meetingsTarget: 0,
        newClientsActual: 0,
        newClientsTarget: 0,
        overallHealth: "no_data",
      });
      continue;
    }

    const period = getPlanPeriod(
      planRow.periodType as PeriodType,
      planRow.year,
      planRow.periodNumber
    );
    const targets = targetsByPlanId.get(planRow.id) ?? [];

    const actuals = await computeAllMetrics(
      auth.tenantId,
      mem.userId,
      period.start,
      period.end
    );
    const planForProgress: PlanWithTargets = {
      planId: planRow.id,
      tenantId: planRow.tenantId,
      userId: planRow.userId,
      periodType: planRow.periodType,
      year: planRow.year,
      periodNumber: planRow.periodNumber,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: period.label,
      targets,
    };
    const progress = await computeProgress(planForProgress, actuals);

    const production = progress.metrics.find((m) => m.metricType === "production");
    const meetings = progress.metrics.find((m) => m.metricType === "meetings");
    const newClients = progress.metrics.find((m) => m.metricType === "new_clients");

    result.push({
      userId: mem.userId,
      displayName: mem.displayName,
      periodLabel: period.label,
      productionActual: production?.actual ?? 0,
      productionTarget: production?.target ?? 0,
      meetingsActual: meetings?.actual ?? 0,
      meetingsTarget: meetings?.target ?? 0,
      newClientsActual: newClients?.actual ?? 0,
      newClientsTarget: newClients?.target ?? 0,
      overallHealth: progress.overallHealth,
    });
  }

  return result;
}

/** Replace vision goals with the given list (by id or new). */
export async function upsertVisionGoals(
  goals: { id?: string; title: string; progressPct: number; sortOrder: number }[]
): Promise<VisionGoalRow[]> {
  const auth = await requireAuthInAction();
  await db
    .delete(advisorVisionGoals)
    .where(
      and(
        eq(advisorVisionGoals.tenantId, auth.tenantId),
        eq(advisorVisionGoals.userId, auth.userId)
      )
    );
  if (goals.length === 0) return [];
  const inserted = await db
    .insert(advisorVisionGoals)
    .values(
      goals.map((g, i) => ({
        tenantId: auth.tenantId,
        userId: auth.userId,
        title: g.title,
        progressPct: g.progressPct,
        sortOrder: g.sortOrder ?? i,
      }))
    )
    .returning({
      id: advisorVisionGoals.id,
      title: advisorVisionGoals.title,
      progressPct: advisorVisionGoals.progressPct,
      sortOrder: advisorVisionGoals.sortOrder,
    });
  return inserted.map((r) => ({
    id: r.id,
    title: r.title,
    progressPct: r.progressPct,
    sortOrder: r.sortOrder,
  }));
}
