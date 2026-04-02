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

const INTENT_TO_WRITE_ACTION: Partial<Record<CanonicalIntentType, WriteActionType>> = {
  create_opportunity: "createOpportunity",
  update_opportunity: "updateOpportunity",
  update_client_request: "updateClientRequest",
  create_task: "createTask",
  create_followup: "createFollowUp",
  schedule_meeting: "scheduleCalendarEvent",
  create_note: "createMeetingNote",
  append_note: "appendMeetingNote",
  attach_document: "attachDocumentToClient",
  attach_document_to_opportunity: "attachDocumentToOpportunity",
  classify_document: "classifyDocument",
  request_client_documents: "createMaterialRequest",
  create_client_request: "createClientRequest",
  create_material_request: "createMaterialRequest",
  link_document_to_material_request: "linkDocumentToMaterialRequest",
  prepare_email: "draftEmail",
  draft_portal_message: "draftClientPortalMessage",
  send_portal_message: "sendPortalMessage",
  update_portfolio: "updatePortfolioItem",
  publish_portfolio_item: "publishPortfolioItem",
  create_service_case: "createClientRequest",
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

  return params;
}

function computeMissingFields(
  action: WriteActionType,
  params: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  const required: Record<string, string[]> = {
    createOpportunity: ["contactId"],
    updateOpportunity: ["opportunityId"],
    updateClientRequest: ["opportunityId"],
    createTask: ["contactId"],
    createFollowUp: ["contactId"],
    scheduleCalendarEvent: ["contactId"],
    createMeetingNote: ["contactId"],
    attachDocumentToClient: ["contactId", "documentId"],
    attachDocumentToOpportunity: ["opportunityId", "documentId"],
    classifyDocument: ["documentId"],
    triggerDocumentReview: ["documentId"],
    approveAiContractReview: ["reviewId"],
    applyAiContractReviewToCrm: ["reviewId"],
    linkAiContractReviewToDocuments: ["reviewId"],
    setDocumentVisibleToClient: ["documentId"],
    linkDocumentToMaterialRequest: ["materialRequestId", "documentId"],
    createClientPortalNotification: ["contactId", "portalNotificationTitle"],
    createClientRequest: ["contactId"],
    createMaterialRequest: ["contactId"],
    draftEmail: ["contactId"],
    draftClientPortalMessage: ["contactId"],
    publishPortfolioItem: ["contractId"],
    updatePortfolioItem: ["contractId"],
    createReminder: ["contactId"],
    sendPortalMessage: ["contactId"],
  };

  const fields = required[action] ?? [];
  for (const f of fields) {
    if (!params[f]) missing.push(f);
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
      steps: [],
      status: "completed",
      createdAt: new Date(),
    };
  }

  const actionsToProcess =
    intent.intentType === "multi_action"
      ? intent.requestedActions.filter((a) => !READ_ONLY_INTENTS.has(a))
      : [intent.intentType].filter((a) => !READ_ONLY_INTENTS.has(a));

  for (const actionIntent of actionsToProcess) {
    const writeAction = INTENT_TO_WRITE_ACTION[actionIntent];
    if (!writeAction) continue;

    const params = buildStepParams(intent, resolution, writeAction, session);
    const missing = computeMissingFields(writeAction, params);
    const policy = getConfirmationPolicy(writeAction);

    const step: ExecutionStep = {
      stepId: `step_${randomUUID().slice(0, 8)}`,
      action: writeAction,
      params,
      label: buildStepLabel(writeAction, params),
      requiresConfirmation: policy === "always" || missing.length === 0,
      isReadOnly: false,
      dependsOn: [],
      status: missing.length > 0 ? "requires_confirmation" : "requires_confirmation",
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

  const missingAny = steps.some((s) => computeMissingFields(s.action, s.params).length > 0);

  return {
    planId,
    intentType: intent.intentType,
    productDomain: intent.productDomain,
    contactId: resolution.client?.entityId ?? null,
    opportunityId: resolution.opportunity?.entityId ?? null,
    steps,
    status: missingAny ? "draft" : "awaiting_confirmation",
    createdAt: new Date(),
  };
}

function buildStepLabel(action: WriteActionType, params: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    createOpportunity: "Vytvořit obchod",
    updateOpportunity: "Aktualizovat obchod",
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

  let label = labels[action] ?? action;
  if (params.productDomain) label += ` (${params.productDomain})`;
  return label;
}

export function getStepsAwaitingConfirmation(plan: ExecutionPlan): ExecutionStep[] {
  return plan.steps.filter((s) => s.status === "requires_confirmation");
}

export function confirmAllSteps(plan: ExecutionPlan): ExecutionPlan {
  return {
    ...plan,
    status: "executing",
    steps: plan.steps.map((s) =>
      s.status === "requires_confirmation" ? { ...s, status: "confirmed" as const } : s,
    ),
  };
}

export function confirmStep(plan: ExecutionPlan, stepId: string): ExecutionPlan {
  return {
    ...plan,
    steps: plan.steps.map((s) =>
      s.stepId === stepId && s.status === "requires_confirmation"
        ? { ...s, status: "confirmed" as const }
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
  const lines = plan.steps.map((s, i) => `${i + 1}. ${s.label} [${s.status}]`);
  return lines.join("\n");
}
