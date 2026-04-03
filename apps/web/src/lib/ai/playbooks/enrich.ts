import type { CanonicalIntent, CanonicalIntentType } from "../assistant-domain-model";
import { ASSISTANT_PLAYBOOKS } from "./definitions";
import type { AssistantPlaybook } from "./types";

/** Write intents for which playbook priorityMissingHints are surfaced as advisory hints. */
const PLAYBOOK_HINT_INTENTS = new Set<CanonicalIntentType>([
  "create_opportunity",
  "create_service_case",
  "update_opportunity",
]);

export function pickPlaybookForIntent(intent: CanonicalIntent, message: string): AssistantPlaybook | null {
  const m = message.toLowerCase();
  for (const pb of ASSISTANT_PLAYBOOKS) {
    if (pb.matches(m, intent)) return pb;
  }
  return null;
}

/**
 * Doplní productDomain a uživatelské hints z playbooku (bez LLM).
 * Pro write intenty propaguje priorityMissingHints jako `hint:…` záznamy
 * do userConstraints, aby byly dostupné pro planner a UX vrstvu.
 */
export function enrichCanonicalIntentWithPlaybooks(intent: CanonicalIntent, message: string): CanonicalIntent {
  const pb = pickPlaybookForIntent(intent, message);
  if (!pb) return intent;

  const next: CanonicalIntent = {
    ...intent,
    userConstraints: [...intent.userConstraints],
  };

  if (!next.productDomain && pb.defaultProductDomain) {
    next.productDomain = pb.defaultProductDomain;
  }

  next.userConstraints.push(`playbook:${pb.id}`);

  // Surface domain-specific missing hints for write intents so the advisor
  // sees them even when structural fields are already present.
  if (PLAYBOOK_HINT_INTENTS.has(intent.intentType) && pb.priorityMissingHints.length > 0) {
    const existingFactKeys = new Set(intent.extractedFacts.map((f) => f.key));
    for (const hint of pb.priorityMissingHints) {
      // Only add the hint if there's no extracted fact that looks like it covers the slot.
      const hintKey = hint.split(" ")[0]?.toLowerCase() ?? "";
      const alreadyCovered = existingFactKeys.has(hintKey) || intent.userConstraints.some((c) => c.startsWith(`hint:${hintKey}`));
      if (!alreadyCovered) {
        next.userConstraints.push(`hint:${hint}`);
      }
    }
  }

  return next;
}

export function getPlaybookGuidanceLines(intent: CanonicalIntent, message: string): string[] {
  const pb = pickPlaybookForIntent(intent, message);
  if (!pb) return [];
  return [`Playbook: ${pb.label}`, ...pb.nextStepSuggestions.map((s) => `• ${s}`)];
}
