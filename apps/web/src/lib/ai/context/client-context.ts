"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { getContact } from "@/app/actions/contacts";
import { getHouseholdForContact } from "@/app/actions/households";
import { getClientFinancialSummaryForContact } from "@/app/actions/client-financial-summary";
import { getContractsByContact, type ContractRow } from "@/app/actions/contracts";
import { getSegmentUiGroup } from "@/lib/contracts/contract-segment-wizard-config";
import { getClientTimeline } from "@/app/actions/timeline";
import { getTasksByContactId, type TaskRow } from "@/app/actions/tasks";
import { listEvents, type EventRow } from "@/app/actions/events";
import { getPipelineByContact, type StageWithOpportunities } from "@/app/actions/pipeline";
import { getCoverageForContact } from "@/app/actions/coverage";
import { db, faPlanItems, financialAnalyses, eq, and } from "db";
import type { ClientTimelineEvent } from "@/lib/timeline/types";
import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";
import { SEGMENT_LABELS } from "db";
import {
  FRESHNESS_THRESHOLDS,
  getDaysSince,
  getMonthsSince,
  getUpcomingDates,
  isAnalysisOutdated,
  isServiceOverdue,
} from "./freshness-rules";
import { computeCompleteness, renderCompletenessHint } from "./completeness";

const TIMELINE_MAX_ITEMS = 12;
const MAX_VAR_LENGTH = 2500;

const SERVICE_KEYWORDS = [
  "servis",
  "revize",
  "výročí",
  "fixace",
  "kontrola",
  "follow",
  "obnova",
];

export type ActiveDealSummary = {
  id: string;
  title: string;
  stageName: string;
  caseType: string;
  expectedValue: string | null;
  expectedCloseDate: string | null;
  contactName: string;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  isNew: boolean;
  isStale: boolean;
  dealCategory: "new_opportunity" | "active_deal" | "service_need";
};

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
    isOverdue: boolean;
    daysSinceLastService: number | null;
    daysUntilNextService: number | null;
    upcomingAnniversaries: { segment: string; date: string; daysUntil: number }[];
    upcomingFixations: { segment: string; date: string; daysUntil: number }[];
    openServiceTasks: number;
    noContactRisk: boolean;
    coverageSummary: string;
  };
  activeDeals: ActiveDealSummary[];
  timelineTotalCount: number;
  pendingFaPlanItems: { label: string; status: string; provider: string | null; segmentCode: string | null }[];
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

  const pendingFaPlanItemsRaw = await (async () => {
    try {
      const { tenantId } = await ensureContactAccess(clientId);
      const rows = await db
        .select({
          label: faPlanItems.label,
          status: faPlanItems.status,
          provider: faPlanItems.provider,
          segmentCode: faPlanItems.segmentCode,
        })
        .from(faPlanItems)
        .innerJoin(financialAnalyses, eq(faPlanItems.analysisId, financialAnalyses.id))
        .where(
          and(
            eq(faPlanItems.tenantId, tenantId),
            eq(faPlanItems.contactId, clientId),
          )
        );
      return rows.filter((r) => r.status !== "sold" && r.status !== "not_relevant" && r.status !== "cancelled");
    } catch {
      return [];
    }
  })();

  if (!contact) throw new Error("Kontakt nenalezen");

  const openTasks = (tasks ?? []).filter((t) => !t.completedAt);
  const timelineInput = timeline ?? [];
  const timelineSlice = selectRelevantTimelineEvents(timelineInput, TIMELINE_MAX_ITEMS);

  let age: string | null = null;
  if (contact.birthDate) {
    const birth = new Date(contact.birthDate);
    const today = new Date();
    const years = today.getFullYear() - birth.getFullYear();
    age = `${years} let`;
  }

  const contracts = contractsList ?? [];
  const upcomingAnniversaries = getUpcomingDates(
    contracts,
    FRESHNESS_THRESHOLDS.anniversaryAlertDays,
    "anniversary"
  );
  const upcomingFixations = getUpcomingDates(
    contracts,
    FRESHNESS_THRESHOLDS.fixationAlertDays,
    "fixation"
  );

  const daysSinceLastService = getDaysSince(contact.lastServiceDate ?? null);
  const daysUntilNextService = getDaysUntil(contact.nextServiceDue ?? null);
  const noContactRisk =
    daysSinceLastService != null &&
    daysSinceLastService > FRESHNESS_THRESHOLDS.serviceAttentionDays;
  const isOverdue = isServiceOverdue(contact.nextServiceDue ?? null);
  const openServiceTasks = openTasks.filter(isLikelyServiceTask).length;

  const coverageSummary =
    coverageResult && "summary" in coverageResult
      ? `Celkem ${(coverageResult.summary as { total?: number }).total ?? 0}, pokryto ${(coverageResult.summary as { covered?: number }).covered ?? 0}, mezery ${(coverageResult.summary as { gap?: number }).gap ?? 0}`
      : "Žádná data";

  const activeDeals = flattenActiveDeals(pipeline ?? []);

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
      isOverdue,
      daysSinceLastService,
      daysUntilNextService,
      upcomingAnniversaries,
      upcomingFixations,
      openServiceTasks,
      noContactRisk,
      coverageSummary,
    },
    activeDeals,
    timelineTotalCount: timelineInput.length,
    pendingFaPlanItems: pendingFaPlanItemsRaw.map((r) => ({
      label: r.label ?? "—",
      status: r.status,
      provider: r.provider,
      segmentCode: r.segmentCode,
    })),
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
  const analysisAgeMonths = getMonthsSince(fin.updatedAt ?? null);
  const analysisOutdated = isAnalysisOutdated(fin.updatedAt ?? null);
  const statusInterpretation = toFinancialStatusText(fin.status);
  const goals = (fin.goals ?? []).slice(0, 3).map((g) => `- ${g.name}`);
  const recommendedAreas = deriveRecommendedAreas(fin);
  const financial_summary =
    fin.status !== "missing"
      ? [
          `Stav analýzy: ${statusInterpretation}`,
          `Aktualizace: ${fin.updatedAt ? new Date(fin.updatedAt).toLocaleDateString("cs-CZ") : "—"}${analysisAgeMonths != null ? ` (stáří ${analysisAgeMonths} měsíců)` : ""}`,
          analysisOutdated
            ? "[!] Analýza je starší než 12 měsíců – data mohou být zastaralá."
            : "",
          goals.length ? `Hlavní cíle:\n${goals.join("\n")}` : "Hlavní cíle: nejsou evidované.",
          `Finance: příjmy ${formatCurrency(fin.income)}, výdaje ${formatCurrency(fin.expenses)}, přebytek ${formatCurrency(fin.surplus)}`,
          `Bilance: aktiva ${formatCurrency(fin.assets)}, závazky ${formatCurrency(fin.liabilities)}, čisté jmění ${formatCurrency(fin.netWorth)}`,
          `Priority: ${(fin.priorities ?? []).join(", ") || "neuvedeno"}`,
          `Mezery: ${(fin.gaps ?? []).join(", ") || "žádné zjevné"}`,
          fin.reserveOk
            ? "Rezerva: splněna."
            : `Rezerva: nesplněna (chybí cca ${formatCurrency(fin.reserveGap)}).`,
          `Oblasti k prověření v analýze: ${recommendedAreas.join(", ") || "vyžaduje doplnění vstupních dat."}`,
        ]
          .filter(Boolean)
          .join("\n")
      : "Finanční analýza není k dispozici.";

  const contracts_summary =
    raw.contractsSummary.length > 0
      ? raw.contractsSummary
          .map((c) => {
            const segmentLabel = SEGMENT_LABELS[c.segment] ?? c.segment;
            const payment = c.premiumAmount
              ? `${c.premiumAmount} Kč/měs.`
              : c.premiumAnnual
                ? `${c.premiumAnnual} Kč/rok`
                : "nezadaná";
            const status = contractStatus(c);
            const missing = getContractMissingFields(c);
            const daysToAnniversary = getDaysUntil(c.anniversaryDate);
            const reviewDue =
              daysToAnniversary != null &&
              daysToAnniversary >= 0 &&
              daysToAnniversary <= 90
                ? " | [!] blíží se revize"
                : "";

            const line = [
              `[${segmentLabel}] ${c.partnerName ?? "Neznámý poskytovatel"}`,
              `produkt: ${c.productName ?? "neuveden"}`,
              `č. smlouvy: ${c.contractNumber ?? "neuvedeno"}`,
              `od: ${c.startDate ?? "neuvedeno"}`,
              `platba: ${payment}`,
              `výročí/revize: ${c.anniversaryDate ?? "neuvedeno"}`,
              `stav: ${status}${reviewDue}`,
              c.note ? `poznámka: ${c.note}` : "",
              missing.length > 0 ? `[!] Chybí: ${missing.join(", ")}` : "",
            ]
              .filter(Boolean)
              .join(" | ");
            return line;
          })
          .join("\n")
      : "Klient nemá evidované smlouvy.";
  const contracts_summary_trimmed = truncate(contracts_summary, MAX_VAR_LENGTH);

  const timeline_events =
    raw.timelineEvents.length > 0
      ? raw.timelineEvents
          .map(
            (e) =>
              `${new Date(e.timestamp).toLocaleDateString("cs-CZ")} | ${e.eventType} | ${e.title}${e.summary ? ": " + e.summary : ""}`
          )
          .join("\n") +
        `\n(Zobrazeno ${raw.timelineEvents.length} z celkem ${raw.timelineTotalCount} událostí)`
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
  const completeness = computeCompleteness(raw);
  const qualityHint = renderCompletenessHint(completeness);
  const service_status = [
    svc.lastServiceDate
      ? `Poslední servis: ${svc.lastServiceDate}${svc.daysSinceLastService != null ? ` (před ${svc.daysSinceLastService} dny)` : ""}${svc.noContactRisk ? " [!] Klient dlouho bez kontaktu" : ""}`
      : "[!] Poslední servisní schůzka není k dispozici.",
    svc.nextServiceDue
      ? `Plánovaná další servisní schůzka (evidence): ${svc.nextServiceDue}${svc.daysUntilNextService != null ? ` (za ${svc.daysUntilNextService} dní)` : ""}${svc.isOverdue ? " [!] overdue servisní revize" : ""}`
      : "[!] Další servis není v evidenci stanoven.",
    svc.serviceCycleMonths ? `Cyklus: ${svc.serviceCycleMonths} měsíců` : "",
    svc.upcomingAnniversaries.length
      ? `Blížící se výročí: ${svc.upcomingAnniversaries
          .map((item) => `${SEGMENT_LABELS[item.segment] ?? item.segment} (${item.date}, za ${item.daysUntil} dní)`)
          .join("; ")}`
      : "Blížící se výročí: bez relevantních záznamů.",
    svc.upcomingFixations.length
      ? `Blížící se fixace: ${svc.upcomingFixations
          .map((item) => `${SEGMENT_LABELS[item.segment] ?? item.segment} (${item.date}, za ${item.daysUntil} dní)`)
          .join("; ")}`
      : "[!] Fixace nelze spolehlivě vyhodnotit ze strukturovaných dat.",
    `Otevřené servisní akce: ${svc.openServiceTasks}`,
    svc.coverageSummary,
    qualityHint,
  ]
    .filter(Boolean)
    .join("\n") || "Žádná data o servisu.";

  const active_deals_parts = raw.activeDeals.map((deal) => {
    const categoryLabel =
      deal.dealCategory === "new_opportunity"
        ? "Nová příležitost"
        : deal.dealCategory === "service_need"
          ? "Servisní potřeba"
          : "Aktivní obchod";
    return [
      `[${categoryLabel}] ${deal.title}`,
      `fáze: ${deal.stageName}`,
      `oblast: ${deal.caseType || "neuvedeno"}`,
      `hodnota: ${deal.expectedValue ?? "neuvedeno"}`,
      `expected close: ${deal.expectedCloseDate ?? "neuvedeno"}`,
      deal.isNew ? "nový obchod (<14 dní)" : "",
      deal.isStale ? "[!] obchod bez posunu > 60 dní" : "",
      `vlastník: ${deal.assignedTo ?? "neuveden"}`,
    ]
      .filter(Boolean)
      .join(" | ");
  });
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
    pending_fa_items: truncate(
      raw.pendingFaPlanItems.length > 0
        ? raw.pendingFaPlanItems
            .map((i) => `- ${i.label} [${i.status}]${i.provider ? ` (${i.provider})` : ""}${i.segmentCode ? ` – ${i.segmentCode}` : ""}`)
            .join("\n")
        : "Žádné nedokončené položky z finanční analýzy.",
      MAX_VAR_LENGTH
    ),
    _context_quality: qualityHint,
  };
}

function isLikelyServiceTask(task: TaskRow): boolean {
  const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
  return SERVICE_KEYWORDS.some((k) => text.includes(k));
}

function selectRelevantTimelineEvents(events: ClientTimelineEvent[], maxItems: number): ClientTimelineEvent[] {
  const now = new Date();
  const scored = events.map((event) => {
    const baseScore = {
      meeting: 5,
      deal: 4,
      analysis: 4,
      contract: 3,
      service: 3,
      task: 2,
      document: 1,
    }[event.category];

    const ageDays = Math.max(0, getDaysDiff(event.timestamp, now));
    const recencyBoost = ageDays <= 30 ? 3 : ageDays <= 90 ? 1 : 0;
    return { event, score: baseScore + recencyBoost };
  });

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.event.timestamp.getTime() - a.event.timestamp.getTime();
    })
    .slice(0, maxItems)
    .map((item) => item.event)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function getDaysDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function flattenActiveDeals(stages: StageWithOpportunities[]): ActiveDealSummary[] {
  const now = new Date();
  const results: ActiveDealSummary[] = [];

  for (const stage of stages) {
    for (const opp of stage.opportunities) {
      const createdAt = (opp as OpportunityWithMeta).createdAt ?? now;
      const updatedAt = (opp as OpportunityWithMeta).updatedAt ?? null;
      const isNew = getDaysDiff(createdAt, now) <= 14;
      const isStale = updatedAt ? getDaysDiff(updatedAt, now) > 60 : false;
      const dealCategory = classifyDealCategory(opp.caseType, stage.name, isNew);

      results.push({
        id: opp.id,
        title: opp.title,
        stageName: stage.name,
        caseType: opp.caseType ?? "",
        expectedValue: opp.expectedValue ?? null,
        expectedCloseDate: opp.expectedCloseDate ?? null,
        contactName: opp.contactName,
        assignedTo: (opp as OpportunityWithMeta).assignedTo ?? null,
        createdAt,
        updatedAt,
        isNew,
        isStale,
        dealCategory,
      });
    }
  }

  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

type OpportunityWithMeta = {
  createdAt?: Date;
  updatedAt?: Date;
  assignedTo?: string | null;
};

function classifyDealCategory(
  caseType: string | null | undefined,
  stageName: string,
  isNew: boolean
): ActiveDealSummary["dealCategory"] {
  const value = `${caseType ?? ""} ${stageName}`.toLowerCase();
  if (
    value.includes("servis") ||
    value.includes("reviz") ||
    value.includes("obnova") ||
    value.includes("fixac")
  ) {
    return "service_need";
  }
  if (
    isNew &&
    (value.includes("kvalifik") ||
      value.includes("začín") ||
      value.includes("start") ||
      value.includes("lead"))
  ) {
    return "new_opportunity";
  }
  return "active_deal";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function toFinancialStatusText(status: ClientFinancialSummaryView["status"]): string {
  switch (status) {
    case "draft":
      return "rozpracovaná, ne finální";
    case "completed":
    case "exported":
      return "schválená";
    case "archived":
      return "archivní, nahrazena novější?";
    case "missing":
    default:
      return "Finanční analýza není k dispozici.";
  }
}

function deriveRecommendedAreas(fin: ClientFinancialSummaryView): string[] {
  const areas = new Set<string>();
  for (const gap of fin.gaps ?? []) {
    if (gap.toLowerCase().includes("rezerv")) areas.add("finanční rezerva");
    else if (gap.toLowerCase().includes("zajištění")) areas.add("zajištění příjmů");
    else if (gap.toLowerCase().includes("invest")) areas.add("investice");
    else areas.add(gap);
  }

  for (const p of fin.priorities ?? []) {
    areas.add(p);
  }

  if ((fin.goals?.length ?? 0) > 0 && areas.size === 0) areas.add("průběžná revize cílů");
  return [...areas].slice(0, 4);
}

function getContractMissingFields(c: ContractRow): string[] {
  const missing: string[] = [];
  if (!c.productName) missing.push("produkt");
  if (!c.contractNumber) missing.push("číslo smlouvy");
  if (!c.startDate) missing.push("datum podpisu");
  if (
    getSegmentUiGroup(c.segment) !== "lending" &&
    !c.premiumAmount &&
    !c.premiumAnnual
  ) {
    missing.push("platba");
  }
  if (!c.anniversaryDate) missing.push("revizní datum");
  return missing;
}

function contractStatus(c: ContractRow): string {
  if (c.anniversaryDate) {
    const daysUntil = getDaysUntil(c.anniversaryDate);
    if (daysUntil != null && daysUntil < 0) return "po revizi, čeká na aktualizaci";
  }
  return "aktivní/monitorovaná";
}
