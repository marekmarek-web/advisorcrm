"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { getHouseholdForContact } from "@/app/actions/households";
import type { ClientTimelineEvent } from "@/lib/timeline/types";
import {
  mapEventsToTimeline,
  mapMeetingNotesToTimeline,
  mapTasksToTimeline,
  mapOpportunitiesToTimeline,
  mapActivityLogToTimeline,
  mapFinancialAnalysesToTimeline,
  mapContractsToTimeline,
  mapDocumentsToTimeline,
  mergeAndSortTimeline,
} from "@/lib/timeline/normalize";
import type {
  EventRowForTimeline,
  MeetingNoteRowForTimeline,
  TaskRowForTimeline,
  OpportunityRowForTimeline,
  ActivityLogRowForTimeline,
  FinancialAnalysisRowForTimeline,
  ContractRowForTimeline,
  DocumentRowForTimeline,
} from "@/lib/timeline/normalize";
import {
  db,
  events,
  meetingNotes,
  tasks,
  opportunities,
  opportunityStages,
  financialAnalyses,
  contracts,
  documents,
  activityLog,
} from "db";
import { eq, and, or, desc, inArray } from "db";

const PER_SOURCE_LIMIT = 25;
const TIMELINE_TOTAL_LIMIT = 80;

export async function getClientTimeline(contactId: string): Promise<ClientTimelineEvent[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (!auth.contactId || auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  const household = await getHouseholdForContact(contactId);
  const householdId = household?.id ?? null;

  const tenantId = auth.tenantId;

  const [
    eventRows,
    meetingNoteRows,
    taskRows,
    opportunityRows,
    activityLogRows,
    analysisRows,
    contractRows,
    documentRows,
  ] = await Promise.all([
    db
      .select({
        id: events.id,
        contactId: events.contactId,
        title: events.title,
        eventType: events.eventType,
        startAt: events.startAt,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(
        and(eq(events.tenantId, tenantId), eq(events.contactId, contactId))
      )
      .orderBy(desc(events.startAt))
      .limit(PER_SOURCE_LIMIT),

    db
      .select({
        id: meetingNotes.id,
        contactId: meetingNotes.contactId,
        meetingAt: meetingNotes.meetingAt,
        domain: meetingNotes.domain,
        createdAt: meetingNotes.createdAt,
      })
      .from(meetingNotes)
      .where(
        and(eq(meetingNotes.tenantId, tenantId), eq(meetingNotes.contactId, contactId))
      )
      .orderBy(desc(meetingNotes.meetingAt))
      .limit(PER_SOURCE_LIMIT),

    db
      .select({
        id: tasks.id,
        contactId: tasks.contactId,
        title: tasks.title,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.contactId, contactId)))
      .orderBy(desc(tasks.createdAt))
      .limit(PER_SOURCE_LIMIT),

    householdId
      ? db
          .select({
            id: opportunities.id,
            contactId: opportunities.contactId,
            householdId: opportunities.householdId,
            title: opportunities.title,
            createdAt: opportunities.createdAt,
            closedAt: opportunities.closedAt,
            closedAs: opportunities.closedAs,
            stageName: opportunityStages.name,
          })
          .from(opportunities)
          .leftJoin(opportunityStages, eq(opportunities.stageId, opportunityStages.id))
          .where(
            and(
              eq(opportunities.tenantId, tenantId),
              or(
                eq(opportunities.contactId, contactId),
                eq(opportunities.householdId, householdId)
              )
            )
          )
          .orderBy(desc(opportunities.createdAt))
          .limit(PER_SOURCE_LIMIT * 2)
      : db
          .select({
            id: opportunities.id,
            contactId: opportunities.contactId,
            householdId: opportunities.householdId,
            title: opportunities.title,
            createdAt: opportunities.createdAt,
            closedAt: opportunities.closedAt,
            closedAs: opportunities.closedAs,
            stageName: opportunityStages.name,
          })
          .from(opportunities)
          .leftJoin(opportunityStages, eq(opportunities.stageId, opportunityStages.id))
          .where(
            and(
              eq(opportunities.tenantId, tenantId),
              eq(opportunities.contactId, contactId)
            )
          )
          .orderBy(desc(opportunities.createdAt))
          .limit(PER_SOURCE_LIMIT * 2),

    Promise.resolve([]) as Promise<ActivityLogRowForTimeline[]>,
    householdId
      ? db
          .select({
            id: financialAnalyses.id,
            contactId: financialAnalyses.contactId,
            householdId: financialAnalyses.householdId,
            status: financialAnalyses.status,
            type: financialAnalyses.type,
            createdAt: financialAnalyses.createdAt,
            updatedAt: financialAnalyses.updatedAt,
            lastExportedAt: financialAnalyses.lastExportedAt,
          })
          .from(financialAnalyses)
          .where(
            and(
              eq(financialAnalyses.tenantId, tenantId),
              or(
                eq(financialAnalyses.contactId, contactId),
                eq(financialAnalyses.householdId, householdId)
              )
            )
          )
          .orderBy(desc(financialAnalyses.updatedAt))
          .limit(PER_SOURCE_LIMIT)
      : db
          .select({
            id: financialAnalyses.id,
            contactId: financialAnalyses.contactId,
            householdId: financialAnalyses.householdId,
            status: financialAnalyses.status,
            type: financialAnalyses.type,
            createdAt: financialAnalyses.createdAt,
            updatedAt: financialAnalyses.updatedAt,
            lastExportedAt: financialAnalyses.lastExportedAt,
          })
          .from(financialAnalyses)
          .where(
            and(
              eq(financialAnalyses.tenantId, tenantId),
              eq(financialAnalyses.contactId, contactId)
            )
          )
          .orderBy(desc(financialAnalyses.updatedAt))
          .limit(PER_SOURCE_LIMIT),

    db
      .select({
        id: contracts.id,
        contactId: contracts.contactId,
        segment: contracts.segment,
        partnerName: contracts.partnerName,
        createdAt: contracts.createdAt,
      })
      .from(contracts)
      .where(
        and(eq(contracts.tenantId, tenantId), eq(contracts.contactId, contactId))
      )
      .orderBy(desc(contracts.createdAt))
      .limit(PER_SOURCE_LIMIT),

    db
      .select({
        id: documents.id,
        contactId: documents.contactId,
        name: documents.name,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(
        and(eq(documents.tenantId, tenantId), eq(documents.contactId, contactId))
      )
      .orderBy(desc(documents.createdAt))
      .limit(PER_SOURCE_LIMIT),
  ]);

  const opportunityIds = opportunityRows.map((o) => o.id);
  let activityRows: ActivityLogRowForTimeline[] = [];
  if (opportunityIds.length > 0) {
    const stages = await db
      .select({ id: opportunityStages.id, name: opportunityStages.name })
      .from(opportunityStages)
      .where(eq(opportunityStages.tenantId, tenantId));
    const stageIdToName: Record<string, string> = Object.fromEntries(
      stages.map((s) => [s.id, s.name ?? ""])
    );
    const raw = await db
      .select({
        id: activityLog.id,
        entityId: activityLog.entityId,
        action: activityLog.action,
        meta: activityLog.meta,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.tenantId, tenantId),
          eq(activityLog.entityType, "opportunity"),
          inArray(activityLog.entityId, opportunityIds)
        )
      )
      .orderBy(desc(activityLog.createdAt))
      .limit(50);
    activityRows = raw
      .filter((r) => r.action === "status_change")
      .map((r) => {
        const meta = (r.meta as { stageId?: string } | null) ?? null;
        const stageId = meta?.stageId;
        const stageName = stageId ? stageIdToName[stageId] ?? stageId : undefined;
        return {
          id: r.id,
          entityId: r.entityId,
          action: r.action,
          meta: { ...meta, stageName },
          createdAt: r.createdAt,
        };
      });
  }

  const opportunityTitles: Record<string, string> = Object.fromEntries(
    opportunityRows.map((o) => [o.id, o.title])
  );
  for (const r of activityRows) {
    if (!(r.entityId in opportunityTitles))
      opportunityTitles[r.entityId] = "Obchod";
  }

  const oppForTimeline: OpportunityRowForTimeline[] = opportunityRows.map((o) => ({
    id: o.id,
    contactId: o.contactId,
    householdId: o.householdId,
    title: o.title,
    stageName: o.stageName ?? null,
    createdAt: o.createdAt,
    updatedAt: o.createdAt,
    closedAt: o.closedAt ?? null,
    closedAs: o.closedAs ?? null,
  }));

  const all: ClientTimelineEvent[] = [
    ...mapEventsToTimeline(
      eventRows as EventRowForTimeline[],
      contactId,
      householdId
    ),
    ...mapMeetingNotesToTimeline(
      meetingNoteRows as MeetingNoteRowForTimeline[],
      contactId
    ),
    ...mapTasksToTimeline(taskRows as TaskRowForTimeline[], contactId),
    ...mapOpportunitiesToTimeline(oppForTimeline, contactId, householdId),
    ...mapActivityLogToTimeline(
      activityRows,
      opportunityTitles,
      contactId,
      householdId
    ),
    ...mapFinancialAnalysesToTimeline(
      analysisRows as FinancialAnalysisRowForTimeline[],
      contactId,
      householdId
    ),
    ...mapContractsToTimeline(contractRows as ContractRowForTimeline[], contactId),
    ...mapDocumentsToTimeline(documentRows as DocumentRowForTimeline[], contactId),
  ];

  return mergeAndSortTimeline(all, TIMELINE_TOTAL_LIMIT);
}
