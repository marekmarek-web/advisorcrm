/**
 * Compute business plan metrics from CRM data. Tenant and userId scoped; caller enforces auth.
 */

import { db } from "db";
import {
  contacts,
  contracts,
  opportunities,
  events,
  tasks,
  meetingNotes,
} from "db";
import { eq, and, gte, lt, isNull, isNotNull, sql, inArray } from "drizzle-orm";
import type { BusinessPlanMetricType } from "./types";

export type MetricsActuals = Partial<Record<BusinessPlanMetricType, number>>;

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
    getNewClientsCount(tenantId, userId, startStr, endStr),
    getMeetingsCount(tenantId, userId, periodStart, periodEnd),
    getFollowUpsCount(tenantId, userId, periodStart, periodEnd),
    getOpportunitiesOpenCount(tenantId, userId),
    getDealsClosedCount(tenantId, userId, periodStart, periodEnd),
    getVolumeHypo(tenantId, userId, startStr, endStr),
    getVolumeInvestments(tenantId, userId, startStr, endStr),
    getServiceActivitiesCount(tenantId, userId, periodStart, periodEnd),
    getProduction(tenantId, userId, startStr, endStr),
    getReferralsCount(tenantId, userId, startStr, endStr),
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
}

/** New referrals in period: contacts created in period with referral_contact_id set, where referrer has at least one contract with advisor_id = userId (or any in tenant if no advisor_id). */
async function getReferralsCount(
  tenantId: string,
  userId: string,
  startStr: string,
  endStr: string
): Promise<number> {
  const createdInPeriod = await db
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
  const referrersWithAdvisorContract = await db
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
}

/** New clients = contacts whose first contract (min startDate) for this advisor has startDate in period */
async function getNewClientsCount(
  tenantId: string,
  userId: string,
  startStr: string,
  endStr: string
): Promise<number> {
  const inPeriod = await db
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
  const hadBefore = await db
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
}

async function getMeetingsCount(
  tenantId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.assignedTo, userId),
        eq(events.eventType, "schuzka"),
        gte(events.startAt, periodStart),
        lt(events.startAt, periodEnd)
      )
    );
  return rows.length;
}

async function getFollowUpsCount(
  tenantId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const rows = await db
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
}

async function getOpportunitiesOpenCount(
  tenantId: string,
  userId: string
): Promise<number> {
  const rows = await db
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
}

async function getDealsClosedCount(
  tenantId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const rows = await db
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
}

async function getVolumeHypo(
  tenantId: string,
  userId: string,
  startStr: string,
  endStr: string
): Promise<number> {
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, tenantId),
        eq(contracts.advisorId, userId),
        eq(contracts.segment, "HYPO"),
        gte(contracts.startDate, startStr),
        lt(contracts.startDate, endStr)
      )
    );
  return Number(rows[0]?.total ?? 0);
}

async function getVolumeInvestments(
  tenantId: string,
  userId: string,
  startStr: string,
  endStr: string
): Promise<number> {
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, tenantId),
        eq(contracts.advisorId, userId),
        sql`${contracts.segment} IN ('INV', 'DIP', 'DPS')`,
        gte(contracts.startDate, startStr),
        lt(contracts.startDate, endStr)
      )
    );
  return Number(rows[0]?.total ?? 0);
}

async function getServiceActivitiesCount(
  tenantId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const rows = await db
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
}

async function getProduction(
  tenantId: string,
  userId: string,
  startStr: string,
  endStr: string
): Promise<number> {
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, tenantId),
        eq(contracts.advisorId, userId),
        gte(contracts.startDate, startStr),
        lt(contracts.startDate, endStr)
      )
    );
  return Number(rows[0]?.total ?? 0);
}
