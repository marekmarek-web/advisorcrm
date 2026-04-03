/**
 * Maps execution-layer write actions back to canonical intent action types.
 * Used by golden/replay tests when building `requestedActions` from `expectedActions`.
 *
 * Inverse of INTENT_TO_WRITE_ACTION in assistant-execution-plan.ts (for mapped intents).
 */

import type { CanonicalIntent, CanonicalIntentType, WriteActionType } from "../assistant-domain-model";

/** Stable UUID for eval tests that need a resolved opportunity in the plan builder. */
export const TEST_OPPORTUNITY_ID = "cccc3333-cccc-cccc-cccc-cccccccccccc";

/** Golden scenario ids that need slot data merged into the synthetic intent. */
export const GOLDEN_SCENARIO_IDS = {
  scheduleSlotted: "ww-schedule-calendar-slotted",
  updateOpportunitySlotted: "ww-update-opportunity-slotted",
  sendPortalSlotted: "ww-send-portal-message-slotted",
} as const;

/**
 * Full WriteActionType → intent action. `updateTask` has no canonical intent yet; tests fall back via helper.
 */
export const WRITE_ACTION_TO_INTENT_ACTION: Record<WriteActionType, CanonicalIntentType> = {
  createOpportunity: "create_opportunity",
  updateOpportunity: "update_opportunity",
  createServiceCase: "create_service_case",
  createTask: "create_task",
  /** Unused when callers use `writeActionToIntentAction` (always falls back). */
  updateTask: "general_chat",
  createFollowUp: "create_followup",
  scheduleCalendarEvent: "schedule_meeting",
  createMeetingNote: "create_note",
  appendMeetingNote: "append_note",
  attachDocumentToClient: "attach_document",
  attachDocumentToOpportunity: "attach_document_to_opportunity",
  classifyDocument: "classify_document",
  triggerDocumentReview: "request_document_review",
  approveAiContractReview: "approve_ai_contract_review",
  applyAiContractReviewToCrm: "apply_ai_review_to_crm",
  linkAiContractReviewToDocuments: "link_ai_review_to_document_vault",
  setDocumentVisibleToClient: "show_document_to_client",
  linkDocumentToMaterialRequest: "link_document_to_material_request",
  createClientPortalNotification: "notify_client_portal",
  createClientRequest: "create_client_request",
  updateClientRequest: "update_client_request",
  createMaterialRequest: "create_material_request",
  createInternalNote: "create_internal_note",
  publishPortfolioItem: "publish_portfolio_item",
  updatePortfolioItem: "update_portfolio",
  createReminder: "create_reminder",
  draftEmail: "prepare_email",
  draftClientPortalMessage: "draft_portal_message",
  sendPortalMessage: "send_portal_message",
};

export function writeActionToIntentAction(
  action: WriteActionType,
  fallback: CanonicalIntentType,
): CanonicalIntentType {
  if (action === "updateTask") return fallback;
  return WRITE_ACTION_TO_INTENT_ACTION[action];
}

export function requestedActionsFromExpectedWriteActions(
  actions: WriteActionType[],
  fallback: CanonicalIntentType,
): CanonicalIntentType[] {
  return actions.map(a => writeActionToIntentAction(a, fallback));
}

/** Merge temporal / facts for golden scenarios that assert awaiting_confirmation with filled slots. */
export function mergeGoldenIntentSlotsForScenario(scenarioId: string, intent: CanonicalIntent): CanonicalIntent {
  if (scenarioId === GOLDEN_SCENARIO_IDS.scheduleSlotted) {
    return {
      ...intent,
      temporalExpressions: [
        { raw: "čtvrtek 14:00", resolved: "2026-05-07T12:00:00.000Z", confidence: 1 },
      ],
    };
  }
  if (scenarioId === GOLDEN_SCENARIO_IDS.sendPortalSlotted) {
    return {
      ...intent,
      extractedFacts: [
        {
          key: "noteContent",
          value: "Smlouva je připravena k podpisu.",
          source: "user_text",
        },
      ],
    };
  }
  return intent;
}

export function goldenScenarioNeedsTestOpportunity(scenarioId: string): boolean {
  return scenarioId === GOLDEN_SCENARIO_IDS.updateOpportunitySlotted;
}
