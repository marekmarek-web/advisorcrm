/**
 * Normalizers: map raw source rows to ClientTimelineEvent[].
 * Used by getClientTimeline after fetching from DB.
 */

import type { ClientTimelineEvent } from "./types";

const CONTACT_PATH = (id: string) => `/portal/contacts/${id}`;

// ---- Events (calendar / meetings) ----
export type EventRowForTimeline = {
  id: string;
  contactId: string | null;
  title: string;
  eventType: string | null;
  startAt: Date;
  createdAt: Date;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  schuzka: "Schůzka",
  ukol: "Úkol",
  telefonat: "Telefonát",
  mail: "E-mail",
  kafe: "Kafe",
  priorita: "Priorita",
};

export function mapEventsToTimeline(
  rows: EventRowForTimeline[],
  contactId: string,
  _householdId: string | null
): ClientTimelineEvent[] {
  const out: ClientTimelineEvent[] = [];
  const now = new Date();
  for (const r of rows) {
    if (!r.contactId || r.contactId !== contactId) continue;
    const hasHappened = r.startAt <= now;
    const timestamp = hasHappened ? r.startAt : r.createdAt;
    const eventType = hasHappened ? "meeting_held" : "meeting_created";
    const title = hasHappened ? `Schůzka: ${r.title}` : "Schůzka naplánována";
    const summary = (r.eventType && EVENT_TYPE_LABELS[r.eventType]) ?? r.title;
    out.push({
      id: `event-${r.id}`,
      eventType,
      category: "meeting",
      contactId,
      householdId: null,
      sourceEntityType: "event",
      sourceEntityId: r.id,
      timestamp,
      title,
      summary,
      link: { path: "/portal/calendar", label: "Kalendář" },
      isHouseholdEvent: false,
    });
  }
  return out;
}

// ---- Meeting notes ----
export type MeetingNoteRowForTimeline = {
  id: string;
  contactId: string | null;
  meetingAt: Date;
  domain: string;
  createdAt: Date;
};

export function mapMeetingNotesToTimeline(
  rows: MeetingNoteRowForTimeline[],
  contactId: string
): ClientTimelineEvent[] {
  return rows
    .filter((r) => r.contactId === contactId)
    .map((r) => ({
      id: `meeting_note-${r.id}`,
      eventType: "meeting_note",
      category: "meeting" as const,
      contactId,
      householdId: null as string | null,
      sourceEntityType: "meeting_note" as const,
      sourceEntityId: r.id,
      timestamp: r.meetingAt,
      title: "Zápisek ze schůzky",
      summary: r.domain,
      link: { path: `${CONTACT_PATH(contactId)}#zapisky`, label: "Zápisky" },
      isHouseholdEvent: false,
    }));
}

// ---- Tasks ----
export type TaskRowForTimeline = {
  id: string;
  contactId: string | null;
  title: string;
  dueDate: string | null;
  completedAt: Date | null;
  createdAt: Date;
};

export function mapTasksToTimeline(
  rows: TaskRowForTimeline[],
  contactId: string
): ClientTimelineEvent[] {
  const out: ClientTimelineEvent[] = [];
  const link = { path: "/portal/tasks", label: "Úkoly" };
  for (const r of rows) {
    if (!r.contactId || r.contactId !== contactId) continue;
    out.push({
      id: `task-created-${r.id}`,
      eventType: "task_created",
      category: "task",
      contactId,
      householdId: null,
      sourceEntityType: "task",
      sourceEntityId: r.id,
      timestamp: r.createdAt,
      title: `Úkol: ${r.title}`,
      summary: r.dueDate ?? null,
      link,
      isHouseholdEvent: false,
    });
    if (r.completedAt) {
      out.push({
        id: `task-completed-${r.id}`,
        eventType: "task_completed",
        category: "task",
        contactId,
        householdId: null,
        sourceEntityType: "task",
        sourceEntityId: r.id,
        timestamp: r.completedAt,
        title: `Úkol dokončen: ${r.title}`,
        summary: null,
        link,
        isHouseholdEvent: false,
      });
    }
  }
  return out;
}

// ---- Opportunities (deals) ----
export type OpportunityRowForTimeline = {
  id: string;
  contactId: string | null;
  householdId: string | null;
  title: string;
  stageName: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  closedAs: string | null;
};

export function mapOpportunitiesToTimeline(
  rows: OpportunityRowForTimeline[],
  contactId: string,
  householdId: string | null
): ClientTimelineEvent[] {
  const out: ClientTimelineEvent[] = [];
  for (const r of rows) {
    const isHousehold = !!r.householdId && r.contactId !== contactId;
    const link = { path: `/portal/pipeline/${r.id}`, label: "Obchod" };
    out.push({
      id: `opportunity-created-${r.id}`,
      eventType: "opportunity_created",
      category: "deal",
      contactId: r.contactId ?? contactId,
      householdId: r.householdId ?? null,
      sourceEntityType: "opportunity",
      sourceEntityId: r.id,
      timestamp: r.createdAt,
      title: `Obchod založen: ${r.title}`,
      summary: r.stageName ?? null,
      link,
      isHouseholdEvent: isHousehold,
    });
    if (r.closedAt) {
      const wonLost = r.closedAs === "won" ? "won" : r.closedAs === "lost" ? "lost" : "closed";
      out.push({
        id: `opportunity-closed-${r.id}`,
        eventType: `opportunity_closed_${wonLost}` as string,
        category: "deal",
        contactId: r.contactId ?? contactId,
        householdId: r.householdId ?? null,
        sourceEntityType: "opportunity",
        sourceEntityId: r.id,
        timestamp: r.closedAt,
        title: `Obchod uzavřen: ${r.title}`,
        summary: r.closedAs === "won" ? "Vyhráno" : r.closedAs === "lost" ? "Prohráno" : null,
        status: r.closedAs ?? undefined,
        link,
        isHouseholdEvent: isHousehold,
      });
    }
  }
  return out;
}

// ---- Activity log (opportunity stage changes only) ----
export type ActivityLogRowForTimeline = {
  id: string;
  entityId: string;
  action: string;
  meta: { stageId?: string; stageName?: string } | null;
  createdAt: Date;
};

export function mapActivityLogToTimeline(
  rows: ActivityLogRowForTimeline[],
  opportunityTitles: Record<string, string>,
  contactId: string,
  _householdId: string | null
): ClientTimelineEvent[] {
  const out: ClientTimelineEvent[] = [];
  for (const r of rows) {
    if (r.action !== "status_change") continue;
    const title = opportunityTitles[r.entityId] ?? "Obchod";
    const stageName = r.meta?.stageName ?? r.meta?.stageId ?? null;
    out.push({
      id: `activity_log-${r.id}`,
      eventType: "opportunity_stage_change",
      category: "deal",
      contactId,
      householdId: null,
      sourceEntityType: "activity_log",
      sourceEntityId: r.id,
      timestamp: r.createdAt,
      title: `Obchod posunut: ${title}`,
      summary: stageName,
      link: { path: `/portal/pipeline/${r.entityId}`, label: "Obchod" },
      isHouseholdEvent: false,
    });
  }
  return out;
}

// ---- Financial analyses ----
export type FinancialAnalysisRowForTimeline = {
  id: string;
  contactId: string | null;
  householdId: string | null;
  status: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  lastExportedAt: Date | null;
};

export function mapFinancialAnalysesToTimeline(
  rows: FinancialAnalysisRowForTimeline[],
  contactId: string,
  householdId: string | null
): ClientTimelineEvent[] {
  const out: ClientTimelineEvent[] = [];
  const basePath = CONTACT_PATH(contactId);
  const link = { path: `${basePath}#prehled`, label: "Analýza" };
  for (const r of rows) {
    const isHousehold = !!r.householdId && r.contactId !== contactId;
    out.push({
      id: `financial_analysis-created-${r.id}`,
      eventType: "analysis_created",
      category: "analysis",
      contactId: r.contactId ?? contactId,
      householdId: r.householdId ?? null,
      sourceEntityType: "financial_analysis",
      sourceEntityId: r.id,
      timestamp: r.createdAt,
      title: "Finanční analýza vytvořena",
      summary: `${r.type} · ${r.status}`,
      link,
      isHouseholdEvent: isHousehold,
    });
    const completedOrExported =
      r.status === "completed" || r.status === "exported" || r.lastExportedAt;
    const completedAt = r.lastExportedAt ?? (r.status === "completed" ? r.updatedAt : null);
    if (completedOrExported && completedAt) {
      out.push({
        id: `financial_analysis-completed-${r.id}`,
        eventType: "analysis_completed",
        category: "analysis",
        contactId: r.contactId ?? contactId,
        householdId: r.householdId ?? null,
        sourceEntityType: "financial_analysis",
        sourceEntityId: r.id,
        timestamp: completedAt,
        title: r.lastExportedAt ? "Analýza exportována" : "Analýza dokončena",
        summary: null,
        link,
        isHouseholdEvent: isHousehold,
      });
    }
  }
  return out;
}

// ---- Contracts ----
export type ContractRowForTimeline = {
  id: string;
  contactId: string;
  segment: string;
  partnerName: string | null;
  createdAt: Date;
};

export function mapContractsToTimeline(
  rows: ContractRowForTimeline[],
  contactId: string
): ClientTimelineEvent[] {
  return rows.map((r) => ({
    id: `contract-${r.id}`,
    eventType: "contract_created",
    category: "contract" as const,
    contactId,
    householdId: null as string | null,
    sourceEntityType: "contract" as const,
    sourceEntityId: r.id,
    timestamp: r.createdAt,
    title: "Smlouva přidána",
    summary: [r.segment, r.partnerName].filter(Boolean).join(" · ") || null,
    link: { path: `${CONTACT_PATH(contactId)}#smlouvy`, label: "Produkty" },
    isHouseholdEvent: false,
  }));
}

// ---- Documents ----
export type DocumentRowForTimeline = {
  id: string;
  contactId: string | null;
  name: string;
  createdAt: Date;
};

export function mapDocumentsToTimeline(
  rows: DocumentRowForTimeline[],
  contactId: string
): ClientTimelineEvent[] {
  return rows
    .filter((r) => r.contactId === contactId)
    .map((r) => ({
      id: `document-${r.id}`,
      eventType: "document_added",
      category: "document" as const,
      contactId,
      householdId: null as string | null,
      sourceEntityType: "document" as const,
      sourceEntityId: r.id,
      timestamp: r.createdAt,
      title: `Dokument: ${r.name}`,
      summary: null,
      link: { path: `${CONTACT_PATH(contactId)}#dokumenty`, label: "Dokumenty" },
      isHouseholdEvent: false,
    }));
}

// ---- Merge, sort, limit ----
export function mergeAndSortTimeline(events: ClientTimelineEvent[], limit: number): ClientTimelineEvent[] {
  const byTimestamp = [...events].sort((a, b) => {
    const ta = a.timestamp.getTime();
    const tb = b.timestamp.getTime();
    if (tb !== ta) return tb - ta; // DESC
    return a.id.localeCompare(b.id);
  });
  return byTimestamp.slice(0, limit);
}
