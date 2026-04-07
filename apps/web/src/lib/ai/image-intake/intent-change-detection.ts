/**
 * AI Photo / Image Intake — long-thread intent change detection v1 (Phase 6).
 *
 * Analyzes merged thread facts to detect when the client's intent has changed
 * across multiple screenshots. Conservative by default — ambiguity is valid output.
 *
 * Cost: Zero model calls — pure logic over existing merged facts.
 *
 * Detection logic:
 * 1. Identify the "latest actionable" intent (from isLatestSignal facts)
 * 2. Identify "prior" intents from earlier facts (same factKey, isLatestSignal=false)
 * 3. Compare: if latest differs meaningfully from prior → "changed"
 * 4. If prior and latest are complementary → "partially_changed"
 * 5. If no prior context → "stable" (no change detected, single window)
 * 6. If too ambiguous → "ambiguous"
 */

import type {
  MergedThreadFact,
  IntentChangeFinding,
  IntentChangeStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Intent-bearing fact keys (ordered by specificity)
// ---------------------------------------------------------------------------

const INTENT_FACT_KEYS = [
  "what_client_wants",
  "required_follow_up",
  "urgency_signal",
  "what_changed",
  "candidate_reply_intent",
];

const HISTORICAL_CONTEXT_KEYS = [
  "what_client_said",
  "possible_date_mention",
];

// ---------------------------------------------------------------------------
// Change signals
// ---------------------------------------------------------------------------

/** Terms that suggest reschedule / cancellation. */
const CANCEL_OR_RESCHEDULE = /zruš|posun|cancel|reschedul|přesuň|odvolat|stornuj/i;
/** Terms that suggest a new requirement. */
const NEW_REQUIREMENT = /nový požadavek|novinka|změnil|aktuálně|teď|nyní|nová situace/i;
/** Terms that suggest resolution. */
const RESOLVED = /hotovo|splněno|ok děkuji|vyřešeno|done|already|resolved|answered/i;

function detectChangeSignal(
  priorValue: string,
  latestValue: string,
): IntentChangeStatus {
  const priorLow = priorValue.toLowerCase();
  const latestLow = latestValue.toLowerCase();

  // Same or near-same value
  if (priorLow === latestLow) return "stable";
  if (latestLow.includes(priorLow.slice(0, 20)) || priorLow.includes(latestLow.slice(0, 20))) {
    return "stable";
  }

  // Cancellation or rescheduling language
  if (CANCEL_OR_RESCHEDULE.test(latestValue)) return "changed";

  // New requirement language
  if (NEW_REQUIREMENT.test(latestValue)) return "partially_changed";

  // Resolution language — prior may be superseded
  if (RESOLVED.test(latestValue)) return "changed";

  // Urgency downgrade/upgrade
  if (priorLow.includes("high") && latestLow.includes("low")) return "changed";
  if (priorLow.includes("low") && latestLow.includes("high")) return "partially_changed";

  // Cannot determine
  return "ambiguous";
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Analyzes merged thread facts to detect intent changes.
 *
 * Inputs:
 * - orderedFacts: facts from ThreadReconstructionResult (all facts, ordered by isLatestSignal)
 * - hasMultipleAssets: whether there are multiple source assets (needed for context)
 */
export function detectIntentChange(
  mergedFacts: MergedThreadFact[],
  hasMultipleAssets: boolean,
): IntentChangeFinding {
  if (!hasMultipleAssets || mergedFacts.length === 0) {
    return {
      status: "stable",
      currentIntent: null,
      priorIntent: null,
      changeExplanation: null,
      confidence: 1.0,
      priorSuperseded: false,
    };
  }

  // Separate latest-signal facts from historical facts
  const latestFacts = mergedFacts.filter((f) => f.isLatestSignal && INTENT_FACT_KEYS.includes(f.factKey));
  const priorFacts = mergedFacts.filter((f) => !f.isLatestSignal && INTENT_FACT_KEYS.includes(f.factKey));

  if (latestFacts.length === 0) {
    return {
      status: "ambiguous",
      currentIntent: null,
      priorIntent: null,
      changeExplanation: "Nejnovější intent nebyl identifikován — nelze detekovat změnu.",
      confidence: 0.3,
      priorSuperseded: false,
    };
  }

  if (priorFacts.length === 0) {
    // Only latest — stable (no prior to compare)
    const currentIntent = latestFacts.find((f) => f.factKey === "what_client_wants")?.value
      ?? latestFacts[0]?.value;
    return {
      status: "stable",
      currentIntent: currentIntent ? String(currentIntent) : null,
      priorIntent: null,
      changeExplanation: null,
      confidence: 0.85,
      priorSuperseded: false,
    };
  }

  // Compare by factKey
  const statuses: IntentChangeStatus[] = [];
  const changedExplanations: string[] = [];

  for (const key of INTENT_FACT_KEYS) {
    const latest = latestFacts.find((f) => f.factKey === key);
    const prior = priorFacts.find((f) => f.factKey === key);
    if (!latest || !prior) continue;

    const status = detectChangeSignal(String(prior.value), String(latest.value));
    statuses.push(status);

    if (status === "changed") {
      changedExplanations.push(
        `${key}: "${String(prior.value).slice(0, 60)}" → "${String(latest.value).slice(0, 60)}"`,
      );
    } else if (status === "partially_changed") {
      changedExplanations.push(
        `${key}: částečná změna — "${String(latest.value).slice(0, 60)}"`,
      );
    }
  }

  if (statuses.length === 0) {
    return {
      status: "stable",
      currentIntent: String(latestFacts[0]?.value ?? ""),
      priorIntent: String(priorFacts[0]?.value ?? ""),
      changeExplanation: null,
      confidence: 0.7,
      priorSuperseded: false,
    };
  }

  const hasChanged = statuses.includes("changed");
  const hasPartial = statuses.includes("partially_changed");
  const hasAmbiguous = statuses.includes("ambiguous");

  let finalStatus: IntentChangeStatus;
  if (hasChanged) {
    finalStatus = "changed";
  } else if (hasPartial) {
    finalStatus = "partially_changed";
  } else if (hasAmbiguous && statuses.filter((s) => s === "stable").length === 0) {
    finalStatus = "ambiguous";
  } else {
    finalStatus = "stable";
  }

  const currentIntent = latestFacts.find((f) => f.factKey === "what_client_wants")?.value
    ?? latestFacts[0]?.value;
  const priorIntent = priorFacts.find((f) => f.factKey === "what_client_wants")?.value
    ?? priorFacts[0]?.value;

  const confidence = finalStatus === "changed" ? 0.80
    : finalStatus === "partially_changed" ? 0.65
    : finalStatus === "ambiguous" ? 0.35
    : 0.85;

  return {
    status: finalStatus,
    currentIntent: currentIntent ? String(currentIntent) : null,
    priorIntent: priorIntent ? String(priorIntent) : null,
    changeExplanation: changedExplanations.length > 0
      ? changedExplanations.join("; ")
      : null,
    confidence,
    priorSuperseded: finalStatus === "changed",
  };
}

/**
 * Returns a human-readable intent change summary for preview.
 * Returns null when no change detected.
 */
export function buildIntentChangeSummary(finding: IntentChangeFinding): string | null {
  if (finding.status === "stable" || !finding.changeExplanation) return null;

  const statusLabels: Record<IntentChangeFinding["status"], string> = {
    stable: "",
    changed: "Intent se změnil",
    partially_changed: "Intent se částečně změnil",
    ambiguous: "Změna intentu je nejasná",
  };

  return `${statusLabels[finding.status]}: ${finding.changeExplanation.slice(0, 200)}`;
}
