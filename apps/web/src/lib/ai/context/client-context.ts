"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { getContact } from "@/app/actions/contacts";
import { getHouseholdForContact } from "@/app/actions/households";
import { getClientFinancialSummaryForContact } from "@/app/actions/client-financial-summary";
import { getContractsByContact, type ContractRow } from "@/app/actions/contracts";
import { getClientTimeline } from "@/app/actions/timeline";
import { getTasksByContactId, type TaskRow } from "@/app/actions/tasks";
import { listEvents, type EventRow } from "@/app/actions/events";
import { getPipelineByContact, type StageWithOpportunities } from "@/app/actions/pipeline";
import { getCoverageForContact } from "@/app/actions/coverage";
import type { ClientTimelineEvent } from "@/lib/timeline/types";
import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";

const TIMELINE_MAX_ITEMS = 30;
const MAX_VAR_LENGTH = 2500;

export type ClientAiContextRaw = {
  clientProfile: {
    name: string;
    birthDate: string | null;
    age: string | null;
    city: string | null;
    title: string | null;
    lifecycleStage: string | null;
    priority: string | null;
    tags: string[] | null;
  };
  householdSummary: {
    name: string | null;
    memberCount: number;
    role: string | null;
  };
  financialSummary: ClientFinancialSummaryView;
  contractsSummary: ContractRow[];
  timelineEvents: ClientTimelineEvent[];
  openItems: {
    tasks: TaskRow[];
    events: EventRow[];
  };
  serviceStatus: {
    lastServiceDate: string | null;
    nextServiceDue: string | null;
    serviceCycleMonths: string | null;
    anniversaries: string[];
    coverageSummary: string;
  };
  activeDeals: StageWithOpportunities[];
};

function ensureContactAccess(clientId: string): Promise<{ tenantId: string; userId: string }> {
  return (async () => {
    const auth = await requireAuthInAction();
    if (auth.roleName === "Client") {
      if (!auth.contactId || auth.contactId !== clientId) throw new Error("Forbidden");
    } else if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Forbidden");
    }
    return { tenantId: auth.tenantId, userId: auth.userId };
  })();
}

export async function buildClientAiContextRaw(clientId: string): Promise<ClientAiContextRaw> {
  await ensureContactAccess(clientId);

  const [
    contact,
    household,
    financialSummary,
    contractsList,
    timeline,
    tasks,
    events,
    pipeline,
    coverageResult,
  ] = await Promise.all([
    getContact(clientId),
    getHouseholdForContact(clientId),
    getClientFinancialSummaryForContact(clientId),
    getContractsByContact(clientId),
    getClientTimeline(clientId),
    getTasksByContactId(clientId),
    listEvents({
      contactId: clientId,
      start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    }),
    getPipelineByContact(clientId),
    getCoverageForContact(clientId).catch(() => ({ resolvedItems: [], summary: { total: 0, covered: 0, gap: 0, unknown: 0 } })),
  ]);

  if (!contact) throw new Error("Kontakt nenalezen");

  const openTasks = (tasks ?? []).filter((t) => !t.completedAt);
  const timelineSlice = (timeline ?? []).slice(0, TIMELINE_MAX_ITEMS);

  let age: string | null = null;
  if (contact.birthDate) {
    const birth = new Date(contact.birthDate);
    const today = new Date();
    const years = today.getFullYear() - birth.getFullYear();
    age = `${years} let`;
  }

  const anniversaries: string[] = [];
  for (const c of contractsList ?? []) {
    if (c.anniversaryDate) anniversaries.push(`${c.partnerName ?? c.segment}: ${c.anniversaryDate}`);
  }

  const coverageSummary =
    coverageResult && "summary" in coverageResult
      ? `Celkem ${(coverageResult.summary as { total?: number }).total ?? 0}, pokryto ${(coverageResult.summary as { covered?: number }).covered ?? 0}, mezery ${(coverageResult.summary as { gap?: number }).gap ?? 0}`
      : "Žádná data";

  return {
    clientProfile: {
      name: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—",
      birthDate: contact.birthDate ?? null,
      age,
      city: contact.city ?? null,
      title: contact.title ?? null,
      lifecycleStage: contact.lifecycleStage ?? null,
      priority: contact.priority ?? null,
      tags: contact.tags ?? null,
    },
    householdSummary: household
      ? { name: household.name, memberCount: household.memberCount, role: household.role }
      : { name: null, memberCount: 0, role: null },
    financialSummary: financialSummary ?? ({} as ClientFinancialSummaryView),
    contractsSummary: contractsList ?? [],
    timelineEvents: timelineSlice,
    openItems: {
      tasks: openTasks,
      events: events ?? [],
    },
    serviceStatus: {
      lastServiceDate: contact.lastServiceDate ?? null,
      nextServiceDue: contact.nextServiceDue ?? null,
      serviceCycleMonths: contact.serviceCycleMonths ?? null,
      anniversaries,
      coverageSummary,
    },
    activeDeals: pipeline ?? [],
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

export async function renderClientAiPromptVariables(raw: ClientAiContextRaw): Promise<Record<string, string>> {
  const p = raw.clientProfile;
  const client_profile = [
    `Jméno: ${p.name}`,
    p.birthDate ? `Datum narození: ${p.birthDate}` : "",
    p.age ? `Věk: ${p.age}` : "",
    p.city ? `Město: ${p.city}` : "",
    p.title ? `Povolání: ${p.title}` : "",
    p.lifecycleStage ? `Životní etapa: ${p.lifecycleStage}` : "",
    p.priority ? `Priorita: ${p.priority}` : "",
    p.tags?.length ? `Štítky: ${p.tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n") || "Neuvedeno";

  const h = raw.householdSummary;
  const household_summary =
    h.name && h.memberCount > 0
      ? `Domácnost: ${h.name}, členů: ${h.memberCount}${h.role ? `, role klienta: ${h.role}` : ""}`
      : "Žádná domácnost nebo neuvedeno";

  const fin = raw.financialSummary;
  const financial_summary =
    fin && fin.status !== "missing"
      ? [
          `Stav analýzy: ${fin.status}, aktualizace: ${fin.updatedAt ? new Date(fin.updatedAt).toLocaleDateString("cs-CZ") : "—"}`,
          `Cíle: ${(fin.goals ?? []).map((g) => g.name).join(", ") || "žádné"}`,
          `Příjmy: ${fin.income ?? 0}, výdaje: ${fin.expenses ?? 0}, přebytek: ${fin.surplus ?? 0}`,
          `Aktiva: ${fin.assets ?? 0}, závazky: ${fin.liabilities ?? 0}, čisté jmění: ${fin.netWorth ?? 0}`,
          `Priority: ${(fin.priorities ?? []).join(", ") || "—"}`,
          `Mezery: ${(fin.gaps ?? []).join(", ") || "žádné"}`,
        ].join("\n")
      : "Finanční analýza není k dispozici.";

  const contracts_summary =
    raw.contractsSummary.length > 0
      ? raw.contractsSummary
          .map(
            (c) =>
              `${c.segment} | ${c.partnerName ?? "—"} | uzavření: ${c.startDate ?? "—"} | platba: ${c.premiumAmount ?? c.premiumAnnual ?? "—"} | výročí: ${c.anniversaryDate ?? "—"} | ${c.note ?? ""}`
          )
          .join("\n")
      : "Žádné smlouvy.";
  const contracts_summary_trimmed = truncate(contracts_summary, MAX_VAR_LENGTH);

  const timeline_events =
    raw.timelineEvents.length > 0
      ? raw.timelineEvents
          .map(
            (e) =>
              `${new Date(e.timestamp).toLocaleDateString("cs-CZ")} | ${e.eventType} | ${e.title}${e.summary ? ": " + e.summary : ""}`
          )
          .join("\n")
      : "Žádné události.";
  const timeline_events_trimmed = truncate(timeline_events, MAX_VAR_LENGTH);

  const open_items_parts: string[] = [];
  for (const t of raw.openItems.tasks) {
    open_items_parts.push(`Úkol: ${t.title}${t.dueDate ? " (do " + t.dueDate + ")" : ""}`);
  }
  for (const e of raw.openItems.events) {
    if (e.startAt && new Date(e.startAt) >= new Date()) {
      open_items_parts.push(`Schůzka: ${e.title} – ${new Date(e.startAt).toLocaleString("cs-CZ")}`);
    }
  }
  const open_items = open_items_parts.length > 0 ? open_items_parts.join("\n") : "Žádné otevřené položky.";
  const open_items_trimmed = truncate(open_items, MAX_VAR_LENGTH);

  const svc = raw.serviceStatus;
  const service_status = [
    svc.lastServiceDate ? `Poslední servis: ${svc.lastServiceDate}` : "",
    svc.nextServiceDue ? `Další servis: ${svc.nextServiceDue}` : "",
    svc.serviceCycleMonths ? `Cyklus: ${svc.serviceCycleMonths} měsíců` : "",
    svc.anniversaries.length ? `Výročí smluv: ${svc.anniversaries.join("; ")}` : "",
    svc.coverageSummary,
  ]
    .filter(Boolean)
    .join("\n") || "Žádná data o servisu.";

  const active_deals_parts: string[] = [];
  for (const stage of raw.activeDeals) {
    for (const opp of stage.opportunities) {
      active_deals_parts.push(`${opp.title} | ${stage.name} | ${opp.caseType ?? "—"} | ${opp.expectedValue ?? "—"}`);
    }
  }
  const active_deals =
    active_deals_parts.length > 0 ? active_deals_parts.join("\n") : "Žádné aktivní obchody.";
  const active_deals_trimmed = truncate(active_deals, MAX_VAR_LENGTH);

  return {
    client_profile: truncate(client_profile, MAX_VAR_LENGTH),
    household_summary,
    financial_summary: truncate(financial_summary, MAX_VAR_LENGTH),
    contracts_summary: contracts_summary_trimmed,
    timeline_events: timeline_events_trimmed,
    open_items: open_items_trimmed,
    service_status: truncate(service_status, MAX_VAR_LENGTH),
    active_deals: active_deals_trimmed,
  };
}
