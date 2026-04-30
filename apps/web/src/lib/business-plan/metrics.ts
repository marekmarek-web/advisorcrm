/**
 * Compute business plan metrics from CRM data. Tenant and userId scoped; caller enforces auth.
 */

import {
  contacts,
  contracts,
  opportunities,
  events,
  tasks,
  meetingNotes,
} from "db";
import { eq, and, gte, lt, isNull, isNotNull, sql, inArray } from "db";
import type { BusinessPlanMetricType } from "./types";
import { withTenantContext } from "@/lib/db/with-tenant-context";

export type MetricsActuals = Partial<Record<BusinessPlanMetricType, number>>;

/**
 * Kalendářní události počítané jako „schůzky“ v business plánu (konzistence s referral / funnel).
 */
export const BUSINESS_PLAN_MEETING_EVENT_TYPES = ["schuzka", "followup", "kafe"] as const;

function contractProductionDateGte(dateStr: string) {
  return sql`(CASE
    WHEN ${contracts.sourceKind} = 'ai_review'
      THEN COALESCE(${contracts.advisorConfirmedAt}::date, ${contracts.startDate}::date)
    ELSE ${contracts.startDate}::date
  END) >= ${dateStr}`;
}

function contractProductionDateLt(dateStr: string) {
  return sql`(CASE
    WHEN ${contracts.sourceKind} = 'ai_review'
      THEN COALESCE(${contracts.advisorConfirmedAt}::date, ${contracts.startDate}::date)
    ELSE ${contracts.startDate}::date
  END) < ${dateStr}`;
}

/**
 * Compute all metric actuals for the given period. periodStart/periodEnd are Date objects (start of day and exclusive end).
 */
export async function computeAllMetrics(
  tenantId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<MetricsActuals> {
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr = periodEnd.toISOString().slice(0, 10);

  return withTenantContext({ tenantId, userId }, async (tx) => {
    const [
      newClientsRow,
      meetingsRow,
      followUpsRow,
      opportunitiesOpenRow,
      dealsClosedRow,
      volumeHypoRow,
      volumeInvestmentsRow,
      serviceActivitiesRow,
      productionRow,
      referralsRow,
    ] = await Promise.all([
      (async () => {
        const inPeriod = await tx
          .selectDistinct({ contactId: contracts.contactId })
          .from(contracts)
          .where(
            and(
              eq(contracts.tenantId, tenantId),
              eq(contracts.advisorId, userId),
              gte(contracts.startDate, startStr),
              lt(contracts.startDate, endStr)
            )
          );
        const contactIdsInPeriod = inPeriod.map((r) => r.contactId).filter(Boolean) as string[];
        if (contactIdsInPeriod.length === 0) return 0;
        const hadBefore = await tx
          .selectDistinct({ contactId: contracts.contactId })
          .from(contracts)
          .where(
            and(
              eq(contracts.tenantId, tenantId),
              eq(contracts.advisorId, userId),
              lt(contracts.startDate, startStr),
              inArray(contracts.contactId, contactIdsInPeriod)
            )
          );
        const hadBeforeSet = new Set(hadBefore.map((r) => r.contactId));
        return contactIdsInPeriod.filter((id) => !hadBeforeSet.has(id)).length;
      })(),
      (async () => {
        const rows = await tx
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.tenantId, tenantId),
              eq(events.assignedTo, userId),
              inArray(events.eventType, [...BUSINESS_PLAN_MEETING_EVENT_TYPES]),
              gte(events.startAt, periodStart),
              lt(events.startAt, periodEnd)
            )
          );
        return rows.length;
      })(),
      (async () => {
        const rows = await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.tenantId, tenantId),
              eq(tasks.assignedTo, userId),
              isNotNull(tasks.completedAt),
              gte(tasks.completedAt, periodStart),
              lt(tasks.completedAt, periodEnd)
            )
          );
        return rows.length;
      })(),
      (async () => {
        const rows = await tx
          .select({ id: opportunities.id })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.tenantId, tenantId),
              eq(opportunities.assignedTo, userId),
              isNull(opportunities.closedAt)
            )
          );
        return rows.length;
      })(),
      (async () => {
        const rows = await tx
          .select({ id: opportunities.id })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.tenantId, tenantId),
              eq(opportunities.assignedTo, userId),
              eq(opportunities.closedAs, "won"),
              isNotNull(opportunities.closedAt),
              gte(opportunities.closedAt, periodStart),
              lt(opportunities.closedAt, periodEnd)
            )
          );
        return rows.length;
      })(),
      (async () => {
        const rows = await tx
          .select({ total: sql<string>`coalesce(sum(${contracts.bjUnits}::numeric), 0)` })
          .from(contracts)
          .where(
            and(
              eq(contracts.tenantId, tenantId),
              eq(contracts.advisorId, userId),
              eq(contracts.segment, "HYPO"),
              contractProductionDateGte(startStr),
              contractProductionDateLt(endStr)
            )
          );
        return Number(rows[0]?.total ?? 0);
      })(),
      (async () => {
        const rows = await tx
          .select({ total: sql<string>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)` })
          .from(contracts)
          .where(
            and(
              eq(contracts.tenantId, tenantId),
              eq(contracts.advisorId, userId),
              sql`${contracts.segment} IN ('INV', 'DIP', 'DPS')`,
              contractProductionDateGte(startStr),
              contractProductionDateLt(endStr)
            )
          );
        return Number(rows[0]?.total ?? 0);
      })(),
      (async () => {
        const rows = await tx
          .select({ id: meetingNotes.id })
          .from(meetingNotes)
          .where(
            and(
              eq(meetingNotes.tenantId, tenantId),
              eq(meetingNotes.createdBy, userId),
              gte(meetingNotes.meetingAt, periodStart),
              lt(meetingNotes.meetingAt, periodEnd)
            )
          );
        return rows.length;
      })(),
      (async () => {
        const rows = await tx
          .select({ total: sql<string>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)` })
          .from(contracts)
          .where(
            and(
              eq(contracts.tenantId, tenantId),
              eq(contracts.advisorId, userId),
              contractProductionDateGte(startStr),
              contractProductionDateLt(endStr)
            )
          );
        return Number(rows[0]?.total ?? 0);
      })(),
      (async () => {
        const createdInPeriod = await tx
          .select({ id: contacts.id, referralContactId: contacts.referralContactId })
          .from(contacts)
          .where(
            and(
              eq(contacts.tenantId, tenantId),
              isNotNull(contacts.referralContactId),
              gte(contacts.createdAt, new Date(startStr)),
              lt(contacts.createdAt, new Date(endStr))
            )
          );
        const referrerIds = [...new Set(createdInPeriod.map((r) => r.referralContactId).filter(Boolean))] as string[];
        if (referrerIds.length === 0) return 0;
        const referrersWithAdvisorContract = await tx
          .selectDistinct({ contactId: contracts.contactId })
          .from(contracts)
          .where(
            and(
              eq(contracts.tenantId, tenantId),
              eq(contracts.advisorId, userId),
              inArray(contracts.contactId, referrerIds)
            )
          );
        const allowedReferrerIds = new Set(referrersWithAdvisorContract.map((r) => r.contactId).filter(Boolean));
        return createdInPeriod.filter((r) => r.referralContactId && allowedReferrerIds.has(r.referralContactId!)).length;
      })(),
    ]);

    return {
      new_clients: newClientsRow,
      meetings: meetingsRow,
      follow_ups: followUpsRow,
      opportunities_open: opportunitiesOpenRow,
      deals_closed: dealsClosedRow,
      volume_hypo: volumeHypoRow,
      volume_investments: volumeInvestmentsRow,
      service_activities: serviceActivitiesRow,
      production: productionRow,
      referrals: referralsRow,
    };
  });
}

/** Phone calls (events with eventType = 'telefonat') in period. Used for funnel. */
export async function getCallsCount(
  tenantId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  return withTenantContext({ tenantId, userId }, async (tx) => {
    const rows = await tx
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.tenantId, tenantId),
          eq(events.assignedTo, userId),
          eq(events.eventType, "telefonat"),
          gte(events.startAt, periodStart),
          lt(events.startAt, periodEnd)
        )
      );
    return rows.length;
  });
}

/**
 * Production by segment for mix donut: BJ by investice (INV+DIP), penze (DPS), ŽP, hypo.
 * Oddělené DPS odpovídá reportingu „plánovaný mix“.
 */
export async function getProductionMix(
  tenantId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ investments: number; pension: number; life: number; hypo: number }> {
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr = periodEnd.toISOString().slice(0, 10);
  return withTenantContext({ tenantId, userId }, async (tx) => {
    const base = and(
      eq(contracts.tenantId, tenantId),
      eq(contracts.advisorId, userId),
      contractProductionDateGte(startStr),
      contractProductionDateLt(endStr)
    );
    const [inv, penze, zp, hypo] = await Promise.all([
      tx
        .select({ total: sql<string>`coalesce(sum(${contracts.bjUnits}::numeric), 0)` })
        .from(contracts)
        .where(and(base, sql`${contracts.segment} IN ('INV', 'DIP')`)),
      tx
        .select({ total: sql<string>`coalesce(sum(${contracts.bjUnits}::numeric), 0)` })
        .from(contracts)
        .where(and(base, eq(contracts.segment, "DPS"))),
      tx
        .select({ total: sql<string>`coalesce(sum(${contracts.bjUnits}::numeric), 0)` })
        .from(contracts)
        .where(and(base, eq(contracts.segment, "ZP"))),
      tx
        .select({ total: sql<string>`coalesce(sum(${contracts.bjUnits}::numeric), 0)` })
        .from(contracts)
        .where(and(base, eq(contracts.segment, "HYPO"))),
    ]);
    return {
      investments: Number(inv[0]?.total ?? 0),
      pension: Number(penze[0]?.total ?? 0),
      life: Number(zp[0]?.total ?? 0),
      hypo: Number(hypo[0]?.total ?? 0),
    };
  });
}
