/**
 * Rule-based opportunity detection. Each rule: condition(signals) + buildOpportunity(signals).
 * No LLM; all text is fixed or from template variables.
 */

import type { OpportunitySignals, AiOpportunity, SourceSignal } from "./types";
import {
  SOURCE_SIGNAL_TYPES,
  type OpportunityCategory,
  type OpportunityType,
  type RecommendedActionType,
  type ConfidenceLevel,
} from "./types";
import { segmentToCaseType, caseTypeToSegments } from "@/app/lib/segment-hierarchy";

export type RuleConfig = {
  staleAnalysisMonths: number;
  noContactMonths: number;
  staleOpportunityDays: number;
  anniversaryWindowDays: number;
};

function now(): Date {
  return new Date();
}

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Build a stable opportunity id. */
function opportunityId(type: OpportunityType, key: string): string {
  return `opportunity_${type}_${key.replace(/\s/g, "_")}`;
}

/** Create base opportunity fields. key should be stable for deduplication (e.g. contactId, analysisId, segmentCode). */
function baseOpportunity(
  signals: OpportunitySignals,
  type: OpportunityType,
  category: OpportunityCategory,
  title: string,
  explanation: string,
  recommendation: string,
  recommendedAction: string,
  recommendedActionType: RecommendedActionType,
  priority: 1 | 2 | 3 | 4 | 5,
  sourceSignals: SourceSignal[],
  confidence: ConfidenceLevel = "high",
  entityIds?: AiOpportunity["entityIds"],
  key?: string
): AiOpportunity {
  const t = now();
  const stableKey = key ?? `${signals.contactId}_${type}_${t.getTime()}`;
  return {
    id: opportunityId(type, stableKey),
    clientId: signals.contactId,
    householdId: signals.householdId,
    householdName: signals.householdName,
    scope: signals.financialSummary.scope,
    category,
    subcategory: null,
    priority,
    type,
    title,
    explanation,
    recommendation,
    recommendedAction,
    recommendedActionType,
    confidence,
    sourceSignals,
    createdAt: t,
    updatedAt: t,
    expiresAt: null,
    entityIds,
  };
}

// ---- no_analysis ----
export function conditionNoAnalysis(signals: OpportunitySignals): boolean {
  return signals.financialSummary.status === "missing";
}

export function buildNoAnalysis(signals: OpportunitySignals): AiOpportunity {
  return baseOpportunity(
    signals,
    "no_analysis",
    "analyza",
    "Klient nemá finanční analýzu",
    "Klient nemá žádnou finanční analýzu. Založení analýzy je vhodným prvním krokem.",
    "Založte nebo otevřete finanční analýzu pro tohoto klienta.",
    "Založit finanční analýzu",
    "create_analysis",
    1,
    [{ type: SOURCE_SIGNAL_TYPES.ANALYSIS_MISSING, label: "Analýza chybí" }],
    "high",
    undefined,
    signals.contactId
  );
}

// ---- stale_analysis ----
export function conditionStaleAnalysis(
  signals: OpportunitySignals,
  config: RuleConfig
): boolean {
  if (signals.financialSummary.status !== "completed" && signals.financialSummary.status !== "exported")
    return false;
  const updatedAt = signals.financialSummary.updatedAt;
  if (!updatedAt) return false;
  return new Date(updatedAt) < monthsAgo(config.staleAnalysisMonths);
}

export function buildStaleAnalysis(
  signals: OpportunitySignals,
  config: RuleConfig
): AiOpportunity {
  const updatedAt = signals.financialSummary.updatedAt!;
  const label = `Analýza aktualizována ${new Date(updatedAt).toLocaleDateString("cs-CZ")}`;
  return baseOpportunity(
    signals,
    "stale_analysis",
    "analyza",
    "Analýza je starší než 12 měsíců",
    "Finanční analýza je starší než 12 měsíců a měla by se obnovit.",
    "Otevřete analýzu a naplánujte její revizi s klientem.",
    "Otevřít analýzu",
    "open_analysis",
    2,
    [
      { type: SOURCE_SIGNAL_TYPES.ANALYSIS_UPDATED_AT, label, value: updatedAt.toISOString() },
    ],
    "high",
    { analysisId: signals.financialSummary.primaryAnalysisId },
    signals.financialSummary.primaryAnalysisId ?? signals.contactId
  );
}

// ---- draft_analysis ----
export function conditionDraftAnalysis(signals: OpportunitySignals): boolean {
  return signals.financialSummary.status === "draft";
}

export function buildDraftAnalysis(signals: OpportunitySignals): AiOpportunity {
  return baseOpportunity(
    signals,
    "draft_analysis",
    "analyza",
    "Analýza je rozpracovaná",
    "Finanční analýza je ve stavu rozpracováno.",
    "Dokončete analýzu a případně ji exportujte.",
    "Dokončit analýzu",
    "complete_analysis",
    2,
    [
      {
        type: SOURCE_SIGNAL_TYPES.ANALYSIS_STATUS,
        label: "Stav analýzy: rozpracováno",
      },
    ],
    "high",
    { analysisId: signals.financialSummary.primaryAnalysisId },
    signals.financialSummary.primaryAnalysisId ?? signals.contactId
  );
}

// ---- no_recent_contact ----
export function conditionNoRecentContact(
  signals: OpportunitySignals,
  config: RuleConfig
): boolean {
  const last = signals.lastMeetingAt;
  if (!last) return true;
  return last < monthsAgo(config.noContactMonths);
}

export function buildNoRecentContact(
  signals: OpportunitySignals,
  config: RuleConfig
): AiOpportunity {
  const last = signals.lastMeetingAt;
  const label = last
    ? `Poslední schůzka ${last.toLocaleDateString("cs-CZ")}`
    : "Žádná schůzka v historii";
  return baseOpportunity(
    signals,
    "no_recent_contact",
    "reaktivace",
    "Dlouho bez kontaktu s klientem",
    last
      ? `Poslední schůzka byla před více než ${config.noContactMonths} měsíci.`
      : "S klientem zatím nebyla naplánována žádná schůzka.",
    "Naplánujte schůzku nebo zavolejte klientovi.",
    "Naplánovat schůzku",
    "schedule_meeting",
    1,
    [{ type: SOURCE_SIGNAL_TYPES.LAST_MEETING_AT, label, value: last?.toISOString() ?? null }],
    "high",
    undefined,
    signals.contactId
  );
}

// ---- contract_review_due (per contract with anniversary in window) ----
export function conditionContractReviewDue(
  signals: OpportunitySignals,
  config: RuleConfig
): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = addDays(today, config.anniversaryWindowDays);
  return signals.contractTimeline.some((c) => {
    const ann = parseDate(c.anniversaryDate);
    if (!ann) return false;
    ann.setHours(0, 0, 0, 0);
    return ann >= today && ann <= windowEnd;
  });
}

export function buildContractReviewDueAll(
  signals: OpportunitySignals,
  config: RuleConfig
): AiOpportunity[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = addDays(today, config.anniversaryWindowDays);
  const out: AiOpportunity[] = [];
  for (const c of signals.contractTimeline) {
    const ann = parseDate(c.anniversaryDate);
    if (!ann) continue;
    ann.setHours(0, 0, 0, 0);
    if (ann < today || ann > windowEnd) continue;
    const key = c.id;
    out.push(
      baseOpportunity(
        signals,
        "contract_review_due",
        "servis",
        `Blíží se výročí smlouvy – ${c.segment}`,
        `Smlouva má výročí ${new Date(c.anniversaryDate!).toLocaleDateString("cs-CZ")}. Vhodná doba pro revizi.`,
        "Otevřete smlouvu a naplánujte revizi s klientem.",
        "Otevřít revizi smlouvy",
        "start_service_review",
        2,
        [
          {
            type: SOURCE_SIGNAL_TYPES.CONTRACT_ANNIVERSARY,
            label: `Výročí ${c.segment}`,
            value: c.anniversaryDate,
            entityId: c.id,
          },
        ],
        "high",
        { contractId: c.id, segmentCode: c.segment },
        c.id
      )
    );
  }
  return out;
}

// ---- service_follow_up: same as contract_review_due for first only (avoid dup), or one combined ----
// We already have contract_review_due; service_follow_up can be "anniversary passed recently" (e.g. last 30 days). Skip for v1 to avoid noise; one contract_review_due is enough.

// ---- coverage_gap (per relevant item with status none) ----
export function conditionCoverageGap(signals: OpportunitySignals): boolean {
  return signals.coverageItems.some(
    (i) => i.isRelevant && i.status === "none"
  );
}

export function buildCoverageGapAll(signals: OpportunitySignals): AiOpportunity[] {
  const openSegmentCodes = new Set<string>();
  for (const o of signals.openOpportunities) {
    for (const seg of caseTypeToSegments(o.caseType)) {
      openSegmentCodes.add(seg);
    }
  }
  const emittedSegments = new Set<string>();
  const out: AiOpportunity[] = [];
  for (const i of signals.coverageItems) {
    if (!i.isRelevant || i.status !== "none") continue;
    if (openSegmentCodes.has(i.segmentCode)) continue;
    if (emittedSegments.has(i.segmentCode)) continue;
    emittedSegments.add(i.segmentCode);
    const caseType = segmentToCaseType(i.segmentCode);
    out.push(
      baseOpportunity(
        signals,
        "coverage_gap",
        "obchodni_prilezitost",
        `Chybí pokrytí: ${i.label}`,
        `Oblast „${i.label}" není podle pokrytí vyřešená.`,
        "Založte obchod nebo úkol pro tuto oblast.",
        `Založit obchod – ${i.label}`,
        "create_opportunity",
        3,
        [
          {
            type: SOURCE_SIGNAL_TYPES.COVERAGE_NONE,
            label: i.label,
            value: i.segmentCode,
            entityId: null,
          },
        ],
        "high",
        { segmentCode: i.segmentCode, caseType },
        i.segmentCode
      )
    );
  }
  return out;
}

// ---- products_no_follow_up ----
export function conditionProductsNoFollowUp(
  signals: OpportunitySignals,
  config: RuleConfig
): boolean {
  const hasDone = signals.coverageItems.some((i) => i.isRelevant && i.status === "done");
  if (!hasDone) return false;
  const last = signals.lastMeetingAt;
  if (!last) return true;
  return last < monthsAgo(config.noContactMonths);
}

export function buildProductsNoFollowUp(
  signals: OpportunitySignals,
  config: RuleConfig
): AiOpportunity {
  return baseOpportunity(
    signals,
    "products_no_follow_up",
    "servis",
    "Klient má produkty, ale dlouho bez schůzky",
    "Klient má uzavřené produkty, ale dlouho nebyl kontakt.",
    "Naplánujte servisní schůzku.",
    "Naplánovat servisní schůzku",
    "schedule_meeting",
    3,
    [
      { type: SOURCE_SIGNAL_TYPES.COVERAGE_DONE, label: "Pokrytí: vyřešeno" },
      {
        type: SOURCE_SIGNAL_TYPES.LAST_MEETING_AT,
        label: signals.lastMeetingAt
          ? `Poslední schůzka ${signals.lastMeetingAt.toLocaleDateString("cs-CZ")}`
          : "Žádná schůzka",
      },
    ],
    "high",
    undefined,
    signals.contactId
  );
}

// ---- stale_opportunity (per opportunity not updated in X days) ----
export function conditionStaleOpportunity(
  signals: OpportunitySignals,
  config: RuleConfig
): boolean {
  const cutoff = daysAgo(config.staleOpportunityDays);
  return signals.openOpportunities.some((o) => new Date(o.updatedAt) < cutoff);
}

export function buildStaleOpportunityAll(
  signals: OpportunitySignals,
  config: RuleConfig
): AiOpportunity[] {
  const cutoff = daysAgo(config.staleOpportunityDays);
  const out: AiOpportunity[] = [];
  for (const o of signals.openOpportunities) {
    if (new Date(o.updatedAt) >= cutoff) continue;
    out.push(
      baseOpportunity(
        signals,
        "stale_opportunity",
        "obchodni_prilezitost",
        `Obchod bez pohybu: ${o.caseType}`,
        `Obchod nebyl aktualizován více než ${config.staleOpportunityDays} dní.`,
        "Otevřete obchod a přidejte úkol nebo posuňte stav.",
        "Otevřít obchod",
        "open_opportunity",
        2,
        [
          {
            type: SOURCE_SIGNAL_TYPES.OPPORTUNITY_STALE,
            label: `Aktualizace ${new Date(o.updatedAt).toLocaleDateString("cs-CZ")}`,
            value: o.updatedAt.toISOString(),
            entityId: o.id,
          },
        ],
        "high",
        { opportunityId: o.id },
        o.id
      )
    );
  }
  return out;
}

// ---- schedule_meeting ----
export function conditionScheduleMeeting(signals: OpportunitySignals): boolean {
  return signals.nextMeetingAt === null;
}

export function buildScheduleMeeting(signals: OpportunitySignals): AiOpportunity {
  return baseOpportunity(
    signals,
    "schedule_meeting",
    "doporuceni_schuzky",
    "Není naplánovaná další schůzka",
    "U klienta není v kalendáři žádná nadcházející schůzka.",
    "Naplánujte další schůzku.",
    "Naplánovat schůzku",
    "schedule_meeting",
    3,
    [{ type: SOURCE_SIGNAL_TYPES.NO_UPCOMING_MEETING, label: "Žádná nadcházející schůzka" }],
    "high",
    undefined,
    signals.contactId
  );
}

// ---- analysis_gaps ----
export function conditionAnalysisGaps(signals: OpportunitySignals): boolean {
  return (
    signals.financialSummary.status !== "missing" &&
    signals.financialSummary.gaps.length > 0
  );
}

export function buildAnalysisGaps(signals: OpportunitySignals): AiOpportunity {
  const gaps = signals.financialSummary.gaps;
  const gapList = gaps.slice(0, 5).join(", ");
  return baseOpportunity(
    signals,
    "analysis_gaps",
    "analyza",
    "Z analýzy vyplývají mezery",
    `Analýza ukazuje: ${gapList}.`,
    "Otevřete analýzu a doplňte cíle nebo řešení mezer.",
    "Otevřít analýzu",
    "open_analysis",
    2,
    [
      {
        type: SOURCE_SIGNAL_TYPES.ANALYSIS_GAPS,
        label: "Mezery v analýze",
        value: gaps.length,
      },
    ],
    "high",
    { analysisId: signals.financialSummary.primaryAnalysisId },
    signals.financialSummary.primaryAnalysisId ?? `gaps_${signals.contactId}`
  );
}

// ---- ask_referral ----
export function conditionAskReferral(signals: OpportunitySignals): boolean {
  const ref = signals.referralRequestSignals;
  return Boolean(
    ref &&
      ref.signals.length > 0 &&
      !ref.suppressReason
  );
}

export function buildAskReferral(signals: OpportunitySignals): AiOpportunity {
  const ref = signals.referralRequestSignals!;
  const primary = ref.signals[0];
  return baseOpportunity(
    signals,
    "ask_referral",
    "referral",
    "Požádat o doporučení",
    primary.description,
    "Vytvořte úkol nebo naplánujte schůzku a využijte vhodný moment k požádání o doporučení.",
    "Vytvořit úkol: Požádat o doporučení",
    "create_task",
    3,
    [{ type: "referral_timing", label: primary.label }],
    "high",
    undefined,
    `referral_${signals.contactId}`
  );
}
