/**
 * Canonical domain model for the advisor AI assistant orchestration layer.
 * All assistant modules share these types for intent, context, execution and audit.
 */

export const PRODUCT_DOMAINS = [
  "hypo",
  "uver",
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
  "append_note",
  "attach_document",
  "classify_document",
  "request_client_documents",
  "create_client_request",
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
  "search_contacts",
  "dashboard_summary",
  "general_chat",
  "multi_action",
  "switch_client",
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
  "publishPortfolioItem",
  "updatePortfolioItem",
  "createReminder",
  "draftEmail",
  "draftClientPortalMessage",
  "sendPortalMessage",
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

export type ExecutionStepResult = {
  ok: boolean;
  entityId: string | null;
  entityType: string | null;
  warnings: string[];
  error: string | null;
};

export type ExecutionPlan = {
  planId: string;
  intentType: CanonicalIntentType;
  productDomain: ProductDomain | null;
  contactId: string | null;
  opportunityId: string | null;
  steps: ExecutionStep[];
  status: "draft" | "awaiting_confirmation" | "executing" | "completed" | "partial_failure";
  createdAt: Date;
};

export type VerifiedAssistantResult = {
  message: string;
  plan: ExecutionPlan | null;
  referencedEntities: { type: string; id: string; label?: string }[];
  suggestedNextSteps: string[];
  warnings: string[];
  confidence: number;
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
  uver: "uver",
  úvěr: "uver",
  investice: "investice",
  investiční: "investice",
  dip: "dip",
  dps: "dps",
  penze: "dps",
  zp: "zivotni_pojisteni",
  životní: "zivotni_pojisteni",
  rizikové: "zivotni_pojisteni",
  riziko: "zivotni_pojisteni",
  maj: "majetek",
  majetek: "majetek",
  nemovitost: "majetek",
  domácnost: "majetek",
  odp: "odpovednost",
  odpovědnost: "odpovednost",
  auto: "auto",
  auto_pr: "auto",
  auto_hav: "auto",
  povinné: "auto",
  havarijní: "auto",
  cestovní: "cestovni",
  cest: "cestovni",
  firma: "firma_pojisteni",
  firma_poj: "firma_pojisteni",
  servis: "servis",
  jiné: "jine",
};

export function resolveProductDomain(text: string | null | undefined): ProductDomain | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  return CASE_TYPE_TO_PRODUCT_DOMAIN[lower] ?? null;
}
