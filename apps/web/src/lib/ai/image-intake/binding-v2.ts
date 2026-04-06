/**
 * AI Photo / Image Intake — CRM-aware client binding v2 (Phase 3).
 *
 * Extends binding v1 (session → UI context) with:
 * - CRM name lookup when a name signal exists from multimodal pass
 * - Safe candidate matching (no auto-pick on conflict)
 * - Explicit weak_candidate state when only one low-confidence match
 *
 * Safety rules:
 * - Active session context always has priority
 * - No confident write-ready path from CRM lookup alone without confirmation
 * - Multiple candidates → multiple_candidates state (no silent auto-pick)
 * - Single match with low confidence → weak_candidate (not confident)
 * - Only searchContactsForAssistant is used (existing, tested utility)
 */

import { searchContactsForAssistant } from "../assistant-contact-search";
import type { AssistantSession } from "../assistant-session";
import type { ClientBindingResult, CaseBindingResult, ImageIntakeRequest } from "./types";

// ---------------------------------------------------------------------------
// CRM lookup thresholds
// ---------------------------------------------------------------------------

/** Name signal must be at least this long to attempt CRM lookup. */
const MIN_NAME_SIGNAL_LENGTH = 3;

/** Single match with fewer results than this is treated as confident. */
const MAX_RESULTS_FOR_CONFIDENT_SINGLE = 1;

/** Confidence assigned to CRM-matched binding (lower than session). */
const CRM_MATCH_CONFIDENCE = 0.65;
const CRM_WEAK_CONFIDENCE = 0.45;

// ---------------------------------------------------------------------------
// CRM lookup helper
// ---------------------------------------------------------------------------

async function lookupClientByNameSignal(
  tenantId: string,
  nameSignal: string,
): Promise<{ id: string; label: string }[]> {
  if (!nameSignal.trim() || nameSignal.trim().length < MIN_NAME_SIGNAL_LENGTH) return [];

  try {
    const matches = await searchContactsForAssistant(
      tenantId,
      nameSignal.trim(),
      6,
      { match: "name_only" },
    );
    return matches.map((m) => ({ id: m.id, label: m.displayName }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Session-based binding (same as v1, extracted here for clarity)
// ---------------------------------------------------------------------------

function bindFromSession(session: AssistantSession | null, request: ImageIntakeRequest): ClientBindingResult | null {
  if (session?.lockedClientId) {
    return {
      state: "bound_client_confident",
      clientId: session.lockedClientId,
      clientLabel: null,
      confidence: 0.95,
      candidates: [],
      source: "session_context",
      warnings: [],
    };
  }
  if (session?.activeClientId) {
    return {
      state: "bound_client_confident",
      clientId: session.activeClientId,
      clientLabel: null,
      confidence: 0.80,
      candidates: [],
      source: "session_context",
      warnings: [],
    };
  }
  if (request.activeClientId) {
    return {
      state: "bound_client_confident",
      clientId: request.activeClientId,
      clientLabel: null,
      confidence: 0.70,
      candidates: [],
      source: "ui_context",
      warnings: [],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// CRM-based binding from name signal
// ---------------------------------------------------------------------------

async function bindFromNameSignal(
  nameSignal: string | null,
  tenantId: string,
): Promise<ClientBindingResult | null> {
  if (!nameSignal?.trim()) return null;

  const matches = await lookupClientByNameSignal(tenantId, nameSignal);

  if (matches.length === 0) return null;

  if (matches.length > 1) {
    return {
      state: "multiple_candidates",
      clientId: null,
      clientLabel: null,
      confidence: 0.0,
      candidates: matches.map((m) => ({ id: m.id, label: m.label, score: 0.5 })),
      source: "crm_match",
      warnings: [`Nalezeno ${matches.length} možných klientů pro "${nameSignal}" — je potřeba upřesnění.`],
    };
  }

  // Single match
  const match = matches[0];
  return {
    state: "weak_candidate",
    clientId: match.id,
    clientLabel: match.label,
    confidence: CRM_WEAK_CONFIDENCE,
    candidates: [{ id: match.id, label: match.label, score: CRM_WEAK_CONFIDENCE }],
    source: "crm_match",
    warnings: [
      `Klient "${match.label}" nalezen přes jméno z obrázku — vazba není jistá, nelze přikládat bez potvrzení.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Main binding v2 entrypoint
// ---------------------------------------------------------------------------

/**
 * Resolves client binding v2.
 * Priority: session lock → active session → UI context → CRM name lookup → unresolved.
 */
export async function resolveClientBindingV2(
  request: ImageIntakeRequest,
  session: AssistantSession | null,
  nameSignalFromImage: string | null,
): Promise<ClientBindingResult> {
  // 1. Session-based (always preferred, free)
  const sessionBinding = bindFromSession(session, request);
  if (sessionBinding) return sessionBinding;

  // 2. CRM lookup from image signal (only when no session context)
  if (nameSignalFromImage) {
    const crmBinding = await bindFromNameSignal(nameSignalFromImage, request.tenantId);
    if (crmBinding) return crmBinding;
  }

  // 3. Unresolved
  return {
    state: "insufficient_binding",
    clientId: null,
    clientLabel: null,
    confidence: 0.0,
    candidates: [],
    source: "none",
    warnings: ["Klient nebyl identifikován — write-ready plán nelze vytvořit bez aktivního klientského kontextu."],
  };
}

/**
 * Case/opportunity binding v2.
 * Priority chain same as v1 — CRM case lookup deferred to Phase 4.
 */
export function resolveCaseBindingV2(
  request: ImageIntakeRequest,
  session: AssistantSession | null,
): CaseBindingResult {
  const caseId =
    (session as any)?.lockedOpportunityId ??
    request.activeOpportunityId ??
    null;

  if (caseId) {
    return {
      state: "bound_case_confident",
      caseId,
      caseLabel: null,
      confidence: 0.80,
      candidates: [],
      source: (session as any)?.lockedOpportunityId ? "session_context" : "ui_context",
    };
  }

  return {
    state: "insufficient_binding",
    caseId: null,
    caseLabel: null,
    confidence: 0.0,
    candidates: [],
    source: "none",
  };
}
