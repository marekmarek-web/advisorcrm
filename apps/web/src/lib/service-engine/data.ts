/**
 * Service engine data layer: load all inputs needed to compute recommendations.
 * Caller must enforce auth and tenant; this module only runs tenant-scoped queries.
 */

import { db } from "db";
import {
  contacts,
  contracts,
  events,
  meetingNotes,
  tasks,
  opportunities,
  financialAnalyses,
} from "db";
import { eq, and, isNull, desc, gte } from "drizzle-orm";

export type ServiceInputContact = {
  id: string;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  serviceCycleMonths: string | null;
  createdAt: Date;
};

export type ServiceInputContract = {
  id: string;
  segment: string;
  partnerName: string | null;
  startDate: string | null;
  anniversaryDate: string | null;
};

export type ServiceInputAnalysis = {
  id: string;
  status: string;
  updatedAt: Date;
};

export type ServiceInputTask = {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: Date | null;
};

export type ServiceInputOpportunity = {
  id: string;
  title: string;
  closedAt: Date | null;
  closedAs: string | null;
};

export type ServiceInputData = {
  contact: ServiceInputContact | null;
  contracts: ServiceInputContract[];
  contractsWithAnniversaryInWindow: ServiceInputContract[];
  lastEventDate: Date | null;
  lastMeetingNoteDate: Date | null;
  analyses: ServiceInputAnalysis[];
  openTasks: ServiceInputTask[];
  opportunitiesClosedRecently: ServiceInputOpportunity[];
};

const ANNIVERSARY_WINDOW_DAYS = 60;
const POST_DEAL_WINDOW_DAYS = 90;
const ANALYSIS_STALE_MONTHS = 12;
const LONG_NO_CONTACT_MONTHS = 6;
const REACTIVATION_MONTHS = 12;

export const SERVICE_ENGINE_CONSTANTS = {
  ANNIVERSARY_WINDOW_DAYS,
  POST_DEAL_WINDOW_DAYS,
  ANALYSIS_STALE_MONTHS,
  LONG_NO_CONTACT_MONTHS,
  REACTIVATION_MONTHS,
} as const;

/**
 * Load all service-relevant data for one contact. Tenant-scoped; caller must enforce auth.
 */
export async function getServiceInputData(
  tenantId: string,
  contactId: string
): Promise<ServiceInputData> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const anniversaryEnd = new Date(today);
  anniversaryEnd.setDate(anniversaryEnd.getDate() + ANNIVERSARY_WINDOW_DAYS);
  const anniversaryEndStr = anniversaryEnd.toISOString().slice(0, 10);
  const postDealStart = new Date(today);
  postDealStart.setDate(postDealStart.getDate() - POST_DEAL_WINDOW_DAYS);

  const [
    contactRows,
    contractRows,
    lastEventRows,
    lastNoteRows,
    analysisRows,
    taskRows,
    opportunityRows,
  ] = await Promise.all([
    db
      .select({
        id: contacts.id,
        lastServiceDate: contacts.lastServiceDate,
        nextServiceDue: contacts.nextServiceDue,
        serviceCycleMonths: contacts.serviceCycleMonths,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
      .limit(1),
    db
      .select({
        id: contracts.id,
        segment: contracts.segment,
        partnerName: contracts.partnerName,
        startDate: contracts.startDate,
        anniversaryDate: contracts.anniversaryDate,
      })
      .from(contracts)
      .where(and(eq(contracts.tenantId, tenantId), eq(contracts.contactId, contactId))),
    db
      .select({ startAt: events.startAt })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.contactId, contactId)))
      .orderBy(desc(events.startAt))
      .limit(1),
    db
      .select({ meetingAt: meetingNotes.meetingAt })
      .from(meetingNotes)
      .where(and(eq(meetingNotes.tenantId, tenantId), eq(meetingNotes.contactId, contactId)))
      .orderBy(desc(meetingNotes.meetingAt))
      .limit(1),
    db
      .select({
        id: financialAnalyses.id,
        status: financialAnalyses.status,
        updatedAt: financialAnalyses.updatedAt,
      })
      .from(financialAnalyses)
      .where(
        and(
          eq(financialAnalyses.tenantId, tenantId),
          eq(financialAnalyses.contactId, contactId)
        )
      )
      .orderBy(desc(financialAnalyses.updatedAt)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          eq(tasks.contactId, contactId),
          isNull(tasks.completedAt)
        )
      ),
    db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        closedAt: opportunities.closedAt,
        closedAs: opportunities.closedAs,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenantId, tenantId),
          eq(opportunities.contactId, contactId),
          gte(opportunities.closedAt, postDealStart),
          eq(opportunities.closedAs, "won")
        )
      )
      .orderBy(desc(opportunities.closedAt)),
  ]);

  const contact: ServiceInputContact | null = contactRows[0]
    ? {
        id: contactRows[0].id,
        lastServiceDate: contactRows[0].lastServiceDate,
        nextServiceDue: contactRows[0].nextServiceDue,
        serviceCycleMonths: contactRows[0].serviceCycleMonths,
        createdAt: contactRows[0].createdAt,
      }
    : null;

  const contractsList: ServiceInputContract[] = contractRows.map((r) => ({
    id: r.id,
    segment: r.segment,
    partnerName: r.partnerName,
    startDate: r.startDate,
    anniversaryDate: r.anniversaryDate,
  }));

  const contractsWithAnniversaryInWindow = contractRows.filter((r) => {
    if (!r.anniversaryDate) return false;
    const ann = r.anniversaryDate;
    return ann >= todayStr && ann <= anniversaryEndStr;
  }).map((r) => ({
    id: r.id,
    segment: r.segment,
    partnerName: r.partnerName,
    startDate: r.startDate,
    anniversaryDate: r.anniversaryDate,
  }));

  const lastEventDate = lastEventRows[0]?.startAt ?? null;
  const lastMeetingNoteDate = lastNoteRows[0]?.meetingAt ?? null;

  const analyses: ServiceInputAnalysis[] = analysisRows.map((r) => ({
    id: r.id,
    status: r.status,
    updatedAt: r.updatedAt,
  }));

  const openTasks: ServiceInputTask[] = taskRows.map((r) => ({
    id: r.id,
    title: r.title,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
  }));

  const opportunitiesClosedRecently: ServiceInputOpportunity[] = opportunityRows.map((r) => ({
    id: r.id,
    title: r.title,
    closedAt: r.closedAt,
    closedAs: r.closedAs,
  }));

  return {
    contact,
    contracts: contractsList,
    contractsWithAnniversaryInWindow,
    lastEventDate,
    lastMeetingNoteDate,
    analyses,
    openTasks,
    opportunitiesClosedRecently,
  };
}

/** Latest contact date: lastServiceDate, last event, or last meeting note. */
export function getEffectiveLastContactDate(data: ServiceInputData): Date | null {
  const candidates: Date[] = [];
  if (data.contact?.lastServiceDate) {
    candidates.push(new Date(data.contact.lastServiceDate));
  }
  if (data.lastEventDate) candidates.push(data.lastEventDate);
  if (data.lastMeetingNoteDate) candidates.push(data.lastMeetingNoteDate);
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

/** Primary analysis: most recent completed or draft. */
export function getPrimaryAnalysis(data: ServiceInputData): ServiceInputAnalysis | null {
  const completed = data.analyses.filter((a) =>
    ["completed", "exported"].includes(a.status)
  );
  const list = completed.length > 0 ? completed : data.analyses;
  return list[0] ?? null;
}
