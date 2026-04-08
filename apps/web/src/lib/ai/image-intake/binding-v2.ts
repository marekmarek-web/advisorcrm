/**
 * AI Photo / Image Intake — CRM-aware binding v2 (Phase 3) + v2 case binding (Phase 4).
 *
 * Phase 3 (client binding):
 * - Session priority chain + CRM name lookup
 * - Safe candidate matching, explicit weak_candidate
 *
 * Phase 4 (case/opportunity binding v2):
 * - Active context priority
 * - Client-scoped opportunity lookup when client is known
 * - Conservative: unresolved when evidence is insufficient
 * - Reuses opportunities table via existing db pattern from assistant-entity-resolution
 *
 * Safety rules:
 * - No auto-pick on multiple candidates
 * - No confident case binding without sufficient evidence
 * - CaseBindingStateV2 provides explainable binding states
 */

import { db, opportunities, eq, and, isNull, desc } from "db";
import { searchContactsForAssistant } from "../assistant-contact-search";
import type { AssistantSession } from "../assistant-session";
import type {
  ClientBindingResult,
  CaseBindingResult,
  CaseBindingResultV2,
  ImageIntakeRequest,
  CaseSignalBundle,
} from "./types";

// ---------------------------------------------------------------------------
// Extract explicit client name from accompanying user text
// ---------------------------------------------------------------------------

const CLIENT_NAME_PATTERNS = [
  /(?:ke\s+klientovi|pro\s+klienta|klientovi|klienta|klient)\s+([A-ZÁ-Žá-ž][a-zá-ž]+(?:\s+[A-ZÁ-Žá-ž][a-zá-ž]+){1,2})/i,
  /(?:přiřaď|přiřadit|ulož|uložit|připoj|připojit).*(?:klientovi|klienta|klient)\s+([A-ZÁ-Žá-ž][a-zá-ž]+(?:\s+[A-ZÁ-Žá-ž][a-zá-ž]+){1,2})/i,
];

/**
 * Parses explicit client name from the user's accompanying text.
 * Matches Czech patterns: "ke klientovi Roman Koloburda", "pro klienta Jan Novák", etc.
 * Returns null if no explicit name is found.
 */
export function parseExplicitClientNameFromText(text: string | null): string | null {
  if (!text?.trim()) return null;
  for (const pattern of CLIENT_NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) {
      const name = match[1].trim();
      if (name.length >= MIN_NAME_SIGNAL_LENGTH) return name;
    }
  }
  return null;
}

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
 * Priority: session lock → active session → UI context →
 *           explicit name from user text → CRM name from image → unresolved.
 */
export async function resolveClientBindingV2(
  request: ImageIntakeRequest,
  session: AssistantSession | null,
  nameSignalFromImage: string | null,
  nameSignalFromText?: string | null,
): Promise<ClientBindingResult> {
  // 1. Session-based (always preferred, free)
  const sessionBinding = bindFromSession(session, request);
  if (sessionBinding) return sessionBinding;

  // 2. Explicit client name from user text (stronger than image-derived signal)
  if (nameSignalFromText) {
    const textBinding = await bindFromNameSignal(nameSignalFromText, request.tenantId);
    if (textBinding) {
      // Upgrade single match from weak_candidate to bound_client_confident
      // when the advisor explicitly wrote the name
      if (textBinding.state === "weak_candidate" && textBinding.clientId) {
        return {
          ...textBinding,
          state: "bound_client_confident",
          confidence: CRM_MATCH_CONFIDENCE,
          source: "explicit_user_text",
          warnings: [],
        };
      }
      return { ...textBinding, source: "explicit_user_text" };
    }
  }

  // 3. CRM lookup from image signal (only when no session/text context)
  if (nameSignalFromImage) {
    const crmBinding = await bindFromNameSignal(nameSignalFromImage, request.tenantId);
    if (crmBinding) return crmBinding;
  }

  // 4. Unresolved
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
 * Case/opportunity binding v2 (Phase 4).
 * Priority: active context → client-scoped DB lookup → unresolved.
 *
 * Reuses opportunities table (same pattern as assistant-entity-resolution).
 * Conservative: weak/multiple candidates do NOT produce confident binding.
 */
export async function resolveCaseBindingV2(
  request: ImageIntakeRequest,
  session: AssistantSession | null,
  resolvedClientId: string | null,
): Promise<CaseBindingResultV2> {
  // 1. Active session opportunity (highest confidence)
  const sessionOpportunityId = (session as any)?.lockedOpportunityId ?? null;
  if (sessionOpportunityId) {
    return {
      state: "bound_case_from_active_context",
      caseId: sessionOpportunityId,
      caseLabel: null,
      confidence: 0.95,
      candidates: [],
      source: "active_context",
      warnings: [],
    };
  }

  // 2. UI context from request
  if (request.activeOpportunityId) {
    return {
      state: "bound_case_from_active_context",
      caseId: request.activeOpportunityId,
      caseLabel: null,
      confidence: 0.80,
      candidates: [],
      source: "active_context",
      warnings: [],
    };
  }

  // 3. Client-scoped opportunity lookup (Phase 4)
  if (resolvedClientId) {
    return lookupOpportunitiesForClient(resolvedClientId, request.tenantId);
  }

  // 4. Unresolved
  return {
    state: "unresolved_case",
    caseId: null,
    caseLabel: null,
    confidence: 0.0,
    candidates: [],
    source: "none",
    warnings: ["Case nebyl identifikován — bez aktivního kontextu nelze bezpečně navázat."],
  };
}

async function lookupOpportunitiesForClient(
  clientId: string,
  tenantId: string,
): Promise<CaseBindingResultV2> {
  try {
    const rows = await db
      .select({ id: opportunities.id, title: opportunities.title })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenantId, tenantId),
          eq(opportunities.contactId, clientId),
          isNull(opportunities.archivedAt),
        ),
      )
      .orderBy(desc(opportunities.updatedAt))
      .limit(5);

    if (rows.length === 0) {
      return {
        state: "unresolved_case",
        caseId: null,
        caseLabel: null,
        confidence: 0.0,
        candidates: [],
        source: "client_scoped_lookup",
        warnings: ["Klient nemá žádné aktivní příležitosti/cases."],
      };
    }

    if (rows.length === 1 && rows[0]) {
      return {
        state: "bound_case_from_strong_lookup",
        caseId: rows[0].id,
        caseLabel: rows[0].title,
        confidence: 0.70,
        candidates: [{ id: rows[0].id, label: rows[0].title, score: 0.70 }],
        source: "client_scoped_lookup",
        warnings: ["Case byl odvozený jako jediný kandidát ke klientovi — potvrzení doporučeno."],
      };
    }

    // Multiple candidates — no auto-pick
    return {
      state: "multiple_case_candidates",
      caseId: null,
      caseLabel: null,
      confidence: 0.0,
      candidates: rows.map((r) => ({ id: r.id, label: r.title, score: 0.5 })),
      source: "client_scoped_lookup",
      warnings: [`Nalezeno ${rows.length} příležitostí ke klientovi — poradce musí vybrat správný case.`],
    };
  } catch {
    return {
      state: "unresolved_case",
      caseId: null,
      caseLabel: null,
      confidence: 0.0,
      candidates: [],
      source: "none",
      warnings: ["Lookup příležitostí selhal — case zůstává nevyřešený."],
    };
  }
}

// ---------------------------------------------------------------------------
// Phase 6: Signal-aware case binding hints integration
// ---------------------------------------------------------------------------

/**
 * Extends case/opportunity binding v2 with case signal hints (Phase 6).
 *
 * Priority chain:
 * 1. Active context (unchanged — absolute priority)
 * 2. CRM DB lookup (unchanged)
 * 3. Image-derived case signals as tie-breaker / scoring boost (Phase 6 NEW)
 *    → signals can downgrade multiple_case_candidates to weak_case_candidate
 *      if one candidate title matches a strong product/institution signal
 *    → signals NEVER create new binding on their own
 *    → active context always wins
 *
 * Safety: signalBundle.bindingAssistOnly = true enforced in case-signal-extraction.ts
 */
export async function resolveCaseBindingWithSignals(
  request: ImageIntakeRequest,
  session: AssistantSession | null,
  resolvedClientId: string | null,
  signalBundle: CaseSignalBundle | null,
): Promise<CaseBindingResultV2> {
  // Run standard binding first
  const baseResult = await resolveCaseBindingV2(request, session, resolvedClientId);

  // If we have a confident or active-context result, signals don't override
  if (
    baseResult.state === "bound_case_from_active_context" ||
    baseResult.state === "bound_case_from_strong_lookup"
  ) {
    return baseResult;
  }

  // No signal bundle or no signals — return base result
  if (!signalBundle || signalBundle.signals.length === 0 || signalBundle.overallStrength === "none") {
    return baseResult;
  }

  // Only attempt signal-assisted scoring for multiple_case_candidates
  if (baseResult.state !== "multiple_case_candidates" || baseResult.candidates.length === 0) {
    return baseResult;
  }

  // Score candidates against extracted signals
  const scoredCandidates = scoreOpportunityCandidatesWithSignals(
    baseResult.candidates,
    signalBundle,
  );

  if (!scoredCandidates) return baseResult;

  const best = scoredCandidates[0]!;
  const secondBest = scoredCandidates[1];

  // Only help if best candidate has a meaningful signal-based advantage
  const threshold = signalBundle.overallStrength === "strong" ? 0.25 : 0.40;
  const advantage = secondBest ? best.score - secondBest.score : 1.0;

  if (advantage < threshold) {
    // Signals didn't discriminate well → keep multiple_case_candidates
    return {
      ...baseResult,
      warnings: [
        ...baseResult.warnings,
        "Case signály z obrázku nepomohly rozlišit mezi kandidáty — poradce musí vybrat.",
      ],
    };
  }

  // Signal-boosted weak candidate
  return {
    state: "weak_case_candidate",
    caseId: best.id,
    caseLabel: best.label,
    confidence: Math.min(0.55, best.score), // cap at 0.55 — never confident from signals alone
    candidates: scoredCandidates,
    source: "client_scoped_lookup",
    warnings: [
      `Case byl odvozen pomocí signálů z obrázku (${signalBundle.overallStrength} strength) — potvrzení nutné.`,
      "Signály jsou binding assist only — nebylo provedeno automatické přiřazení.",
    ],
  };
}

type ScoredCandidate = { id: string; label: string; score: number };

function scoreOpportunityCandidatesWithSignals(
  candidates: Array<{ id: string; label: string; score: number }>,
  signalBundle: CaseSignalBundle,
): ScoredCandidate[] | null {
  if (candidates.length === 0) return null;

  const scored: ScoredCandidate[] = candidates.map((c) => {
    let score = c.score;
    const labelLower = c.label.toLowerCase();

    for (const signal of signalBundle.signals) {
      const normLower = (signal.normalizedValue ?? signal.rawValue).toLowerCase().slice(0, 50);
      if (normLower && labelLower.includes(normLower.slice(0, 15))) {
        // Title contains signal text → boost
        const boost = signal.strength === "strong" ? 0.25 : signal.strength === "moderate" ? 0.15 : 0.08;
        score = Math.min(1.0, score + boost);
      }
    }
    return { id: c.id, label: c.label, score };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Backward-compatible adapter: maps CaseBindingResultV2 → legacy CaseBindingResult.
 * Used by parts of the code that still expect the v1 shape.
 */
export function toCaseBindingResult(v2: CaseBindingResultV2): CaseBindingResult {
  const stateMap: Record<CaseBindingResultV2["state"], CaseBindingResult["state"]> = {
    bound_case_from_active_context: "bound_case_confident",
    bound_case_from_strong_lookup: "bound_case_confident",
    weak_case_candidate: "insufficient_binding",
    multiple_case_candidates: "multiple_candidates",
    unresolved_case: "insufficient_binding",
  };
  return {
    state: stateMap[v2.state],
    caseId: v2.caseId,
    caseLabel: v2.caseLabel,
    confidence: v2.confidence,
    candidates: v2.candidates,
    source: v2.source === "active_context" ? "session_context" :
            v2.source === "client_scoped_lookup" ? "crm_match" : "none",
  };
}
