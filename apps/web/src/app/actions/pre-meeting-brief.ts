"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { getEvent } from "@/app/actions/events";
import { getContact } from "@/app/actions/contacts";
import { getHouseholdForContact } from "@/app/actions/households";
import { getClientFinancialSummaryForContact } from "@/app/actions/client-financial-summary";
import { getMeetingNotesList, getMeetingNote } from "@/app/actions/meeting-notes";
import { listEvents } from "@/app/actions/events";
import { getTasksByContactId } from "@/app/actions/tasks";
import { getPipelineByContact } from "@/app/actions/pipeline";
import { getCoverageForContact } from "@/app/actions/coverage";
import { getClientAiOpportunities } from "@/app/actions/client-ai-opportunities";
import type { PreMeetingBrief } from "@/lib/meeting-briefing/types";

function formatDate(d: Date | string | null): string | null {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

/** Extract a short summary from meeting note content (trusted). */
function summaryFromMeetingNoteContent(content: unknown): string {
  if (content == null) return "";
  const o = content as Record<string, unknown>;
  if (typeof o.summary === "string" && o.summary.trim()) return o.summary.trim().slice(0, 500);
  if (typeof o.title === "string" && o.title.trim()) return o.title.trim();
  const str = JSON.stringify(o);
  return str.slice(0, 300) + (str.length > 300 ? "…" : "");
}

/** Build agenda and main goal from rules (deterministic). */
function buildAgendaFromRules(brief: {
  openTasks: PreMeetingBrief["openTasks"];
  openOpportunities: PreMeetingBrief["openOpportunities"];
  analysisStatus: string;
  analysisGaps: string[];
  serviceSignals: PreMeetingBrief["serviceSignals"];
  topAiOpportunities: PreMeetingBrief["topAiOpportunities"];
  lastMeetingSummary: string | null;
}): {
  suggestedAgenda: string[];
  suggestedMainGoal: string | null;
  questionsToOpen: string[];
} {
  const agenda: string[] = [];
  const questions: string[] = [];

  if (brief.lastMeetingSummary) {
    agenda.push("Revize změn a follow-up od minulé schůzky");
  }
  if (brief.openTasks.length > 0) {
    const first = brief.openTasks[0];
    agenda.push(`Úkol: ${first.title}`);
    if (brief.openTasks.length > 1) {
      agenda.push(`Ostatní otevřené úkoly (${brief.openTasks.length - 1})`);
    }
  }
  if (brief.analysisStatus === "draft" || brief.analysisStatus === "missing") {
    agenda.push(brief.analysisStatus === "draft" ? "Dokončit finanční analýzu" : "Probrat finanční situaci / analýzu");
  }
  if (brief.analysisGaps.length > 0) {
    if (brief.analysisGaps.includes("Chybí rezerva")) agenda.push("Rezerva a hotovost");
    if (brief.analysisGaps.some((g) => g.includes("zajištění") || g.includes("ochrana"))) agenda.push("Ochrana příjmů");
    if (brief.analysisGaps.some((g) => g.includes("invest"))) agenda.push("Investiční plán");
  }
  if (brief.serviceSignals?.nextServiceDue) {
    agenda.push("Servisní revize a kontrola smluv");
  }
  if (brief.openOpportunities.length > 0) {
    agenda.push("Stav rozpracovaných obchodů");
  }
  const topOpp = brief.topAiOpportunities[0];
  if (topOpp) {
    if (topOpp.title.toLowerCase().includes("schůzk") && !agenda.some((a) => a.includes("Připomenout"))) {
      agenda.push("Připomenout cíle a další kroky");
    }
    if (topOpp.title.toLowerCase().includes("analýz")) {
      questions.push("Máte aktuální přehled o příjmech a výdajích?");
    }
  }
  questions.push("Je něco nového, co bychom měli zohlednit?");
  if (brief.serviceSignals?.nextServiceDue) {
    questions.push("Potřebujete upravit termín další servisní schůzky?");
  }

  const mainGoal =
    brief.analysisStatus === "draft"
      ? "Postoupit v dokončení finanční analýzy"
      : brief.openTasks.length > 0
        ? `Vyřešit nebo aktualizovat úkol: ${brief.openTasks[0].title}`
        : brief.openOpportunities.length > 0
          ? "Posunout rozpracované obchody"
          : brief.serviceSignals?.nextServiceDue
            ? "Probrat servis a plán dalšího kontaktu"
            : "Probrat aktuální situaci a další kroky";

  return {
    suggestedAgenda: agenda.slice(0, 7),
    suggestedMainGoal: mainGoal,
    questionsToOpen: questions.slice(0, 5),
  };
}

export async function getPreMeetingBrief(
  contactId: string,
  eventId?: string
): Promise<PreMeetingBrief | null> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client" && auth.contactId !== contactId) {
    throw new Error("Forbidden");
  }
  if (auth.roleName !== "Client" && !hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  let meetingId: string | null = null;
  let eventType: string | null = null;
  let meetingAt: string | null = null;
  let resolvedContactId = contactId;

  if (eventId) {
    const event = await getEvent(eventId);
    if (!event) return null;
    if (event.tenantId !== auth.tenantId) throw new Error("Forbidden");
    if (event.contactId && event.contactId !== contactId) {
      resolvedContactId = event.contactId;
    }
    meetingId = event.id;
    eventType = event.eventType ?? null;
    meetingAt = event.startAt ? new Date(event.startAt).toISOString() : null;
  }

  const [
    contact,
    household,
    financialSummary,
    meetingNotesList,
    eventsPast,
    tasks,
    pipelineStages,
    coverageResult,
    aiOpportunities,
  ] = await Promise.all([
    getContact(resolvedContactId),
    getHouseholdForContact(resolvedContactId),
    getClientFinancialSummaryForContact(resolvedContactId),
    getMeetingNotesList(resolvedContactId),
    listEvents({ contactId: resolvedContactId, end: new Date().toISOString() }),
    getTasksByContactId(resolvedContactId),
    getPipelineByContact(resolvedContactId),
    getCoverageForContact(resolvedContactId),
    getClientAiOpportunities(resolvedContactId),
  ]);

  if (!contact) return null;

  const openTasks = tasks
    .filter((t) => !t.completedAt)
    .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate }));

  const openOpportunities = pipelineStages.flatMap((s) =>
    s.opportunities.map((o) => ({
      id: o.id,
      title: o.title,
      stageName: s.name,
      caseType: o.caseType,
    }))
  );

  const productsSummary = coverageResult.resolvedItems
    .filter((i) => i.status !== "none" || i.source !== "default")
    .map((i) => i.label || i.segmentCode)
    .filter(Boolean);

  let lastMeetingSummary: string | null = null;
  const lastNote = meetingNotesList[0];
  if (lastNote) {
    const detail = await getMeetingNote(lastNote.id);
    if (detail?.content) {
      const part = summaryFromMeetingNoteContent(detail.content);
      const dateStr = detail.meetingAt ? new Date(detail.meetingAt).toLocaleDateString("cs-CZ") : "";
      lastMeetingSummary = `Zápisek (${detail.domain || "schůzka"}, ${dateStr}): ${part}`;
    }
  }
  if (!lastMeetingSummary && eventsPast.length > 0) {
    const lastEvent = eventsPast.sort(
      (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
    )[0];
    if (lastEvent?.notes?.trim()) {
      lastMeetingSummary = `Poznámky k minulé schůzce: ${lastEvent.notes.trim().slice(0, 400)}`;
    }
  }

  const serviceSignals =
    contact.nextServiceDue || contact.lastServiceDate
      ? {
          nextServiceDue: contact.nextServiceDue ?? null,
          label: contact.nextServiceDue
            ? `Servisní termín: ${contact.nextServiceDue}`
            : contact.lastServiceDate
              ? `Poslední servis: ${contact.lastServiceDate}`
              : "Servis",
        }
      : null;

  const topAiOpportunities = (aiOpportunities.opportunities ?? [])
    .slice(0, 5)
    .map((o) => ({ title: o.title, recommendation: o.recommendation, priority: o.priority }));

  const warnings: string[] = [];
  if (serviceSignals?.nextServiceDue) {
    const due = new Date(serviceSignals.nextServiceDue);
    if (due < new Date()) warnings.push("Servisní termín již uplynul");
  }
  if (eventsPast.length === 0 && meetingNotesList.length === 0) {
    warnings.push("Zatím žádná historie schůzek s klientem");
  }
  const noContactMonths = 6;
  const lastActivity = eventsPast[0]
    ? new Date(eventsPast[0].startAt)
    : lastNote
      ? new Date(lastNote.meetingAt)
      : null;
  if (lastActivity) {
    const months = (Date.now() - lastActivity.getTime()) / (30 * 24 * 60 * 60 * 1000);
    if (months >= noContactMonths) warnings.push("Dlouho bez kontaktu – připomenout vztah");
  }

  const executiveSummary = [
    `${contact.firstName} ${contact.lastName}`,
    household?.name ? `Domácnost: ${household.name}` : null,
    financialSummary.status === "missing"
      ? "Bez finanční analýzy"
      : financialSummary.status === "draft"
        ? "Rozpracovaná analýza"
        : "Analýza k dispozici",
  ]
    .filter(Boolean)
    .join(". ");

  const sourceSignals: Array<{ type: string; label: string }> = [];
  if (openTasks.length > 0) sourceSignals.push({ type: "tasks", label: `${openTasks.length} otevřených úkolů` });
  if (openOpportunities.length > 0) sourceSignals.push({ type: "opportunities", label: `${openOpportunities.length} obchodů` });
  if (financialSummary.primaryAnalysisId) sourceSignals.push({ type: "analysis", label: "Finanční analýza" });
  if (meetingNotesList.length > 0) sourceSignals.push({ type: "meeting_notes", label: "Zápisky ze schůzek" });
  if (serviceSignals) sourceSignals.push({ type: "service", label: "Servisní údaje" });

  const now = new Date().toISOString();
  const brief: PreMeetingBrief = {
    meetingId,
    contactId: resolvedContactId,
    householdId: household?.id ?? null,
    householdName: household?.name ?? null,
    eventType,
    meetingAt,
    executiveSummary,
    lastMeetingSummary,
    openTasks,
    openOpportunities,
    productsSummary: [...new Set(productsSummary)].slice(0, 15),
    analysisStatus: financialSummary.status,
    analysisGaps: financialSummary.gaps ?? [],
    serviceSignals,
    topAiOpportunities,
    suggestedAgenda: [],
    suggestedMainGoal: null,
    questionsToOpen: [],
    warnings,
    sourceSignals,
    createdAt: now,
    updatedAt: now,
  };

  const agendaResult = buildAgendaFromRules(brief);
  brief.suggestedAgenda = agendaResult.suggestedAgenda;
  brief.suggestedMainGoal = agendaResult.suggestedMainGoal;
  brief.questionsToOpen = agendaResult.questionsToOpen;

  return brief;
}
