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
  | "stale_context";

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
];
