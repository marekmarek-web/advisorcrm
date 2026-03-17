/**
 * AI opportunities and next best action – types and enums.
 * Rule-based layer over trusted client data; no LLM for "what" to recommend.
 */

import type { ReferralRequestSignalsResult } from "@/lib/referral/types";

export type OpportunityCategory =
  | "ochrana"
  | "investice"
  | "rezerva"
  | "hypoteka"
  | "servis"
  | "aktivita"
  | "reaktivace"
  | "analyza"
  | "obchodni_prilezitost"
  | "doporuceni_schuzky"
  | "referral";

export type OpportunityType =
  | "no_analysis"
  | "stale_analysis"
  | "draft_analysis"
  | "no_recent_contact"
  | "contract_review_due"
  | "service_follow_up"
  | "coverage_gap"
  | "products_no_follow_up"
  | "stale_opportunity"
  | "schedule_meeting"
  | "open_opportunity"
  | "create_task"
  | "analysis_gaps"
  | "ask_referral";

export type RecommendedActionType =
  | "open_analysis"
  | "create_analysis"
  | "complete_analysis"
  | "schedule_meeting"
  | "create_task"
  | "create_opportunity"
  | "open_opportunity"
  | "open_contract"
  | "open_document"
  | "open_timeline"
  | "start_service_review";

export type ConfidenceLevel = "high" | "medium" | "low";

export type OpportunityScope = "contact" | "household";

/** Source signal – why this opportunity was generated (auditability). */
export type SourceSignal = {
  type: string;
  label: string;
  value?: string | number | null;
  entityId?: string | null;
};

export type AiOpportunity = {
  id: string;
  clientId: string;
  householdId: string | null;
  householdName: string | null;
  scope: OpportunityScope;
  category: OpportunityCategory;
  subcategory: string | null;
  /** 1 = highest priority for display/sort */
  priority: 1 | 2 | 3 | 4 | 5;
  type: OpportunityType;
  title: string;
  explanation: string;
  recommendation: string;
  recommendedAction: string;
  recommendedActionType: RecommendedActionType;
  confidence: ConfidenceLevel;
  sourceSignals: SourceSignal[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  /** Optional entity IDs for CTA (e.g. analysisId, opportunityId, contractId) */
  entityIds?: {
    analysisId?: string | null;
    opportunityId?: string | null;
    contractId?: string | null;
    segmentCode?: string | null;
    caseType?: string | null;
  };
};

export type NextBestAction = AiOpportunity | null;

/** Result of getClientAiOpportunities */
export type ClientAiOpportunitiesResult = {
  opportunities: AiOpportunity[];
  nextBestAction: NextBestAction;
  /** True if we had at least some structured data to compute from */
  hasAnyData: boolean;
};

/** Source signal type constants (for consistent labels and audit). */
export const SOURCE_SIGNAL_TYPES = {
  ANALYSIS_MISSING: "analysis_missing",
  ANALYSIS_STATUS: "analysis_status",
  ANALYSIS_UPDATED_AT: "analysis_updated_at",
  ANALYSIS_GAPS: "analysis_gaps",
  LAST_MEETING_AT: "last_meeting_at",
  NO_UPCOMING_MEETING: "no_upcoming_meeting",
  COVERAGE_NONE: "coverage_none",
  COVERAGE_DONE: "coverage_done",
  CONTRACT_ANNIVERSARY: "contract_anniversary",
  OPPORTUNITY_STALE: "opportunity_stale",
  SEGMENT_CODE: "segment_code",
} as const;

export const OPPORTUNITY_CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  ochrana: "Ochrana",
  investice: "Investice",
  rezerva: "Rezerva",
  hypoteka: "Hypotéka",
  servis: "Servis",
  aktivita: "Aktivita",
  reaktivace: "Reaktivace",
  analyza: "Analýza",
  obchodni_prilezitost: "Obchodní příležitost",
  doporuceni_schuzky: "Doporučení schůzky",
  referral: "Doporučení",
};

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  no_analysis: "Chybí finanční analýza",
  stale_analysis: "Zastaralá analýza",
  draft_analysis: "Rozpracovaná analýza",
  no_recent_contact: "Dlouho bez kontaktu",
  contract_review_due: "Revize smlouvy",
  service_follow_up: "Servisní follow-up",
  coverage_gap: "Nepokrytá oblast",
  products_no_follow_up: "Produkty bez návazného kontaktu",
  stale_opportunity: "Obchod bez pohybu",
  schedule_meeting: "Naplánovat schůzku",
  open_opportunity: "Založit obchod",
  create_task: "Vytvořit úkol",
  analysis_gaps: "Mezery v analýze",
  ask_referral: "Požádat o doporučení",
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: "Vysoká jistota",
  medium: "Střední jistota",
  low: "Nízká jistota",
};

/** Aggregated inputs for the opportunity engine (from existing actions). */
export type OpportunitySignals = {
  contactId: string;
  householdId: string | null;
  householdName: string | null;
  /** From getReferralRequestSignals – good moment to ask for referral */
  referralRequestSignals: ReferralRequestSignalsResult | null;
  /** From getClientFinancialSummaryForContact */
  financialSummary: {
    status: "missing" | "draft" | "completed" | "exported" | "archived";
    primaryAnalysisId: string | null;
    updatedAt: Date | null;
    scope: "contact" | "household";
    gaps: string[];
  };
  /** From getFinancialSummary (contract timeline) */
  contractTimeline: Array<{
    id: string;
    segment: string;
    partnerName: string | null;
    startDate: string | null;
    anniversaryDate: string | null;
  }>;
  /** From getCoverageForContact */
  coverageItems: Array<{
    itemKey: string;
    segmentCode: string;
    category: string;
    label: string;
    status: string;
    linkedContractId: string | null;
    linkedOpportunityId: string | null;
    isRelevant: boolean;
  }>;
  /** Open opportunities for contact (id, caseType, updatedAt) */
  openOpportunities: Array<{ id: string; caseType: string; updatedAt: Date }>;
  /** From getTasksByContactId (open tasks) */
  openTasksCount: number;
  /** Last meeting date (max startAt of past events for contact), or null */
  lastMeetingAt: Date | null;
  /** Next upcoming meeting (min startAt of future events), or null */
  nextMeetingAt: Date | null;
  /** Whether we have at least one contract or analysis or event (for empty state) */
  hasAnyData: boolean;
};
