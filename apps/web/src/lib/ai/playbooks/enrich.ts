import type { CanonicalIntent } from "../assistant-domain-model";
import { ASSISTANT_PLAYBOOKS } from "./definitions";
import type { AssistantPlaybook } from "./types";

export function pickPlaybookForIntent(intent: CanonicalIntent, message: string): AssistantPlaybook | null {
  const m = message.toLowerCase();
  for (const pb of ASSISTANT_PLAYBOOKS) {
    if (pb.matches(m, intent)) return pb;
  }
  return null;
}

/**
 * Doplní productDomain a missingFields nápovědy podle playbooku (bez LLM).
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
  return next;
}

export function getPlaybookGuidanceLines(intent: CanonicalIntent, message: string): string[] {
  const pb = pickPlaybookForIntent(intent, message);
  if (!pb) return [];
  return [`Playbook: ${pb.label}`, ...pb.nextStepSuggestions.map((s) => `• ${s}`)];
}
