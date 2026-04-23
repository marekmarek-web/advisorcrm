/**
 * Canonical domain model for the advisor AI assistant orchestration layer.
 * All assistant modules share these types for intent, context, execution and audit.
 */

export const PRODUCT_DOMAINS = [
  "hypo",
  "uver",
  "leasing",
  "stavebni_sporeni",
  "investice",
  "dip",
  "dps",
  "zivotni_pojisteni",
  "majetek",
  "odpovednost",
  "auto",
  "cestovni",
  "firma_pojisteni",
  "servis",
  "jine",
] as const;
export type ProductDomain = (typeof PRODUCT_DOMAINS)[number];

export const ASSISTANT_MODES = [
  "quick_assistant",
  "crm_operator",
  "document_operator",
  "client_service_operator",
  "portfolio_operator",
  "backoffice_support",
] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

export const ASSISTANT_CHANNELS = [
  "web_drawer",
  "mobile",
  "contact_detail",
  "dashboard",
  "client_portal_bridge",
  "pipeline_detail",
  "document_detail",
] as const;
export type AssistantChannel = (typeof ASSISTANT_CHANNELS)[number];

export const CANONICAL_INTENT_TYPES = [
  "create_opportunity",
  "update_opportunity",
  "create_task",
  "create_followup",
  "schedule_meeting",
  "create_note",
  "create_internal_note",
  "append_note",
  "attach_document",
  "classify_document",
  "request_document_review",
  "request_client_documents",
  "create_client_request",
  "create_contact",
  "create_material_request",
  "summarize_client",
  "prepare_meeting_brief",
  "prepare_email",
  "draft_portal_message",
  "update_portfolio",
  "publish_portfolio_item",
  "review_extraction",
  "approve_ai_contract_review",
  "apply_ai_review_to_crm",
  "link_ai_review_to_document_vault",
  "show_document_to_client",
  "attach_document_to_opportunity",
  "link_document_to_material_request",
  "notify_client_portal",
  "send_portal_message",
  "update_client_request",
  "create_service_case",
  "create_reminder",
  "update_contact",
  "create_contract",
  "update_coverage",
  "search_contacts",
  "dashboard_summary",
  "general_chat",
  "multi_action",
  "switch_client",
  "save_payment_setup",
] as const;
export type CanonicalIntentType = (typeof CANONICAL_INTENT_TYPES)[number];

export type TemporalExpression = {
  raw: string;
  resolved: string | null;
  confidence: number;
};

export type ExtractedFact = {
  key: string;
  value: string | number | boolean | null;
  source: "user_text" | "context" | "default";
};

export type CanonicalIntent = {
  intentType: CanonicalIntentType;
  subIntent: string | null;
  productDomain: ProductDomain | null;
  targetClient: { ref: string; resolved: boolean } | null;
  targetOpportunity: { ref: string; resolved: boolean } | null;
  targetDocument: { ref: string; resolved: boolean } | null;
  requestedActions: CanonicalIntentType[];
  extractedFacts: ExtractedFact[];
  missingFields: string[];
  temporalExpressions: TemporalExpression[];
  confidence: number;
  requiresConfirmation: boolean;
  switchClient: boolean;
  noEmail: boolean;
  userConstraints: string[];
};

export function emptyCanonicalIntent(): CanonicalIntent {
  return {
    intentType: "general_chat",
    subIntent: null,
    productDomain: null,
    targetClient: null,
    targetOpportunity: null,
    targetDocument: null,
    requestedActions: ["general_chat"],
    extractedFacts: [],
    missingFields: [],
    temporalExpressions: [],
    confidence: 0.5,
    requiresConfirmation: false,
    switchClient: false,
    noEmail: false,
    userConstraints: [],
  };
}

export const EXECUTION_STEP_STATUSES = [
  "planned",
  "requires_confirmation",
  "needs_input",
  "confirmed",
  "executing",
  "succeeded",
  "failed",
  "skipped",
] as const;
export type ExecutionStepStatus = (typeof EXECUTION_STEP_STATUSES)[number];

export const WRITE_ACTION_TYPES = [
  "createOpportunity",
  "updateOpportunity",
  "createServiceCase",
  "createTask",
  "updateTask",
  "createFollowUp",
  "scheduleCalendarEvent",
  "createMeetingNote",
  "appendMeetingNote",
  "attachDocumentToClient",
  "attachDocumentToOpportunity",
  "classifyDocument",
  "triggerDocumentReview",
  "approveAiContractReview",
  "applyAiContractReviewToCrm",
  "linkAiContractReviewToDocuments",
  "setDocumentVisibleToClient",
  "linkDocumentToMaterialRequest",
  "createClientPortalNotification",
  "createClientRequest",
  "updateClientRequest",
  "createMaterialRequest",
  "createInternalNote",
  "createContact",
  "updateContact",
  "publishPortfolioItem",
  "updatePortfolioItem",
  "createReminder",
  "draftEmail",
  "draftClientPortalMessage",
  "sendPortalMessage",
  "createContract",
  "upsertContactCoverage",
  "savePaymentSetup",
] as const;
export type WriteActionType = (typeof WRITE_ACTION_TYPES)[number];

export type ExecutionStep = {
  stepId: string;
  action: WriteActionType;
  params: Record<string, unknown>;
  label: string;
  requiresConfirmation: boolean;
  isReadOnly: boolean;
  dependsOn: string[];
  status: ExecutionStepStatus;
  result: ExecutionStepResult | null;
};

export type StepResultOutcome = "executed" | "idempotent_hit" | "duplicate_hit" | "failed" | "skipped" | "requires_input";

export type ExecutionStepResult = {
  ok: boolean;
  outcome: StepResultOutcome;
  entityId: string | null;
  entityType: string | null;
  warnings: string[];
  error: string | null;
  retryable?: boolean;
};

export type ExecutionPlan = {
  planId: string;
  intentType: CanonicalIntentType;
  productDomain: ProductDomain | null;
  contactId: string | null;
  opportunityId: string | null;
  /** Tenant, ve kterém byl plán sestaven; proti session při resume / safety kontrole. */
  tenantId?: string | null;
  steps: ExecutionStep[];
  status: "draft" | "awaiting_confirmation" | "executing" | "completed" | "partial_failure";
  createdAt: Date;
  /**
   * True when execution_actions ledger was unavailable (e.g. missing migration).
   * Writes still run; idempotency/audit in DB is skipped — surface a user-facing warning.
   */
  ledgerDegraded?: boolean;
};

export type StepOutcome = {
  stepId: string;
  action: WriteActionType;
  label: string;
  status: "succeeded" | "failed" | "skipped" | "idempotent_hit" | "requires_input";
  entityId: string | null;
  entityType: string | null;
  error: string | null;
  warnings: string[];
  retryable?: boolean;
};

export type VerifiedAssistantResult = {
  message: string;
  plan: ExecutionPlan | null;
  referencedEntities: { type: string; id: string; label?: string }[];
  suggestedNextSteps: string[];
  warnings: string[];
  confidence: number;
  stepOutcomes: StepOutcome[];
  hasPartialFailure: boolean;
  allSucceeded: boolean;
};

export type ContextLockState = {
  lockedClientId: string | null;
  lockedOpportunityId: string | null;
  lockedReviewId: string | null;
  lockedDocumentId: string | null;
  activeChannel: AssistantChannel | null;
  assistantMode: AssistantMode;
};

export function defaultContextLock(): ContextLockState {
  return {
    lockedClientId: null,
    lockedOpportunityId: null,
    lockedReviewId: null,
    lockedDocumentId: null,
    activeChannel: null,
    assistantMode: "quick_assistant",
  };
}

export const CASE_TYPE_TO_PRODUCT_DOMAIN: Record<string, ProductDomain> = {
  hypo: "hypo",
  hypotéka: "hypo",
  hypotéku: "hypo",
  hypoteku: "hypo",
  hypoteční: "hypo",
  refin: "hypo",
  refinancování: "hypo",
  refinancovani: "hypo",
  fixace: "hypo",
  ltv: "hypo",
  konsolidace: "uver",
  konsolidovat: "uver",
  uver: "uver",
  úvěr: "uver",
  úvěru: "uver",
  půjčka: "uver",
  pujcka: "uver",
  leasing: "leasing",
  leasingový: "leasing",
  leasingovy: "leasing",
  stavebko: "stavebni_sporeni",
  "stavební spoření": "stavebni_sporeni",
  "stavebni sporeni": "stavebni_sporeni",
  "spoření stavební": "stavebni_sporeni",
  investice: "investice",
  investiční: "investice",
  fond: "investice",
  fondy: "investice",
  dip: "dip",
  dps: "dps",
  penze: "dps",
  penzijní: "dps",
  "spoření na důchod": "dps",
  zp: "zivotni_pojisteni",
  životní: "zivotni_pojisteni",
  rizikové: "zivotni_pojisteni",
  riziko: "zivotni_pojisteni",
  úrazové: "zivotni_pojisteni",
  úraz: "zivotni_pojisteni",
  maj: "majetek",
  majetek: "majetek",
  nemovitost: "majetek",
  domácnost: "majetek",
  odp: "odpovednost",
  odpovědnost: "odpovednost",
  odpovědko: "odpovednost",
  odpovedko: "odpovednost",
  auto: "auto",
  auto_pr: "auto",
  auto_hav: "auto",
  povinné: "auto",
  havarijní: "auto",
  povko: "auto",
  havko: "auto",
  cestovní: "cestovni",
  cest: "cestovni",
  cestovka: "cestovni",
  firma: "firma_pojisteni",
  firma_poj: "firma_pojisteni",
  firemní: "firma_pojisteni",
  "firemní pojištění": "firma_pojisteni",
  podnikatel: "firma_pojisteni",
  podnikatelé: "firma_pojisteni",
  servis: "servis",
  servisní: "servis",
  výročí: "servis",
  vyroci: "servis",
  jiné: "jine",
  /** Poradenský slang → productDomain (P1) */
  životko: "zivotni_pojisteni",
  životka: "zivotni_pojisteni",
  krytí: "zivotni_pojisteni",
  kryti: "zivotni_pojisteni",
  penzijko: "dps",
  penžijko: "dps",
  dpsko: "dps",
  dipko: "dip",
  hypoška: "hypo",
  hypošku: "hypo",
  spotřebák: "uver",
  spotrebak: "uver",
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Najde productDomain podle výskytu klíče ze slovníku v libovolném textu (nejdelší shoda má přednost). */
export function findProductDomainInMessage(text: string): ProductDomain | null {
  const lower = text.toLowerCase();
  const keys = Object.keys(CASE_TYPE_TO_PRODUCT_DOMAIN).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (key.length <= 2) continue;
    if (/\s/.test(key) || key.length >= 5) {
      if (lower.includes(key)) return CASE_TYPE_TO_PRODUCT_DOMAIN[key]!;
    } else if (new RegExp(`\\b${escapeRegExp(key)}\\b`, "iu").test(text)) {
      return CASE_TYPE_TO_PRODUCT_DOMAIN[key]!;
    }
  }
  return null;
}

/**
 * Výchozí kód segmentu smlouvy pro productDomain (kromě `auto`, kde je potřeba textová nápověda).
 * Shodné s `contractSegments` v packages/db.
 */
export const PRODUCT_DOMAIN_DEFAULT_SEGMENT: Partial<Record<ProductDomain, string>> = {
  hypo: "HYPO",
  uver: "UVER",
  zivotni_pojisteni: "ZP",
  dip: "DIP",
  dps: "DPS",
  majetek: "MAJ",
  odpovednost: "ODP",
  cestovni: "CEST",
  investice: "INV",
  firma_pojisteni: "FIRMA_POJ",
};

/** Slang s jednoznačným segmentem (auto PR vs HAV řeší textové heuristiky). */
const SLANG_TO_CONTRACT_SEGMENT: Record<string, string> = {
  životko: "ZP",
  životka: "ZP",
  penzijko: "DPS",
  penžijko: "DPS",
  dpsko: "DPS",
  dipko: "DIP",
  hypoška: "HYPO",
  hypošku: "HYPO",
  spotřebák: "UVER",
  spotrebak: "UVER",
  povko: "AUTO_PR",
  havko: "AUTO_HAV",
};

/**
 * Odvodí kód segmentu smlouvy z uživatelského textu (slang, doména, klíčová slova u auta).
 */
export function resolveContractSegmentFromUserText(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [slang, seg] of Object.entries(SLANG_TO_CONTRACT_SEGMENT)) {
    if (lower.includes(slang)) return seg;
  }
  // Employee-liability (ODP_ZAM) must be checked BEFORE generic odpovednost → ODP fallback.
  // Pokrývá skloňování „zaměstnanec / zaměstnance / zaměstnanecká / …" (vzor „zaměstnan" bez suffixu) i pracovní odpovědnost.
  if (/zam[ěe]stnan|pracovn[íi]\s*odpov[ěe]dnos/i.test(text)) {
    return "ODP_ZAM";
  }
  if (/\bhavarijní|havarijni|\bhav\b|kasko/i.test(text)) return "AUTO_HAV";
  if (/\bpovinné\s*ručení|povinne\s*ruceni|\bpov\b|povko|čtvrtá\s+silnice/i.test(text)) return "AUTO_PR";

  const domain = resolveProductDomain(text) ?? findProductDomainInMessage(text);
  if (domain === "auto") {
    if (/\bhav|kasko|havarijní|havarijni/i.test(lower)) return "AUTO_HAV";
    if (/\bpov|ručení|ruceni|povinné|povinne/i.test(lower)) return "AUTO_PR";
    return "AUTO_PR";
  }
  if (domain && PRODUCT_DOMAIN_DEFAULT_SEGMENT[domain]) {
    return PRODUCT_DOMAIN_DEFAULT_SEGMENT[domain]!;
  }
  return null;
}

export function resolveProductDomain(text: string | null | undefined): ProductDomain | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  return CASE_TYPE_TO_PRODUCT_DOMAIN[lower] ?? null;
}

export function detectProductSubIntent(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/refinanc|refin\b|fixace|výročí fixace|vyroci fixace/i.test(text)) return "refinancovani";
  if (/konsolidac|sloučit půjčky|sloucit pujcky|sloučení úvěrů|slouceni uveru/i.test(text)) {
    return "konsolidace";
  }
  if (/leasing/i.test(text)) return "leasing";
  if (/stavební spoření|stavebni sporeni|stavebko/i.test(text)) return "stavebni_sporeni";
  if (/povko|povinné ručení|povinne ruceni|\bpov\b/i.test(lower) && /havko|havarijn|kasko|\bhav\b/i.test(lower)) {
    return "auto_combo";
  }
  if (/povko|povinné ručení|povinne ruceni|\bpov\b/i.test(lower)) return "auto_pr";
  if (/havko|havarijn|kasko|\bhav\b/i.test(lower)) return "auto_hav";
  return null;
}
