/**
 * Deterministic priority scoring for assistant items (Plan 5A.3).
 * Pure functions, no LLM dependency.
 */

import type { UrgentItem, UrgentItemSeverity } from "./dashboard-types";

export type PriorityItem = UrgentItem & {
  blockedReasons?: string[];
  qualityGateStatus?: string;
  dueHint?: string;
  entityType?: string;
  lastActivityAt?: string | null;
};

const SCORE_OVERDUE_TASK = 0.3;
const SCORE_REVIEW_PENDING_OLD = 0.25;
const SCORE_PAYMENT_BLOCKED = 0.2;
const SCORE_LOW_CONFIDENCE_APPLY = 0.15;
const SCORE_CLIENT_NO_FOLLOWUP = 0.1;
const SCORE_EXPIRATION_NEAR = 0.1;

export type ScoringInput = {
  isOverdueTask?: boolean;
  isReviewPendingOld?: boolean;
  isPaymentBlocked?: boolean;
  isLowConfidenceApply?: boolean;
  isClientWithoutFollowup?: boolean;
  isExpirationApproaching?: boolean;
};

export function scorePriorityItem(input: ScoringInput): number {
  let score = 0;
  if (input.isOverdueTask) score += SCORE_OVERDUE_TASK;
  if (input.isReviewPendingOld) score += SCORE_REVIEW_PENDING_OLD;
  if (input.isPaymentBlocked) score += SCORE_PAYMENT_BLOCKED;
  if (input.isLowConfidenceApply) score += SCORE_LOW_CONFIDENCE_APPLY;
  if (input.isClientWithoutFollowup) score += SCORE_CLIENT_NO_FOLLOWUP;
  if (input.isExpirationApproaching) score += SCORE_EXPIRATION_NEAR;
  return Math.min(score, 1);
}

export function scoreToSeverity(score: number): UrgentItemSeverity {
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

export function enrichUrgentItem(item: UrgentItem, extra?: Partial<PriorityItem>): PriorityItem {
  return {
    ...item,
    entityType: extra?.entityType ?? item.type,
    blockedReasons: extra?.blockedReasons,
    qualityGateStatus: extra?.qualityGateStatus,
    dueHint: extra?.dueHint,
    lastActivityAt: extra?.lastActivityAt,
  };
}

export function buildDeterministicSummary(items: PriorityItem[]): string {
  if (items.length === 0) return "Žádné prioritní položky.";

  const highCount = items.filter((i) => i.severity === "high").length;
  const mediumCount = items.filter((i) => i.severity === "medium").length;
  const blocked = items.filter((i) => (i.blockedReasons?.length ?? 0) > 0);

  const parts: string[] = [];
  if (highCount > 0) parts.push(`${highCount} urgentních`);
  if (mediumCount > 0) parts.push(`${mediumCount} středně důležitých`);
  if (blocked.length > 0) parts.push(`${blocked.length} blokovaných`);

  const topItem = items[0];
  const topAction = topItem.recommendedAction ?? topItem.description;

  return `Máte ${parts.join(", ")} položek. Interní priorita: ${topAction}.`;
}
