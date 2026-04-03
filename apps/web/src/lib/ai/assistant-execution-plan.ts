/**
 * Execution plan builder: transforms CanonicalIntent into ordered steps
 * with confirmation policy, slot-filling gaps, and dependency tracking.
 */

import { randomUUID } from "crypto";
import type {
  CanonicalIntent,
  CanonicalIntentType,
  ExecutionPlan,
  ExecutionStep,
  WriteActionType,
} from "./assistant-domain-model";
import type { EntityResolutionResult } from "./assistant-entity-resolution";
import type { AssistantSession } from "./assistant-session";
import {
  canonicalTaskTitle,
  canonicalClientRequestSubject,
  canonicalMaterialRequestTitle,
  canonicalDealDetailLine,
} from "./assistant-canonical-names";

/**
 * Canonical intent → write action mapping.
 *
 * Request type semantics (3F):
 *   create_client_request  → createClientRequest
 *     Portal-style request stored as opportunity with customFields.client_portal_request=true.
 *     Used when a client submits a request (either via portal or advisor on their behalf).
 *     Side effects: activity log, audit, advisor in-app + e-mail notification.
 *
 *   create_service_case    → createServiceCase
 *     Advisor-internal service case for an existing contract/product (e.g. anniversary review,
 *     strategy change). No portal notification side effect; different customFields key: service_case.
 *
 *   create_material_request → createMaterialRequest
 *     Separate DB model (advisor_material_requests). Used to collect documents/data from client.
 *     Multi-action chaining with createOpportunity is supported.
 */
const INTENT_TO_WRITE_ACTION: Partial<Record<CanonicalIntentType, WriteActionType>> = {
  create_opportunity: "createOpportunity",
  update_opportunity: "updateOpportunity",
  update_client_request: "updateClientRequest",
  create_task: "createTask",
  create_followup: "createFollowUp",
  schedule_meeting: "scheduleCalendarEvent",
  create_note: "createMeetingNote",
  create_internal_note: "createInternalNote",
  append_note: "appendMeetingNote",
  attach_document: "attachDocumentToClient",
  attach_document_to_opportunity: "attachDocumentToOpportunity",
  classify_document: "classifyDocument",
  request_document_review: "triggerDocumentReview",
  request_client_documents: "createMaterialRequest",
  create_client_request: "createClientRequest",
  create_material_request: "createMaterialRequest",
  link_document_to_material_request: "linkDocumentToMaterialRequest",
  prepare_email: "draftEmail",
  draft_portal_message: "draftClientPortalMessage",
  send_portal_message: "sendPortalMessage",
  update_portfolio: "updatePortfolioItem",
  publish_portfolio_item: "publishPortfolioItem",
  create_service_case: "createServiceCase",
  create_reminder: "createReminder",
  approve_ai_contract_review: "approveAiContractReview",
  apply_ai_review_to_crm: "applyAiContractReviewToCrm",
  link_ai_review_to_document_vault: "linkAiContractReviewToDocuments",
  show_document_to_client: "setDocumentVisibleToClient",
  notify_client_portal: "createClientPortalNotification",
};

const READ_ONLY_INTENTS = new Set<CanonicalIntentType>([
  "general_chat",
  "dashboard_summary",
  "search_contacts",
  "summarize_client",
  "prepare_meeting_brief",
  "review_extraction",
  "switch_client",
]);

const HIGH_RISK_ACTIONS = new Set<WriteActionType>([
  "publishPortfolioItem",
  "sendPortalMessage",
  "approveAiContractReview",
  "applyAiContractReviewToCrm",
  "linkAiContractReviewToDocuments",
  "createClientPortalNotification",
  "setDocumentVisibleToClient",
  "linkDocumentToMaterialRequest",
]);

type ConfirmationPolicy = "always" | "high_risk_only" | "never";

function getConfirmationPolicy(action: WriteActionType): ConfirmationPolicy {
  if (HIGH_RISK_ACTIONS.has(action)) return "always";
  return "high_risk_only";
}

function buildStepParams(
  intent: CanonicalIntent,
  resolution: EntityResolutionResult,
  action: WriteActionType,
  session?: AssistantSession | null,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const contactId = resolution.client?.entityId;

  if (contactId) params.contactId = contactId;
  if (resolution.opportunity?.entityId) params.opportunityId = resolution.opportunity.entityId;
  if (resolution.document?.entityId) params.documentId = resolution.document.entityId;

  for (const fact of intent.extractedFacts) {
    params[fact.key] = fact.value;
  }

  if (intent.productDomain) params.productDomain = intent.productDomain;

  for (const temporal of intent.temporalExpressions) {
    if (temporal.resolved) {
      params.resolvedDate = temporal.resolved;
    } else {
      params.rawDateText = temporal.raw;
    }
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!params.documentId && intent.targetDocument?.ref && uuidRe.test(intent.targetDocument.ref)) {
    params.documentId = intent.targetDocument.ref;
  }
  if (!params.opportunityId && intent.targetOpportunity?.ref && uuidRe.test(intent.targetOpportunity.ref)) {
    params.opportunityId = intent.targetOpportunity.ref;
  }

  const reviewActions = new Set<WriteActionType>([
    "approveAiContractReview",
    "applyAiContractReviewToCrm",
    "linkAiContractReviewToDocuments",
  ]);
  if (reviewActions.has(action) && !params.reviewId && session?.activeReviewId) {
    params.reviewId = session.activeReviewId;
  }
  if (!params.opportunityId && session?.lockedOpportunityId) {
    params.opportunityId = session.lockedOpportunityId;
  }
  if (!params.documentId && session?.lockedDocumentId) {
    params.documentId = session.lockedDocumentId;
  }
  if (action === "setDocumentVisibleToClient" && params.visibleToClient === undefined) {
    params.visibleToClient = true;
  }
  if (action === "createClientPortalNotification") {
    if (!params.portalNotificationTitle && typeof params.taskTitle === "string" && params.taskTitle.trim()) {
      params.portalNotificationTitle = params.taskTitle;
    }
    if (!params.portalNotificationBody && typeof params.noteContent === "string" && params.noteContent.trim()) {
      params.portalNotificationBody = params.noteContent;
    }
  }

  if (action === "scheduleCalendarEvent") {
    const rd = typeof params.resolvedDate === "string" ? params.resolvedDate.trim() : "";
    if (!params.startAt && rd) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) {
        params.startAt = `${rd}T09:00:00.000Z`;
      } else if (/\d{4}-\d{2}-\d{2}T/.test(rd)) {
        params.startAt = rd;
      }
    }
  }

  // Inject canonical titles so write adapters get clean Czech names
  if (action === "createTask" || action === "createFollowUp" || action === "createReminder") {
    if (!params.taskTitle) {
      params.taskTitle = canonicalTaskTitle({
        action: action as "createTask" | "createFollowUp" | "createReminder",
        productDomain: typeof params.productDomain === "string" ? params.productDomain : null,
        existingTitle: typeof params.taskTitle === "string" ? params.taskTitle : null,
        purpose: typeof params.purpose === "string" ? params.purpose : null,
      });
    }
  }

  if (action === "createClientRequest") {
    if (!params.subject) {
      params.subject = canonicalClientRequestSubject({
        productDomain: typeof params.productDomain === "string" ? params.productDomain : null,
        existingSubject: typeof params.subject === "string" ? params.subject : null,
        taskTitle: typeof params.taskTitle === "string" ? params.taskTitle : null,
      });
    }
  }

  if (action === "createMaterialRequest") {
    if (!params.title && !params.taskTitle) {
      params.taskTitle = canonicalMaterialRequestTitle({
        productDomain: typeof params.productDomain === "string" ? params.productDomain : null,
      });
    }
  }

  return params;
}

/** Write actions that can receive opportunityId from a preceding createOpportunity in multi_action (3D-2). */
const MULTI_ACTION_OPPORTUNITY_CHILD_ACTIONS = new Set<WriteActionType>([
  "createTask",
  "createFollowUp",
  "scheduleCalendarEvent",
  "createMeetingNote",
  "createInternalNote",
  "createMaterialRequest",
  "attachDocumentToOpportunity",
]);

/**
 * When multi_action includes createOpportunity, later steps without opportunityId
 * depend on it so the engine can run waves in order and inject the new id.
 */
export function applyMultiActionOpportunityChaining(steps: ExecutionStep[], intent: CanonicalIntent): void {
  if (intent.intentType !== "multi_action") return;
  const oppIdx = steps.findIndex((s) => s.action === "createOpportunity");
  if (oppIdx < 0) return;
  const oppStep = steps[oppIdx];
  if (!oppStep) return;
  for (let i = oppIdx + 1; i < steps.length; i++) {
    const s = steps[i]!;
    if (!MULTI_ACTION_OPPORTUNITY_CHILD_ACTIONS.has(s.action)) continue;
    const oid = s.params.opportunityId;
    if (oid != null && oid !== "") continue;
    if (!s.dependsOn.includes(oppStep.stepId)) {
      s.dependsOn = [...s.dependsOn, oppStep.stepId];
    }
  }
}

/**
 * Required fields per write action. Kept in sync with runtime adapters so
 * the planner catches missing slots *before* execution hits a runtime error.
 *
 * "OR-groups" use `[["a","b"]]` — at least one of the group must be present.
 */
type FieldRequirement = string | string[];
const REQUIRED_FIELDS: Record<string, FieldRequirement[]> = {
  createOpportunity: ["contactId"],
  updateOpportunity: ["opportunityId"],
  createServiceCase: ["contactId", ["subject", "description", "noteContent"]],
  updateClientRequest: ["opportunityId"],
  createTask: ["contactId"],
  updateTask: ["taskId"],
  createFollowUp: ["contactId"],
  scheduleCalendarEvent: ["contactId", ["startAt", "resolvedDate"]],
  createMeetingNote: ["contactId"],
  appendMeetingNote: ["meetingNoteId"],
  createInternalNote: ["contactId"],
  attachDocumentToClient: ["contactId", "documentId"],
  attachDocumentToOpportunity: ["opportunityId", "documentId"],
  classifyDocument: ["documentId", ["documentType", "classification"]],
  triggerDocumentReview: ["documentId"],
  approveAiContractReview: ["reviewId"],
  applyAiContractReviewToCrm: ["reviewId"],
  linkAiContractReviewToDocuments: ["reviewId"],
  setDocumentVisibleToClient: ["documentId"],
  linkDocumentToMaterialRequest: ["materialRequestId", "documentId"],
  createClientPortalNotification: ["contactId", "portalNotificationTitle"],
  createClientRequest: ["contactId", ["subject", "description", "noteContent", "taskTitle"]],
  createMaterialRequest: ["contactId", ["taskTitle", "title", "description", "noteContent"]],
  draftEmail: ["contactId"],
  draftClientPortalMessage: ["contactId"],
  publishPortfolioItem: ["contractId"],
  updatePortfolioItem: ["contractId"],
  createReminder: ["contactId"],
  sendPortalMessage: ["contactId", ["portalMessageBody", "noteContent"]],
};

/**
 * Advisory field hints per (action, productDomain). These are informational only —
 * they do NOT affect plan status. Returned by computeWriteActionMissingFields when
 * productDomain is passed, but callers that determine plan status should only use the
 * structural fields (no domain arg).
 * Domain hints are surfaced separately via the playbook bridge in userConstraints.
 */
const DOMAIN_ADVISORY_HINTS: Partial<
  Record<WriteActionType, Partial<Record<string, string[]>>>
> = {
  createOpportunity: {
    hypo: ["amount|purpose"],
    uver: ["amount|purpose"],
    investice: ["purpose|investmentGoal"],
    dip: ["purpose|investmentGoal"],
    dps: ["purpose|investmentGoal"],
    zivotni_pojisteni: ["insuranceType|purpose"],
    majetek: ["insuranceType|purpose"],
    odpovednost: ["insuranceType|purpose"],
    auto: ["insuranceType|purpose"],
    cestovni: ["insuranceType|purpose"],
    firma_pojisteni: ["insuranceType|purpose"],
  },
};

/** Exported for tests and tooling — same rules as planner slot-filling. */
export function computeWriteActionMissingFields(
  action: WriteActionType,
  params: Record<string, unknown>,
  productDomain?: string | null,
): string[] {
  const missing: string[] = [];
  const fields = REQUIRED_FIELDS[action] ?? [];
  for (const req of fields) {
    if (Array.isArray(req)) {
      const anyPresent = req.some((k) => !!params[k]);
      if (!anyPresent) missing.push(req.join("|"));
    } else {
      if (!params[req]) missing.push(req);
    }
  }

  // Advisory domain hints: soft signals surfaced to help advisor fill slots.
  if (productDomain) {
    const domainHints = DOMAIN_ADVISORY_HINTS[action]?.[productDomain] ?? [];
    for (const hint of domainHints) {
      const keys = hint.split("|");
      const anyPresent = keys.some((k) => !!params[k]);
      if (!anyPresent && !missing.includes(hint)) {
        missing.push(hint);
      }
    }
  }

  return missing;
}

export function buildExecutionPlan(
  intent: CanonicalIntent,
  resolution: EntityResolutionResult,
  session?: AssistantSession | null,
): ExecutionPlan {
  const planId = `plan_${randomUUID().slice(0, 8)}`;
  const steps: ExecutionStep[] = [];

  if (READ_ONLY_INTENTS.has(intent.intentType)) {
    return {
      planId,
      intentType: intent.intentType,
      productDomain: intent.productDomain,
      contactId: resolution.client?.entityId ?? null,
      opportunityId: resolution.opportunity?.entityId ?? null,
      tenantId: session?.tenantId ?? null,
      steps: [],
      status: "completed",
      createdAt: new Date(),
    };
  }

  const rawActions =
    intent.intentType === "multi_action"
      ? intent.requestedActions.filter((a) => !READ_ONLY_INTENTS.has(a))
      : [intent.intentType].filter((a) => !READ_ONLY_INTENTS.has(a));

  const seenActions = new Set<string>();
  const actionsToProcess = rawActions.filter((a) => {
    if (seenActions.has(a)) return false;
    seenActions.add(a);
    return true;
  });

  for (const actionIntent of actionsToProcess) {
    const writeAction = INTENT_TO_WRITE_ACTION[actionIntent];
    if (!writeAction) continue;

    const params = buildStepParams(intent, resolution, writeAction, session);
    const missing = computeWriteActionMissingFields(writeAction, params);
    const policy = getConfirmationPolicy(writeAction);

    const step: ExecutionStep = {
      stepId: `step_${randomUUID().slice(0, 8)}`,
      action: writeAction,
      params,
      label: buildStepLabel(writeAction, params),
      requiresConfirmation: policy === "always" || missing.length === 0,
      isReadOnly: false,
      dependsOn: [],
      status: "requires_confirmation",
      result: null,
    };

    steps.push(step);
  }

  if (intent.intentType === "create_opportunity") {
    const hasFollowup = steps.some((s) => s.action === "createFollowUp");
    if (!hasFollowup && intent.requestedActions.includes("create_followup")) {
      const opp = steps.find((s) => s.action === "createOpportunity");
      steps.push({
        stepId: `step_${randomUUID().slice(0, 8)}`,
        action: "createFollowUp",
        params: { ...buildStepParams(intent, resolution, "createFollowUp", session) },
        label: "Vytvořit follow-up úkol",
        requiresConfirmation: true,
        isReadOnly: false,
        dependsOn: opp ? [opp.stepId] : [],
        status: "requires_confirmation",
        result: null,
      });
    }
  }

  applyMultiActionOpportunityChaining(steps, intent);

  // Structural fields only — advisory domain hints don't block execution.
  // Plan is "awaiting_confirmation" if at least one step is ready (no missing fields).
  // Only "draft" when EVERY step has missing critical fields.
  const readyCount = steps.filter(
    (s) => computeWriteActionMissingFields(s.action, s.params).length === 0,
  ).length;

  return {
    planId,
    intentType: intent.intentType,
    productDomain: intent.productDomain,
    contactId: resolution.client?.entityId ?? null,
    opportunityId: resolution.opportunity?.entityId ?? null,
    tenantId: session?.tenantId ?? null,
    steps,
    status: steps.length === 0
      ? "completed"
      : readyCount > 0
        ? "awaiting_confirmation"
        : "draft",
    createdAt: new Date(),
  };
}

const PRODUCT_DOMAIN_LABELS: Record<string, string> = {
  hypo: "Hypotéka",
  uver: "Úvěr",
  investice: "Investice",
  dip: "DIP",
  dps: "DPS",
  zivotni_pojisteni: "Životní pojištění",
  majetek: "Majetek",
  odpovednost: "Odpovědnost",
  auto: "Auto",
  cestovni: "Cestovní pojištění",
  firma_pojisteni: "Firemní pojištění",
  servis: "Servis",
  jine: "Jiné",
};

/**
 * Krátký název domény pro chip v náhledu akcí (6D) — bez duplicity v hlavním labelu kroku.
 * `jine` se jako chip neukazuje (málo užitečné).
 */
export function productDomainChipLabel(domain: string | null | undefined): string | undefined {
  if (domain == null || domain === "" || domain === "jine") return undefined;
  return PRODUCT_DOMAIN_LABELS[domain] ?? undefined;
}

function buildStepLabel(action: WriteActionType, _params: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    createOpportunity: "Vytvořit obchod",
    updateOpportunity: "Aktualizovat obchod",
    createServiceCase: "Vytvořit servisní případ",
    createTask: "Vytvořit úkol",
    createFollowUp: "Vytvořit follow-up úkol",
    scheduleCalendarEvent: "Naplánovat schůzku",
    createMeetingNote: "Vytvořit poznámku",
    appendMeetingNote: "Doplnit poznámku",
    attachDocumentToClient: "Připojit dokument",
    attachDocumentToOpportunity: "Připojit dokument k obchodu",
    classifyDocument: "Klasifikovat dokument",
    triggerDocumentReview: "Spustit review dokumentu",
    createClientRequest: "Vytvořit požadavek klienta",
    updateClientRequest: "Aktualizovat požadavek",
    createMaterialRequest: "Vyžádat podklady",
    createInternalNote: "Vytvořit interní poznámku",
    publishPortfolioItem: "Publikovat do portfolia",
    updatePortfolioItem: "Aktualizovat portfolio",
    createReminder: "Vytvořit připomínku",
    draftEmail: "Připravit email",
    draftClientPortalMessage: "Připravit zprávu klientovi",
    sendPortalMessage: "Odeslat portálovou zprávu",
    approveAiContractReview: "Schválit AI kontrolu smlouvy",
    applyAiContractReviewToCrm: "Aplikovat schválenou AI kontrolu do CRM",
    linkAiContractReviewToDocuments: "Propojit soubor z AI kontroly do dokumentů klienta",
    setDocumentVisibleToClient: "Zobrazit dokument klientovi v portálu",
    linkDocumentToMaterialRequest: "Přiřadit dokument k materiálovému požadavku",
    createClientPortalNotification: "Poslat upozornění do klientského portálu",
  };

  return labels[action] ?? action;
}

const STEP_DESCRIPTIONS: Partial<Record<WriteActionType, string>> = {
  createOpportunity: "Vytvoří nový obchod v CRM",
  updateOpportunity: "Aktualizuje existující obchod",
  createServiceCase: "Založí servisní případ pro smlouvu klienta",
  createTask: "Vytvoří úkol a přiřadí ke klientovi",
  createFollowUp: "Naplánuje následný kontakt s klientem",
  scheduleCalendarEvent: "Vytvoří událost v kalendáři",
  createMeetingNote: "Zapíše poznámku ze schůzky",
  appendMeetingNote: "Doplní existující poznámku",
  createInternalNote: "Uloží interní poznámku ke klientovi",
  attachDocumentToClient: "Přiřadí dokument ke kartě klienta",
  attachDocumentToOpportunity: "Přiřadí dokument k obchodu",
  classifyDocument: "Nastaví typ dokumentu pro správné zařazení",
  triggerDocumentReview: "Spustí automatickou kontrolu dokumentu",
  createClientRequest: "Zaeviduje požadavek klienta v systému",
  updateClientRequest: "Aktualizuje stav požadavku klienta",
  createMaterialRequest: "Odešle klientovi žádost o podklady",
  publishPortfolioItem: "Zpřístupní položku v portfoliu klienta",
  updatePortfolioItem: "Aktualizuje data v portfoliu klienta",
  createReminder: "Nastaví připomínku pro poradce",
  draftEmail: "Připraví návrh e-mailu k odeslání",
  draftClientPortalMessage: "Připraví zprávu do klientského portálu",
  sendPortalMessage: "Odešle zprávu do klientského portálu",
  approveAiContractReview: "Schválí výsledek AI kontroly smlouvy",
  applyAiContractReviewToCrm: "Zapíše schválená data z AI kontroly do CRM",
  linkAiContractReviewToDocuments: "Propojí soubor z AI kontroly s dokumenty klienta",
  setDocumentVisibleToClient: "Zpřístupní dokument klientovi v portálu",
  linkDocumentToMaterialRequest: "Propojí nahraný dokument s požadavkem na podklady",
  createClientPortalNotification: "Odešle upozornění klientovi do portálu",
};

export function buildStepDescription(action: WriteActionType, params: Record<string, unknown>): string | undefined {
  // For deal creation: show canonical detail line (bank, rate, maturity)
  if (action === "createOpportunity") {
    const detail = canonicalDealDetailLine(params);
    if (detail) return detail;
  }

  // For tasks: show the actual task title as the description
  if (action === "createTask" || action === "createFollowUp" || action === "createReminder") {
    const t = typeof params.taskTitle === "string" ? params.taskTitle.trim() : null;
    if (t) return t;
  }

  // For calendar event: show date + optional title
  if (action === "scheduleCalendarEvent") {
    const date = typeof params.resolvedDate === "string"
      ? params.resolvedDate.split("T")[0]
      : typeof params.startAt === "string"
        ? params.startAt.split("T")[0]
        : null;
    const title = typeof params.title === "string" ? params.title.trim() : null;
    if (date && title) return `${date} · ${title}`;
    if (date) return date;
  }

  // For client requests: show the subject
  if (action === "createClientRequest" || action === "createMaterialRequest") {
    const sub = typeof params.subject === "string" ? params.subject.trim()
      : typeof params.taskTitle === "string" ? params.taskTitle.trim() : null;
    if (sub) return sub;
  }

  // Fallback: generic description with domain chip if available
  const base = STEP_DESCRIPTIONS[action];
  if (!base) return undefined;

  const domain = productDomainChipLabel(params.productDomain as string | undefined);
  if (domain) return `${base} (${domain})`;

  return base;
}

const FIELD_LABELS: Record<string, string> = {
  contactId: "klient",
  opportunityId: "obchod",
  documentId: "dokument",
  reviewId: "review",
  taskId: "úkol",
  meetingNoteId: "poznámka",
  materialRequestId: "materiálový požadavek",
  contractId: "smlouva",
  subject: "předmět",
  description: "popis",
  noteContent: "obsah poznámky",
  taskTitle: "název úkolu",
  title: "název",
  startAt: "datum a čas",
  resolvedDate: "datum",
  documentType: "typ dokumentu",
  classification: "klasifikace",
  portalNotificationTitle: "nadpis upozornění",
  portalNotificationBody: "text upozornění",
  portalMessageBody: "text zprávy",
  amount: "částka",
  purpose: "účel",
  investmentGoal: "investiční cíl",
  insuranceType: "typ pojištění",
  visibleToClient: "viditelnost pro klienta",
};

function humanizeFieldRef(fieldRef: string): string {
  const parts = fieldRef.split("|");
  const labels = parts.map((p) => FIELD_LABELS[p] ?? p).filter(Boolean);
  if (labels.length <= 1) return labels[0] ?? fieldRef;
  return labels.slice(0, -1).join(", ") + " nebo " + labels[labels.length - 1];
}

export function buildValidationWarnings(
  action: WriteActionType,
  params: Record<string, unknown>,
): string[] {
  const missing = computeWriteActionMissingFields(action, params);
  if (missing.length === 0) return [];
  return missing.map((f) => `Chybí: ${humanizeFieldRef(f)}`);
}

export function getStepsAwaitingConfirmation(plan: ExecutionPlan): ExecutionStep[] {
  return plan.steps.filter((s) => s.status === "requires_confirmation");
}

/**
 * Preflight: confirm a step only if all required fields are present.
 * Steps with missing critical params get `requires_input` instead of `confirmed`.
 */
function preflightCheckStep(step: ExecutionStep): ExecutionStep {
  if (step.status !== "requires_confirmation") return step;
  const missing = computeWriteActionMissingFields(step.action, step.params);
  if (missing.length === 0) return { ...step, status: "confirmed" as const };
  const humanMissing = missing.map((f) => humanizeFieldRef(f)).join(", ");
  return {
    ...step,
    status: "skipped" as const,
    result: {
      ok: false,
      outcome: "requires_input" as const,
      entityId: null,
      entityType: null,
      warnings: [],
      error: `Chybí povinné údaje: ${humanMissing}. Doplňte je a zkuste znovu.`,
      retryable: true,
    },
  };
}

export function confirmAllSteps(plan: ExecutionPlan): ExecutionPlan {
  const steps = plan.steps.map(preflightCheckStep);
  return { ...plan, status: "executing", steps };
}

const SKIPPED_BY_USER: ExecutionStep["result"] = {
  ok: false,
  outcome: "skipped",
  entityId: null,
  entityType: null,
  warnings: [],
  error: "Krok nebyl vybrán k provedení.",
};

/**
 * Označí vybrané kroky jako `confirmed`, ostatní čekající jako `skipped` (6C).
 * Vybrané kroky s chybějícími kritickými poli dostanou `requires_input` místo `confirmed`.
 */
export function applyConfirmationSelection(plan: ExecutionPlan, selectedStepIds: string[]): ExecutionPlan {
  const awaitingIds = new Set(
    plan.steps.filter((s) => s.status === "requires_confirmation").map((s) => s.stepId),
  );
  const selected = new Set(selectedStepIds.filter((id) => awaitingIds.has(id)));

  const steps = plan.steps.map((s) => {
    if (s.status !== "requires_confirmation") return s;
    if (selected.has(s.stepId)) return preflightCheckStep(s);
    return { ...s, status: "skipped" as const, result: SKIPPED_BY_USER };
  });

  return { ...plan, status: "executing", steps };
}

export function confirmStep(plan: ExecutionPlan, stepId: string): ExecutionPlan {
  return {
    ...plan,
    steps: plan.steps.map((s) =>
      s.stepId === stepId && s.status === "requires_confirmation"
        ? preflightCheckStep(s)
        : s,
    ),
  };
}

export function skipStep(plan: ExecutionPlan, stepId: string): ExecutionPlan {
  return {
    ...plan,
    steps: plan.steps.map((s) =>
      s.stepId === stepId ? { ...s, status: "skipped" as const } : s,
    ),
  };
}

export function allStepsReady(plan: ExecutionPlan): boolean {
  return plan.steps.every((s) => s.status === "confirmed" || s.status === "skipped");
}

export function getPlanSummary(plan: ExecutionPlan): string {
  if (plan.steps.length === 0) return "Žádné akce k provedení.";
  const lines = plan.steps.map((s, i) => {
    const chip = productDomainChipLabel(s.params.productDomain as string | undefined);
    const domainSuffix = chip ? ` · ${chip}` : "";
    return `${i + 1}. ${s.label}${domainSuffix}`;
  });
  return lines.join("\n");
}
