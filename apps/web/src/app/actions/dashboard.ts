"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { getCzPublicHolidayLabel, getPragueCalendarParts } from "@/lib/calendar/cz-public-holidays";
import { getCzNameDaysForDate } from "@/lib/calendar/cz-name-days";
import { czechAgendaDateShort, czechRelativeAgendaDay, ymdToUtcNoonMs } from "@/lib/dashboard/side-panel-agenda-labels";
import type { DashboardAgendaTimelineRow } from "@/app/portal/today/dashboard-agenda-types";
import { db } from "db";
import { events, tasks, opportunities, contacts, contracts, activityLog, opportunityStages } from "db";
import { eq, and, gte, lt, isNull, isNotNull, asc, desc, sql, inArray } from "db";

export type TodayEvent = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  contactName: string | null;
};

export type DashboardKpis = {
  meetingsToday: number;
  tasksOpen: number;
  opportunitiesOpen: number;
  totalContacts: number;
  todayEvents: TodayEvent[];
  overdueTasks: Array<{ id: string; title: string; dueDate: string; contactName: string | null }>;
  upcomingAnniversaries: Array<{ id: string; contactId: string; partnerName: string | null; segment: string; anniversaryDate: string; contactName: string }>;
  serviceDueContacts: Array<{ id: string; firstName: string; lastName: string; nextServiceDue: string }>;
  pipelineAtRisk: Array<{ id: string; title: string; expectedCloseDate: string; contactName: string | null }>;
  recentActivity: Array<{ id: string; action: string; entityType: string; meta?: Record<string, unknown> | null; createdAt: Date }>;
  /** Neuzavřené úkoly s dueDate = dnes (pro Dnešní priority). */
  tasksDueToday: Array<{ id: string; title: string; dueDate: string; contactName: string | null }>;
  /** Obchody ve fázích sortOrder 3 a 4 (Před uzavřením, Realizace). */
  opportunitiesInStep3And4: Array<{ id: string; title: string; stageName: string; contactName: string | null }>;
  /** Státní svátek dle kalendáře Europe/Prague (null = běžný den). */
  czPublicHolidayToday: string | null;
  /** Jména podle českého občanského kalendáře jmen (Europe/Prague, stejný den jako svátky). */
  czNameDaysToday: string[];
  /** Kontakty s narozeninami dnes (MM-DD v Europe/Prague). */
  birthdaysToday: Array<{ id: string; firstName: string; lastName: string; age: number }>;
  /** Události a úkoly pro postranní panel (dnes až +14 dní, seřazeno). */
  sidePanelAgendaTimeline: DashboardAgendaTimelineRow[];
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const auth = await requireAuthInAction();
  const pragueToday = getPragueCalendarParts();
  const czPublicHolidayToday = getCzPublicHolidayLabel(pragueToday.year, pragueToday.month, pragueToday.day);
  const czNameDaysToday = getCzNameDaysForDate(pragueToday.year, pragueToday.month, pragueToday.day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStr = today.toISOString().slice(0, 10);
  const in7days = new Date(today);
  in7days.setDate(in7days.getDate() + 7);
  const in7daysStr = in7days.toISOString().slice(0, 10);
  const in30days = new Date(today);
  in30days.setDate(in30days.getDate() + 30);
  const in30daysStr = in30days.toISOString().slice(0, 10);
  const in14days = new Date(today);
  in14days.setDate(in14days.getDate() + 14);
  const in14daysStr = in14days.toISOString().slice(0, 10);
  const agendaEndExclusive = new Date(today);
  agendaEndExclusive.setDate(agendaEndExclusive.getDate() + 15);

  const [
    meetingsList,
    tasksList,
    opportunitiesList,
    contactsCountList,
    overdueTasksList,
    tasksDueTodayList,
    anniversariesList,
    serviceDueList,
    pipelineAtRiskList,
    opportunitiesStep3And4List,
    recentActivityList,
    birthdaysTodayList,
    upcomingEventsPanelList,
    upcomingTasksPanelList,
  ] = await Promise.all([
    db
      .select({
        id: events.id,
        title: events.title,
        startAt: events.startAt,
        endAt: events.endAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(events)
      .leftJoin(contacts, eq(events.contactId, contacts.id))
      .where(
        and(
          eq(events.tenantId, auth.tenantId),
          gte(events.startAt, today),
          lt(events.startAt, tomorrow)
        )
      )
      .orderBy(asc(events.startAt)),
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(eq(tasks.tenantId, auth.tenantId), isNull(tasks.completedAt))
      ),
    db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenantId, auth.tenantId),
          isNull(opportunities.closedAt)
        )
      ),
    db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.tenantId, auth.tenantId)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(tasks)
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .where(
        and(
          eq(tasks.tenantId, auth.tenantId),
          isNull(tasks.completedAt),
          sql`${tasks.dueDate}::date < ${todayStr}::date`
        )
      )
      .orderBy(asc(tasks.dueDate))
      .limit(5),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(tasks)
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .where(
        and(
          eq(tasks.tenantId, auth.tenantId),
          isNull(tasks.completedAt),
          sql`${tasks.dueDate}::date = ${todayStr}::date`
        )
      )
      .orderBy(asc(tasks.dueDate))
      .limit(10),
    db
      .select({
        id: contracts.id,
        contactId: contacts.id,
        partnerName: contracts.partnerName,
        segment: contracts.segment,
        anniversaryDate: contracts.anniversaryDate,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(contracts)
      .innerJoin(contacts, eq(contracts.contactId, contacts.id))
      .where(
        and(
          eq(contracts.tenantId, auth.tenantId),
          sql`${contracts.anniversaryDate}::date >= ${todayStr}::date`,
          sql`${contracts.anniversaryDate}::date <= ${in30daysStr}::date`
        )
      )
      .orderBy(asc(contracts.anniversaryDate))
      .limit(5),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        nextServiceDue: contacts.nextServiceDue,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          sql`${contacts.nextServiceDue}::date >= ${todayStr}::date`,
          sql`${contacts.nextServiceDue}::date <= ${in7daysStr}::date`
        )
      )
      .orderBy(asc(contacts.nextServiceDue))
      .limit(5),
    db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        expectedCloseDate: opportunities.expectedCloseDate,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(opportunities)
      .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
      .where(
        and(
          eq(opportunities.tenantId, auth.tenantId),
          isNull(opportunities.closedAt),
          sql`${opportunities.expectedCloseDate}::date < ${todayStr}::date`
        )
      )
      .orderBy(asc(opportunities.expectedCloseDate))
      .limit(5),
    db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        stageName: opportunityStages.name,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(opportunities)
      .innerJoin(opportunityStages, eq(opportunities.stageId, opportunityStages.id))
      .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
      .where(
        and(
          eq(opportunities.tenantId, auth.tenantId),
          eq(opportunityStages.tenantId, auth.tenantId),
          isNull(opportunities.closedAt),
          inArray(opportunityStages.sortOrder, [3, 4])
        )
      )
      .orderBy(opportunityStages.sortOrder)
      .limit(10),
    db
      .select({
        id: activityLog.id,
        action: activityLog.action,
        entityType: activityLog.entityType,
        meta: activityLog.meta,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .where(eq(activityLog.tenantId, auth.tenantId))
      .orderBy(desc(activityLog.createdAt))
      .limit(10),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        birthDate: contacts.birthDate,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          isNull(contacts.archivedAt),
          isNotNull(contacts.birthDate),
          sql`to_char(${contacts.birthDate}, 'MM-DD') = ${pragueToday.mmdd}`
        )
      )
      .orderBy(asc(contacts.lastName), asc(contacts.firstName))
      .limit(25),
    db
      .select({
        id: events.id,
        title: events.title,
        startAt: events.startAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(events)
      .leftJoin(contacts, eq(events.contactId, contacts.id))
      .where(
        and(
          eq(events.tenantId, auth.tenantId),
          gte(events.startAt, today),
          lt(events.startAt, agendaEndExclusive)
        )
      )
      .orderBy(asc(events.startAt))
      .limit(20),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(tasks)
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .where(
        and(
          eq(tasks.tenantId, auth.tenantId),
          isNull(tasks.completedAt),
          isNotNull(tasks.dueDate),
          sql`${tasks.dueDate}::date >= ${todayStr}::date`,
          sql`${tasks.dueDate}::date <= ${in14daysStr}::date`
        )
      )
      .orderBy(asc(tasks.dueDate))
      .limit(20),
  ]);

  const todayEvents: TodayEvent[] = meetingsList.map((e) => ({
    id: e.id,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    contactName: e.contactFirstName && e.contactLastName
      ? `${e.contactFirstName} ${e.contactLastName}`
      : null,
  }));

  const overdueTasks = overdueTasksList.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate!,
    contactName: t.contactFirstName && t.contactLastName
      ? `${t.contactFirstName} ${t.contactLastName}`
      : null,
  }));

  const upcomingAnniversaries = anniversariesList.map((c) => ({
    id: c.id,
    contactId: c.contactId,
    partnerName: c.partnerName,
    segment: c.segment,
    anniversaryDate: c.anniversaryDate!,
    contactName: `${c.contactFirstName} ${c.contactLastName}`,
  }));

  const serviceDueContacts = serviceDueList.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    nextServiceDue: c.nextServiceDue!,
  }));

  const pipelineAtRisk = pipelineAtRiskList.map((o) => ({
    id: o.id,
    title: o.title,
    expectedCloseDate: o.expectedCloseDate!,
    contactName: o.contactFirstName && o.contactLastName
      ? `${o.contactFirstName} ${o.contactLastName}`
      : null,
  }));

  const tasksDueToday = tasksDueTodayList.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate!,
    contactName: t.contactFirstName && t.contactLastName
      ? `${t.contactFirstName} ${t.contactLastName}`
      : null,
  }));

  const opportunitiesInStep3And4 = opportunitiesStep3And4List.map((o) => ({
    id: o.id,
    title: o.title,
    stageName: o.stageName,
    contactName: o.contactFirstName && o.contactLastName
      ? `${o.contactFirstName} ${o.contactLastName}`
      : null,
  }));

  const recentActivity = recentActivityList.map((a) => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    meta: a.meta as Record<string, unknown> | null | undefined,
    createdAt: a.createdAt,
  }));

  const birthdaysToday = birthdaysTodayList.map((c) => {
    const y = c.birthDate ? parseInt(c.birthDate.slice(0, 4), 10) : NaN;
    const age = Number.isFinite(y) ? pragueToday.year - y : 0;
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      age,
    };
  });

  const agendaCandidates: { sort: number; row: DashboardAgendaTimelineRow }[] = [];
  for (const e of upcomingEventsPanelList) {
    const ymd = getPragueCalendarParts(new Date(e.startAt)).ymd;
    const contactName =
      e.contactFirstName && e.contactLastName ? `${e.contactFirstName} ${e.contactLastName}` : null;
    agendaCandidates.push({
      sort: new Date(e.startAt).getTime(),
      row: {
        id: `ev-${e.id}`,
        kind: "event",
        time: new Date(e.startAt).toLocaleTimeString("cs-CZ", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Prague",
        }),
        title: e.title,
        sub: contactName ?? undefined,
        dateShort: czechAgendaDateShort(ymd),
        relativeLabel: czechRelativeAgendaDay(ymd, pragueToday.ymd),
      },
    });
  }
  for (const t of upcomingTasksPanelList) {
    const raw = t.dueDate!;
    const ymd = raw.length >= 10 ? raw.slice(0, 10) : raw;
    const contactName =
      t.contactFirstName && t.contactLastName ? `${t.contactFirstName} ${t.contactLastName}` : null;
    const base = ymdToUtcNoonMs(ymd);
    agendaCandidates.push({
      sort: Number.isFinite(base) ? base + 18 * 3600000 : Date.now(),
      row: {
        id: `task-${t.id}`,
        kind: "task",
        time: "Úkol",
        title: t.title,
        sub: contactName ?? undefined,
        dateShort: czechAgendaDateShort(ymd),
        relativeLabel: czechRelativeAgendaDay(ymd, pragueToday.ymd),
      },
    });
  }
  agendaCandidates.sort((a, b) => a.sort - b.sort);
  const sidePanelAgendaTimeline = agendaCandidates.slice(0, 15).map((c) => c.row);

  return {
    meetingsToday: meetingsList.length,
    tasksOpen: tasksList.length,
    opportunitiesOpen: opportunitiesList.length,
    totalContacts: contactsCountList.length,
    todayEvents,
    overdueTasks,
    upcomingAnniversaries,
    serviceDueContacts,
    pipelineAtRisk,
    recentActivity,
    tasksDueToday,
    opportunitiesInStep3And4,
    czPublicHolidayToday,
    czNameDaysToday,
    birthdaysToday,
    sidePanelAgendaTimeline,
  };
}
