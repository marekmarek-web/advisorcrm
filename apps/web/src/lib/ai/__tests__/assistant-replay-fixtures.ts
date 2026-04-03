/**
 * Phase 2F: replay fixtures — captured assistant run snapshots
 * derived from real or simulated runs. Each fixture represents
 * a complete assistant lifecycle: intent → resolution → plan → safety → execution.
 */

import type { CanonicalIntent, ExecutionPlan, WriteActionType } from "../assistant-domain-model";
import { emptyCanonicalIntent } from "../assistant-domain-model";
import type { EntityResolutionResult } from "../assistant-entity-resolution";
import type { ContextSafetyVerdict } from "../assistant-context-safety";

export type ReplayFixture = {
  id: string;
  name: string;
  category: "happy_path" | "red_flag" | "edge_case" | "regression";
  redFlag?: ReplayRedFlag;
  input: {
    userMessage: string;
    lockedClientId?: string;
    activeClientId?: string;
    activeReviewId?: string;
    lockedDocumentId?: string;
  };
  expectedIntent: Partial<CanonicalIntent>;
  resolution: EntityResolutionResult;
  expectedSafety: {
    safe: boolean;
    requiresConfirmation?: boolean;
    blockedReason?: string | null;
  };
  expectedPlan: {
    minSteps: number;
    maxSteps: number;
    expectedActions: WriteActionType[];
    forbiddenActions?: WriteActionType[];
    expectedStatus?: ExecutionPlan["status"];
  };
  expectedExecution?: {
    allSucceeded?: boolean;
    hasPartialFailure?: boolean;
    idempotentHits?: number;
  };
};

export type ReplayRedFlag =
  | "wrong_client_write"
  | "fake_confirmation"
  | "duplicate_create"
  | "broken_context_lock"
  | "incomplete_partial_failure"
  | "ambiguous_entity_write"
  | "stale_context"
  | "wrong_document_attach"
  | "missing_required_fields"
  | "multi_action_order_violation";

const CONTACT_A = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONTACT_B = "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const DOC_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const REVIEW_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

function res(clientId?: string, opts: { ambiguous?: boolean; confidence?: number; alternatives?: { id: string; label: string }[] } = {}): EntityResolutionResult {
  return {
    client: clientId ? {
      entityType: "contact",
      entityId: clientId,
      displayLabel: "Testovací Klient",
      confidence: opts.confidence ?? 1.0,
      ambiguous: opts.ambiguous ?? false,
      alternatives: opts.alternatives ?? [],
    } : null,
    opportunity: null,
    document: null,
    contract: null,
    warnings: [],
  };
}

export const replayFixtures: ReplayFixture[] = [
  // ─── HAPPY PATH ──────────────────────────────────────────────
  {
    id: "hp-create-opportunity",
    name: "Happy: založení obchodu s potvrzeným klientem",
    category: "happy_path",
    input: { userMessage: "Založ obchod na hypotéku pro Jana Nováka", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_opportunity", productDomain: "hypo" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createOpportunity"], expectedStatus: "awaiting_confirmation" },
  },
  {
    id: "hp-create-task",
    name: "Happy: vytvoření úkolu s locked kontextem",
    category: "happy_path",
    input: { userMessage: "Naplánuj follow-up na pátek", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_task" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["createTask"] },
  },
  {
    id: "hp-portal-notification",
    name: "Happy: portálová notifikace",
    category: "happy_path",
    input: { userMessage: "Upozorni klienta, že je připravená smlouva", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "notify_client_portal" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["createClientPortalNotification"] },
  },

  // ─── RED FLAG: wrong_client_write ────────────────────────────
  {
    id: "rf-wrong-client-no-resolution",
    name: "Red flag: zápis bez resolved klienta",
    category: "red_flag",
    redFlag: "wrong_client_write",
    input: { userMessage: "Založ obchod na hypotéku" },
    expectedIntent: { intentType: "create_opportunity", productDomain: "hypo" },
    resolution: res(),
    expectedSafety: { safe: false, blockedReason: "NO_CLIENT_FOR_WRITE" },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createOpportunity"] },
  },
  {
    id: "rf-wrong-client-cross-entity",
    name: "Red flag: cross-client zápis (locked A, resolved B)",
    category: "red_flag",
    redFlag: "wrong_client_write",
    input: { userMessage: "Založ úkol pro Dvořákovou", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_task" },
    resolution: res(CONTACT_B),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["createTask"] },
  },

  // ─── RED FLAG: fake_confirmation ─────────────────────────────
  {
    id: "rf-fake-confirm-unconfirmed-steps",
    name: "Red flag: plán musí mít stav awaiting_confirmation, ne completed",
    category: "red_flag",
    redFlag: "fake_confirmation",
    input: { userMessage: "Pošli upozornění do portálu klienta", lockedClientId: CONTACT_A },
    expectedIntent: {
      intentType: "notify_client_portal",
      extractedFacts: [
        { key: "portalNotificationTitle", value: "Nový návrh", source: "user_text" as const },
        { key: "noteContent", value: "Váš návrh je připraven.", source: "user_text" as const },
      ],
    },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["createClientPortalNotification"], expectedStatus: "awaiting_confirmation" },
  },
  {
    id: "rf-fake-confirm-high-risk",
    name: "Red flag: high-risk akce musí vždy vyžadovat potvrzení",
    category: "red_flag",
    redFlag: "fake_confirmation",
    input: { userMessage: "Schval AI kontrolu smlouvy a aplikuj do CRM", lockedClientId: CONTACT_A, activeReviewId: REVIEW_ID },
    expectedIntent: { intentType: "multi_action" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 2, maxSteps: 3, expectedActions: ["approveAiContractReview", "applyAiContractReviewToCrm"], expectedStatus: "awaiting_confirmation" },
  },

  // ─── RED FLAG: duplicate_create ──────────────────────────────
  {
    id: "rf-duplicate-create-same-params",
    name: "Red flag: dvě identické akce musí mít stejný fingerprint",
    category: "red_flag",
    redFlag: "duplicate_create",
    input: { userMessage: "Založ obchod na hypotéku pro Jana Nováka", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_opportunity", productDomain: "hypo" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createOpportunity"] },
    expectedExecution: { idempotentHits: 0 },
  },

  // ─── RED FLAG: broken_context_lock ───────────────────────────
  {
    id: "rf-broken-lock-ambiguous",
    name: "Red flag: nejednoznačný klient blokuje zápis",
    category: "red_flag",
    redFlag: "broken_context_lock",
    input: { userMessage: "Založ obchod pro Nováka" },
    expectedIntent: { intentType: "create_opportunity" },
    resolution: res(CONTACT_A, { ambiguous: true, alternatives: [{ id: CONTACT_B, label: "Jana Nováková" }] }),
    expectedSafety: { safe: false, blockedReason: "AMBIGUOUS_CLIENT" },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createOpportunity"] },
  },

  // ─── RED FLAG: incomplete_partial_failure ─────────────────────
  {
    id: "rf-partial-failure-reporting",
    name: "Red flag: partial failure musí reportovat per-step výsledek",
    category: "red_flag",
    redFlag: "incomplete_partial_failure",
    input: { userMessage: "Vytvoř úkol a nastav připomínku", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "multi_action" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 2, maxSteps: 3, expectedActions: ["createTask", "createReminder"] },
    expectedExecution: { hasPartialFailure: true },
  },

  // ─── EDGE CASE ───────────────────────────────────────────────
  {
    id: "ec-low-confidence-client",
    name: "Edge: nízká jistota identifikace klienta",
    category: "edge_case",
    input: { userMessage: "Založ obchod pro Nováka" },
    expectedIntent: { intentType: "create_opportunity" },
    resolution: res(CONTACT_A, { confidence: 0.4 }),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createOpportunity"] },
  },
  {
    id: "ec-document-review-with-session",
    name: "Edge: document review přebírá IDs z session",
    category: "edge_case",
    input: { userMessage: "Aplikuj AI review do CRM", lockedClientId: CONTACT_A, activeReviewId: REVIEW_ID, lockedDocumentId: DOC_ID },
    expectedIntent: { intentType: "apply_ai_review_to_crm" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["applyAiContractReviewToCrm"] },
  },

  // ─── PHASE 3C: HYPO SAFETY EDGE CASES ────────────────────────
  {
    id: "ec-hypo-bank-no-mortgage-context",
    name: "Hypo edge: banka bez hypotečního kontextu nezakládá hypo domain",
    category: "edge_case",
    input: { userMessage: "Chci DPS u KB banky pro Nováka", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_opportunity", productDomain: "dps" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createOpportunity"], forbiddenActions: [] },
  },
  {
    id: "ec-hypo-service-case-vyroci",
    name: "Hypo edge: servisní případ k výročí hypotéky → createServiceCase s productDomain hypo",
    category: "edge_case",
    // Note: harness doesn't populate noteContent/subject; plan will be draft (missing description).
    // requiresConfirmation is therefore false at plan-safety level.
    input: { userMessage: "Výročí hypotéky u Nováka — založ servisní případ", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_service_case", productDomain: "hypo" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createServiceCase"] },
  },
  {
    id: "ec-hypo-service-case-no-client",
    name: "Hypo edge: servisní případ hypo bez klienta musí být blokován",
    category: "edge_case",
    input: { userMessage: "Založ servisní případ na refinancování hypotéky" },
    expectedIntent: { intentType: "create_service_case", productDomain: "hypo" },
    resolution: res(),
    expectedSafety: { safe: false, blockedReason: "NO_CLIENT_FOR_WRITE" },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createServiceCase"] },
  },
  {
    id: "ec-hypo-no-client",
    name: "Hypo edge: hypo write bez resolved klienta musí být blokován",
    category: "edge_case",
    input: { userMessage: "Založ hypotéku 3M Kč LTV 80%" },
    expectedIntent: { intentType: "create_opportunity", productDomain: "hypo" },
    resolution: res(),
    expectedSafety: { safe: false, blockedReason: "NO_CLIENT_FOR_WRITE" },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createOpportunity"] },
  },
  {
    id: "hp-hypo-create-with-amount",
    name: "Happy hypo: obchod s částkou a klientem → awaiting_confirmation",
    category: "happy_path",
    input: {
      userMessage: "Založ hypotéku 4 000 000 Kč pro Jana Nováka",
      lockedClientId: CONTACT_A,
    },
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "hypo",
      extractedFacts: [{ key: "amount", value: 4000000, source: "user_text" as const }],
    },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createOpportunity"],
      expectedStatus: "awaiting_confirmation",
    },
  },
  {
    id: "ec-hypo-cross-client-write",
    name: "Hypo edge: cross-client zápis pro hypo vyžaduje potvrzení",
    category: "edge_case",
    input: { userMessage: "Založ hypotéku pro Dvořákovou", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_opportunity", productDomain: "hypo" },
    resolution: res(CONTACT_B),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createOpportunity"] },
  },
  {
    id: "ec-hypo-ambiguous-client",
    name: "Hypo edge: nejednoznačný klient blokuje hypo zápis",
    category: "edge_case",
    input: { userMessage: "Založ hypotéku pro Nováka" },
    expectedIntent: { intentType: "create_opportunity", productDomain: "hypo" },
    resolution: res(CONTACT_A, { ambiguous: true, alternatives: [{ id: CONTACT_B, label: "Jana Nováková" }] }),
    expectedSafety: { safe: false, blockedReason: "AMBIGUOUS_CLIENT" },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createOpportunity"] },
  },

  // ═══ PHASE 3I: NEW RED FLAGS ═══════════════════════════════

  // ─── RED FLAG: wrong_document_attach ──────────────────────────
  {
    id: "rf-wrong-doc-attach-no-client",
    name: "Red flag: přiřazení dokumentu bez klienta",
    category: "red_flag",
    redFlag: "wrong_document_attach",
    input: { userMessage: "Přiřaď dokument ke klientovi", lockedDocumentId: DOC_ID },
    expectedIntent: { intentType: "attach_document" },
    resolution: res(),
    expectedSafety: { safe: false, blockedReason: "NO_CLIENT_FOR_WRITE" },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["attachDocumentToClient"] },
  },
  {
    id: "rf-wrong-doc-attach-cross-client",
    name: "Red flag: přiřazení dokumentu k jinému klientovi než v locku",
    category: "red_flag",
    redFlag: "wrong_document_attach",
    input: { userMessage: "Přiřaď dokument ke klientovi Dvořákové", lockedClientId: CONTACT_A, lockedDocumentId: DOC_ID },
    expectedIntent: { intentType: "attach_document" },
    resolution: res(CONTACT_B),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["attachDocumentToClient"] },
  },

  // ─── RED FLAG: missing_required_fields ────────────────────────
  {
    id: "rf-missing-fields-calendar-no-date",
    name: "Red flag: schůzka bez data zůstane draft",
    category: "red_flag",
    redFlag: "missing_required_fields",
    input: { userMessage: "Naplánuj schůzku s Novákem", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "schedule_meeting" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["scheduleCalendarEvent"], expectedStatus: "draft" },
  },
  {
    id: "rf-missing-fields-service-case-no-description",
    name: "Red flag: servisní případ bez popisu → draft",
    category: "red_flag",
    redFlag: "missing_required_fields",
    input: { userMessage: "Založ servisní případ pro Nováka", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_service_case" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createServiceCase"], expectedStatus: "draft" },
  },

  // ─── RED FLAG: multi_action_order_violation ───────────────────
  {
    id: "rf-multi-order-task-before-reminder",
    name: "Red flag: multi-action — task musí předcházet reminder",
    category: "red_flag",
    redFlag: "multi_action_order_violation",
    input: { userMessage: "Vytvoř úkol a nastav připomínku", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "multi_action" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 2, maxSteps: 3, expectedActions: ["createTask", "createReminder"] },
    expectedExecution: { allSucceeded: true },
  },

  // ─── PHASE 3I: ADDITIONAL HAPPY PATHS ─────────────────────────
  {
    id: "hp-create-followup",
    name: "Happy: vytvoření follow-up",
    category: "happy_path",
    input: { userMessage: "Nastav follow-up za týden ohledně hypotéky", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_followup", productDomain: "hypo" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createFollowUp"], expectedStatus: "awaiting_confirmation" },
  },
  {
    id: "hp-schedule-calendar",
    name: "Happy: naplánování schůzky",
    category: "happy_path",
    input: { userMessage: "Naplánuj schůzku na čtvrtek 14:00", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "schedule_meeting" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["scheduleCalendarEvent"], expectedStatus: "awaiting_confirmation" },
  },
  {
    id: "hp-create-meeting-note",
    name: "Happy: poznámka ze schůzky",
    category: "happy_path",
    input: { userMessage: "Zapiš poznámku: probrali jsme refinancování", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_note" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["createMeetingNote"] },
  },
  {
    id: "hp-create-internal-note",
    name: "Happy: interní poznámka",
    category: "happy_path",
    input: { userMessage: "Zapiš si interní poznámku: klient projevil zájem o DIP", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_internal_note" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["createInternalNote"] },
  },
  {
    id: "hp-document-attach",
    name: "Happy: přiřazení dokumentu ke klientovi",
    category: "happy_path",
    input: { userMessage: "Přiřaď dokument ke klientovi", lockedClientId: CONTACT_A, lockedDocumentId: DOC_ID },
    expectedIntent: { intentType: "attach_document" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true },
    expectedPlan: { minSteps: 1, maxSteps: 1, expectedActions: ["attachDocumentToClient"] },
  },
  {
    id: "hp-client-request",
    name: "Happy: vytvoření klientského požadavku",
    category: "happy_path",
    input: { userMessage: "Vytvoř požadavek na změnu kontaktních údajů", lockedClientId: CONTACT_A },
    expectedIntent: { intentType: "create_client_request" },
    resolution: res(CONTACT_A),
    expectedSafety: { safe: true, requiresConfirmation: true },
    expectedPlan: { minSteps: 1, maxSteps: 2, expectedActions: ["createClientRequest"] },
  },
];
