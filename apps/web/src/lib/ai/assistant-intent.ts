/**
 * Structured intent for CRM assistant (Zod + JSON Schema for OpenAI Responses API).
 * V2: canonical intent model with product domain, multi-action, temporal expressions.
 */

import { z } from "zod";
import { nextTuesday } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  CANONICAL_INTENT_TYPES,
  PRODUCT_DOMAINS,
  type CanonicalIntent,
  type CanonicalIntentType,
  type ProductDomain,
  emptyCanonicalIntent,
  resolveProductDomain,
} from "./assistant-domain-model";

export const ASSISTANT_INTENT_ACTIONS = [
  "create_opportunity",
  "create_followup_task",
  "dashboard_summary",
  "general_chat",
  "search_contacts",
] as const;

export type AssistantIntentAction = (typeof ASSISTANT_INTENT_ACTIONS)[number];

export const assistantIntentSchema = z.object({
  actions: z.array(z.enum(ASSISTANT_INTENT_ACTIONS)).default(["general_chat"]),
  switchClient: z.boolean().optional().default(false),
  clientRef: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  ltv: z.number().nullable().optional(),
  purpose: z.string().nullable().optional(),
  bank: z.string().nullable().optional(),
  rateGuess: z.number().nullable().optional(),
  noEmail: z.boolean().optional().default(false),
  dueDateText: z.string().nullable().optional(),
});

export type AssistantIntent = z.infer<typeof assistantIntentSchema>;

export const canonicalIntentSchema = z.object({
  intentType: z.enum(CANONICAL_INTENT_TYPES).default("general_chat"),
  subIntent: z.string().nullable().default(null),
  productDomain: z.enum(PRODUCT_DOMAINS).nullable().default(null),
  clientRef: z.string().nullable().default(null),
  opportunityRef: z.string().nullable().default(null),
  documentRef: z.string().nullable().default(null),
  reviewRef: z.string().nullable().default(null),
  materialRequestRef: z.string().nullable().default(null),
  reviewLinkVisibleToClient: z.boolean().default(false),
  portalNotificationTitle: z.string().nullable().default(null),
  portalNotificationType: z.string().nullable().default(null),
  requestedActions: z.array(z.enum(CANONICAL_INTENT_TYPES)).default(["general_chat"]),
  amount: z.number().nullable().default(null),
  ltv: z.number().nullable().default(null),
  purpose: z.string().nullable().default(null),
  bank: z.string().nullable().default(null),
  rateGuess: z.number().nullable().default(null),
  premium: z.number().nullable().default(null),
  contractNumber: z.string().nullable().default(null),
  meetingDateText: z.string().nullable().default(null),
  dueDateText: z.string().nullable().default(null),
  taskTitle: z.string().nullable().default(null),
  noteContent: z.string().nullable().default(null),
  switchClient: z.boolean().default(false),
  noEmail: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type CanonicalIntentRaw = z.infer<typeof canonicalIntentSchema>;

export const CANONICAL_INTENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    intentType: { type: "string", enum: [...CANONICAL_INTENT_TYPES] },
    subIntent: { type: ["string", "null"] },
    productDomain: { type: ["string", "null"], enum: [...PRODUCT_DOMAINS, null] },
    clientRef: { type: ["string", "null"] },
    opportunityRef: { type: ["string", "null"] },
    documentRef: { type: ["string", "null"] },
    reviewRef: { type: ["string", "null"] },
    materialRequestRef: { type: ["string", "null"] },
    reviewLinkVisibleToClient: { type: "boolean" },
    portalNotificationTitle: { type: ["string", "null"] },
    portalNotificationType: { type: ["string", "null"] },
    requestedActions: { type: "array", items: { type: "string", enum: [...CANONICAL_INTENT_TYPES] } },
    amount: { type: ["number", "null"] },
    ltv: { type: ["number", "null"] },
    purpose: { type: ["string", "null"] },
    bank: { type: ["string", "null"] },
    rateGuess: { type: ["number", "null"] },
    premium: { type: ["number", "null"] },
    contractNumber: { type: ["string", "null"] },
    meetingDateText: { type: ["string", "null"] },
    dueDateText: { type: ["string", "null"] },
    taskTitle: { type: ["string", "null"] },
    noteContent: { type: ["string", "null"] },
    switchClient: { type: "boolean" },
    noEmail: { type: "boolean" },
    confidence: { type: "number" },
  },
  required: [
    "intentType",
    "subIntent",
    "productDomain",
    "clientRef",
    "opportunityRef",
    "documentRef",
    "reviewRef",
    "materialRequestRef",
    "reviewLinkVisibleToClient",
    "portalNotificationTitle",
    "portalNotificationType",
    "requestedActions",
    "amount",
    "ltv",
    "purpose",
    "bank",
    "rateGuess",
    "premium",
    "contractNumber",
    "meetingDateText",
    "dueDateText",
    "taskTitle",
    "noteContent",
    "switchClient",
    "noEmail",
    "confidence",
  ],
};

/** JSON Schema for OpenAI responses.create structured output (legacy). */
export const ASSISTANT_INTENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    actions: {
      type: "array",
      items: {
        type: "string",
        enum: [...ASSISTANT_INTENT_ACTIONS],
      },
    },
    switchClient: { type: "boolean" },
    clientRef: { type: ["string", "null"] },
    amount: { type: ["number", "null"] },
    ltv: { type: ["number", "null"] },
    purpose: { type: ["string", "null"] },
    bank: { type: ["string", "null"] },
    rateGuess: { type: ["number", "null"] },
    noEmail: { type: "boolean" },
    dueDateText: { type: ["string", "null"] },
  },
  required: [
    "actions",
    "switchClient",
    "clientRef",
    "amount",
    "ltv",
    "purpose",
    "bank",
    "rateGuess",
    "noEmail",
    "dueDateText",
  ],
};

export function coerceCanonicalIntentRaw(raw: unknown): CanonicalIntentRaw {
  const parsed = canonicalIntentSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return canonicalIntentSchema.parse({});
}

/** Convert canonical raw extraction to full CanonicalIntent with entity refs. */
export function toCanonicalIntent(raw: CanonicalIntentRaw): CanonicalIntent {
  return {
    intentType: raw.intentType as CanonicalIntentType,
    subIntent: raw.subIntent,
    productDomain: (raw.productDomain as ProductDomain) ?? null,
    targetClient: raw.clientRef ? { ref: raw.clientRef, resolved: false } : null,
    targetOpportunity: raw.opportunityRef ? { ref: raw.opportunityRef, resolved: false } : null,
    targetDocument: raw.documentRef ? { ref: raw.documentRef, resolved: false } : null,
    requestedActions: (raw.requestedActions as CanonicalIntentType[]) ?? ["general_chat"],
    extractedFacts: buildExtractedFacts(raw),
    missingFields: [],
    temporalExpressions: buildTemporalExpressions(raw),
    confidence: raw.confidence,
    requiresConfirmation: intentRequiresConfirmation(raw.intentType as CanonicalIntentType),
    switchClient: raw.switchClient,
    noEmail: raw.noEmail,
    userConstraints: [],
  };
}

function buildExtractedFacts(raw: CanonicalIntentRaw) {
  const facts: CanonicalIntent["extractedFacts"] = [];
  if (raw.amount != null) facts.push({ key: "amount", value: raw.amount, source: "user_text" });
  if (raw.ltv != null) facts.push({ key: "ltv", value: raw.ltv, source: "user_text" });
  if (raw.purpose) facts.push({ key: "purpose", value: raw.purpose, source: "user_text" });
  if (raw.bank) facts.push({ key: "bank", value: raw.bank, source: "user_text" });
  if (raw.rateGuess != null) facts.push({ key: "rateGuess", value: raw.rateGuess, source: "user_text" });
  if (raw.premium != null) facts.push({ key: "premium", value: raw.premium, source: "user_text" });
  if (raw.contractNumber) facts.push({ key: "contractNumber", value: raw.contractNumber, source: "user_text" });
  if (raw.taskTitle) facts.push({ key: "taskTitle", value: raw.taskTitle, source: "user_text" });
  if (raw.noteContent) facts.push({ key: "noteContent", value: raw.noteContent, source: "user_text" });
  if (raw.reviewRef) facts.push({ key: "reviewId", value: raw.reviewRef, source: "user_text" });
  if (raw.materialRequestRef) facts.push({ key: "materialRequestId", value: raw.materialRequestRef, source: "user_text" });
  if (raw.reviewLinkVisibleToClient) facts.push({ key: "visibleToClient", value: true, source: "user_text" });
  if (raw.portalNotificationTitle) {
    facts.push({ key: "portalNotificationTitle", value: raw.portalNotificationTitle, source: "user_text" });
  }
  if (raw.portalNotificationType) {
    facts.push({ key: "portalNotificationType", value: raw.portalNotificationType, source: "user_text" });
  }
  return facts;
}

function buildTemporalExpressions(raw: CanonicalIntentRaw) {
  const exprs: CanonicalIntent["temporalExpressions"] = [];
  if (raw.dueDateText) exprs.push({ raw: raw.dueDateText, resolved: null, confidence: 0.7 });
  if (raw.meetingDateText) exprs.push({ raw: raw.meetingDateText, resolved: null, confidence: 0.7 });
  return exprs;
}

const WRITE_INTENTS = new Set<CanonicalIntentType>([
  "create_opportunity",
  "update_opportunity",
  "update_client_request",
  "create_task",
  "create_followup",
  "schedule_meeting",
  "create_note",
  "create_internal_note",
  "append_note",
  "attach_document",
  "attach_document_to_opportunity",
  "classify_document",
  "request_document_review",
  "request_client_documents",
  "create_client_request",
  "create_material_request",
  "link_document_to_material_request",
  "update_portfolio",
  "publish_portfolio_item",
  "create_service_case",
  "create_reminder",
  "draft_portal_message",
  "send_portal_message",
  "approve_ai_contract_review",
  "apply_ai_review_to_crm",
  "link_ai_review_to_document_vault",
  "show_document_to_client",
  "notify_client_portal",
]);

export function intentRequiresConfirmation(intentType: CanonicalIntentType): boolean {
  return WRITE_INTENTS.has(intentType);
}

/** Bridge: convert legacy AssistantIntent to CanonicalIntent for gradual migration. */
export function legacyIntentToCanonical(legacy: AssistantIntent): CanonicalIntent {
  const hasCreate = legacy.actions.includes("create_opportunity");
  const hasFollowup = legacy.actions.includes("create_followup_task");
  const hasDashboard = legacy.actions.includes("dashboard_summary");
  const hasSearch = legacy.actions.includes("search_contacts");

  let intentType: CanonicalIntentType = "general_chat";
  const requestedActions: CanonicalIntentType[] = [];

  if (hasCreate) {
    intentType = "create_opportunity";
    requestedActions.push("create_opportunity");
  }
  if (hasFollowup) {
    if (intentType === "general_chat") intentType = "create_followup";
    requestedActions.push("create_followup");
  }
  if (hasDashboard) {
    if (intentType === "general_chat") intentType = "dashboard_summary";
    requestedActions.push("dashboard_summary");
  }
  if (hasSearch) {
    if (intentType === "general_chat") intentType = "search_contacts";
    requestedActions.push("search_contacts");
  }
  if (requestedActions.length === 0) requestedActions.push("general_chat");

  if (requestedActions.length > 1 && intentType !== "general_chat") {
    intentType = "multi_action";
  }

  // Bank alone is not sufficient to infer hypo — resolve domain from purpose text first;
  // only fall back to hypo if both bank and purpose are present and purpose suggests mortgage.
  const purposeDomain = resolveProductDomain(legacy.purpose);
  const bankImpliesHypo =
    !!legacy.bank &&
    !!legacy.purpose &&
    /hypot|úvěr|uver|ltv|byt|koupě|rekonstrukce/i.test(legacy.purpose);
  const domain = purposeDomain ?? (bankImpliesHypo ? "hypo" : null);

  return {
    intentType,
    subIntent: null,
    productDomain: domain,
    targetClient: legacy.clientRef ? { ref: legacy.clientRef, resolved: false } : null,
    targetOpportunity: null,
    targetDocument: null,
    requestedActions,
    extractedFacts: [
      ...(legacy.amount != null ? [{ key: "amount" as const, value: legacy.amount, source: "user_text" as const }] : []),
      ...(legacy.ltv != null ? [{ key: "ltv" as const, value: legacy.ltv, source: "user_text" as const }] : []),
      ...(legacy.purpose ? [{ key: "purpose" as const, value: legacy.purpose, source: "user_text" as const }] : []),
      ...(legacy.bank ? [{ key: "bank" as const, value: legacy.bank, source: "user_text" as const }] : []),
      ...(legacy.rateGuess != null ? [{ key: "rateGuess" as const, value: legacy.rateGuess, source: "user_text" as const }] : []),
    ],
    missingFields: [],
    temporalExpressions: legacy.dueDateText ? [{ raw: legacy.dueDateText, resolved: null, confidence: 0.7 }] : [],
    confidence: 0.7,
    requiresConfirmation: requestedActions.some((a) => WRITE_INTENTS.has(a)),
    switchClient: legacy.switchClient,
    noEmail: legacy.noEmail,
    userConstraints: legacy.noEmail ? ["no_email"] : [],
  };
}

/** Hypo/úvěr bundle: stejné ověřené chování jako executeMortgageDealAndFollowUpTask (customFields idempotence). */
export function shouldUseMortgageVerifiedBundle(c: CanonicalIntent): boolean {
  const wantsOpp = c.requestedActions.includes("create_opportunity");
  const wantsFu = c.requestedActions.includes("create_followup");
  if (!wantsOpp || !wantsFu) return false;
  if (c.productDomain === "hypo" || c.productDomain === "uver") return true;
  const hasHypoLex = c.extractedFacts.some(
    (f) =>
      f.key === "bank" ||
      (f.key === "purpose" && typeof f.value === "string" && /hypot|úvěr|uver|ltv/i.test(f.value)),
  );
  return hasHypoLex;
}

/** Mapuje kanonický intent zpět na legacy AssistantIntent pro mortgage executor. */
export function canonicalIntentToMortgageAssistantIntent(
  c: CanonicalIntent,
  opts?: { resolvedContactId?: string | null },
): AssistantIntent {
  const num = (key: string): number | null => {
    const f = c.extractedFacts.find((x) => x.key === key)?.value;
    return typeof f === "number" ? f : null;
  };
  const str = (key: string): string | null => {
    const f = c.extractedFacts.find((x) => x.key === key)?.value;
    return typeof f === "string" ? f : null;
  };
  const resolved = opts?.resolvedContactId;
  return {
    actions: ["create_opportunity", "create_followup_task"],
    switchClient: c.switchClient,
    clientRef:
      resolved != null && resolved !== ""
        ? null
        : c.targetClient?.ref && !c.targetClient.resolved
          ? c.targetClient.ref
          : str("clientRef"),
    amount: num("amount"),
    ltv: num("ltv"),
    purpose: str("purpose"),
    bank: str("bank"),
    rateGuess: num("rateGuess"),
    noEmail: c.noEmail,
    dueDateText: c.temporalExpressions[0]?.raw ?? null,
  };
}

const PRAGUE = "Europe/Prague";

export function computeNextTuesdayDatePrague(ref: Date = new Date()): string {
  const z = toZonedTime(ref, PRAGUE);
  const nt = nextTuesday(z);
  return formatInTimeZone(nt, PRAGUE, "yyyy-MM-dd");
}

export function heuristicIntentFlags(message: string): { switchClient: boolean; noEmail: boolean } {
  const lower = message.toLowerCase();
  const switchClient =
    /\bpřepni\s+klienta\b/u.test(message) ||
    /\bpřepnout\s+klienta\b/u.test(lower) ||
    /\bswitch\s+client\b/u.test(lower);
  const noEmail =
    /\bemail\s+neřeš/u.test(lower) ||
    /\bneřeš(uji)?\s+email/u.test(lower) ||
    /\bžádný\s+email/u.test(lower) ||
    /\bbez\s+emailu/u.test(lower);
  return { switchClient, noEmail };
}

export function coerceAssistantIntent(raw: unknown): AssistantIntent {
  const parsed = assistantIntentSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return {
    actions: ["general_chat"],
    switchClient: false,
    clientRef: null,
    amount: null,
    ltv: null,
    purpose: null,
    bank: null,
    rateGuess: null,
    noEmail: false,
    dueDateText: null,
  };
}

export function intentWantsCrmWrites(intent: AssistantIntent): boolean {
  return (
    intent.actions.includes("create_opportunity") || intent.actions.includes("create_followup_task")
  );
}

export function intentWantsDashboard(intent: AssistantIntent): boolean {
  return intent.actions.includes("dashboard_summary");
}
