/**
 * AI Photo / Image Intake — optional intent-change model assist v1 (Phase 7).
 *
 * Escalation path for ambiguous intent change detection.
 * Only called when:
 * 1. Heuristic detectIntentChange() returns status === "ambiguous"
 * 2. Feature flag IMAGE_INTAKE_INTENT_ASSIST_ENABLED is true
 * 3. Thread has multiple related assets (grouped_thread)
 * 4. Confidence < intentAssistThreshold from config
 *
 * Calls ONE model pass with a focused prompt: prior intent summary vs latest facts.
 * Uses existing COMBINED_PASS_SCHEMA shape for consistency (no new schema).
 *
 * Cost guard:
 * - Max 1 assist call per eligible thread (enforced by caller)
 * - Short prompt, focused only on intent disambiguation
 * - Not used for stable/clear-change cases (wasted cost)
 * - Returns ambiguity if model confidence is still low
 */

import { createResponseStructured } from "@/lib/openai";
import type { IntentChangeFinding, MergedThreadFact } from "./types";
import { getImageIntakeConfig } from "./image-intake-config";

// ---------------------------------------------------------------------------
// Schema for model assist
// ---------------------------------------------------------------------------

const INTENT_ASSIST_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["stable", "changed", "partially_changed", "ambiguous"],
      description: "Detected intent change status.",
    },
    currentIntent: {
      type: ["string", "null"],
      description: "The latest actionable intent.",
    },
    priorIntent: {
      type: ["string", "null"],
      description: "The prior intent that may be superseded.",
    },
    priorSuperseded: {
      type: "boolean",
      description: "Whether the prior intent is now obsolete.",
    },
    changeExplanation: {
      type: ["string", "null"],
      description: "Brief explanation of the change.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Confidence in the determination (0-1).",
    },
  },
  required: ["status", "priorSuperseded", "confidence"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildIntentAssistPrompt(
  priorFacts: MergedThreadFact[],
  currentFacts: MergedThreadFact[],
): string {
  const priorLines = priorFacts
    .slice(0, 5)
    .map((f) => `  ${f.factKey}: ${String(f.value).slice(0, 100)}`)
    .join("\n");

  const currentLines = currentFacts
    .slice(0, 5)
    .map((f) => `  ${f.factKey}: ${String(f.value).slice(0, 100)}`)
    .join("\n");

  return [
    "Jsi AI asistent pro analýzu záměru klienta v komunikaci s finančním poradcem.",
    "Porovnej DŘÍVĚJŠÍ a AKTUÁLNÍ stav vlákna a urči, zda se záměr klienta změnil.",
    "",
    "DŘÍVĚJŠÍ STAV (z předchozích screenshotů):",
    priorLines || "  (žádné relevantní informace)",
    "",
    "AKTUÁLNÍ STAV (z posledních screenshotů):",
    currentLines || "  (žádné relevantní informace)",
    "",
    "Pravidla:",
    "- changed: záměr se jasně změnil (zrušení, nový požadavek, jiné téma)",
    "- partially_changed: část záměru se změnila, část zůstává",
    "- stable: záměr je konzistentní nebo navazuje",
    "- ambiguous: nelze s jistotou určit",
    "- priorSuperseded: true jen pro 'changed'",
    "- confidence: 0.0-1.0, buď konzervativní",
    "- Pokud není dostatek informací, vrať ambiguous s nízkou confidence",
    "- NIKDY nevymýšlej detaily, které nejsou ve vstupních datech",
    "Vrať odpověď jako JSON.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Raw output type
// ---------------------------------------------------------------------------

type RawIntentAssistOutput = {
  status?: string;
  currentIntent?: string | null;
  priorIntent?: string | null;
  priorSuperseded?: boolean;
  changeExplanation?: string | null;
  confidence?: number;
};

function normalizeAssistOutput(raw: RawIntentAssistOutput): IntentChangeFinding {
  const validStatuses = ["stable", "changed", "partially_changed", "ambiguous"] as const;
  const status = validStatuses.includes(raw.status as typeof validStatuses[number])
    ? (raw.status as IntentChangeFinding["status"])
    : "ambiguous";

  return {
    status,
    currentIntent: raw.currentIntent ?? null,
    priorIntent: raw.priorIntent ?? null,
    priorSuperseded: raw.priorSuperseded === true && status === "changed",
    changeExplanation: raw.changeExplanation ?? null,
    confidence: typeof raw.confidence === "number"
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.4,
  };
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Optional model assist for ambiguous intent change cases.
 *
 * Returns null when:
 * - Feature flag disabled
 * - Finding is not ambiguous (no escalation needed)
 * - Facts are insufficient for meaningful assist
 *
 * Uses `createResponseStructured` (text-only, no image — facts already extracted).
 */
export async function runIntentChangeAssist(
  finding: IntentChangeFinding,
  mergedFacts: MergedThreadFact[],
): Promise<IntentChangeFinding | null> {
  const config = getImageIntakeConfig();

  // Only escalate when config-enabled and finding is genuinely ambiguous
  if (!config.intentAssistEnabled) {
    return null;
  }

  if (finding.status !== "ambiguous" || finding.confidence > config.intentAssistThreshold) {
    return null;
  }

  const priorFacts = mergedFacts.filter((f) => !f.isLatestSignal);
  const currentFacts = mergedFacts.filter((f) => f.isLatestSignal);

  // Insufficient data — no point calling model
  if (priorFacts.length === 0 || currentFacts.length === 0) {
    return null;
  }

  const prompt = buildIntentAssistPrompt(priorFacts, currentFacts);

  try {
    const response = await createResponseStructured<RawIntentAssistOutput>(
      prompt,
      INTENT_ASSIST_SCHEMA as Record<string, unknown>,
      {
        routing: { category: "default" },
        schemaName: "intent_change_assist",
      },
    );

    if (!response.parsed) return null;

    const normalized = normalizeAssistOutput(response.parsed);

    // If model is still ambiguous with low confidence, return original finding
    if (normalized.status === "ambiguous" && normalized.confidence < 0.4) {
      return finding;
    }

    return normalized;
  } catch {
    return null;
  }
}
