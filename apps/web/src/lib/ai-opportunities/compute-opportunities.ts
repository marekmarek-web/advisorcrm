/**
 * Opportunity engine: run rules, deduplicate, prioritize, select next best action.
 */

import type { OpportunitySignals, AiOpportunity } from "./types";
import type { RuleConfig } from "./opportunity-rules";
import {
  conditionNoAnalysis,
  buildNoAnalysis,
  conditionStaleAnalysis,
  buildStaleAnalysis,
  conditionDraftAnalysis,
  buildDraftAnalysis,
  conditionNoRecentContact,
  buildNoRecentContact,
  conditionContractReviewDue,
  buildContractReviewDueAll,
  conditionCoverageGap,
  buildCoverageGapAll,
  conditionProductsNoFollowUp,
  buildProductsNoFollowUp,
  conditionStaleOpportunity,
  buildStaleOpportunityAll,
  conditionScheduleMeeting,
  buildScheduleMeeting,
  conditionAnalysisGaps,
  buildAnalysisGaps,
  conditionAskReferral,
  buildAskReferral,
} from "./opportunity-rules";

/** Priority score 0–100: higher = more urgent. */
function scoreOpportunity(o: AiOpportunity): number {
  const priorityScore = (6 - o.priority) * 15; // 1->75, 2->60, 3->45, ...
  let urgency = 0;
  if (o.type === "no_analysis" || o.type === "no_recent_contact") urgency = 25;
  else if (o.type === "stale_opportunity" || o.type === "contract_review_due") urgency = 20;
  else if (o.type === "draft_analysis" || o.type === "stale_analysis") urgency = 15;
  else if (o.type === "coverage_gap" || o.type === "analysis_gaps") urgency = 10;
  else if (o.type === "ask_referral") urgency = 12;
  const confidenceBonus = o.confidence === "high" ? 5 : o.confidence === "medium" ? 2 : 0;
  return Math.min(100, priorityScore + urgency + confidenceBonus);
}

/** Deduplicate by (type, entity key). Keep first (higher score). */
function deduplicateOpportunities(opportunities: AiOpportunity[]): AiOpportunity[] {
  const seen = new Map<string, AiOpportunity>();
  const scores = new Map<string, number>();
  for (const o of opportunities) {
    const key = `${o.type}_${o.entityIds?.analysisId ?? o.entityIds?.opportunityId ?? o.entityIds?.contractId ?? o.entityIds?.segmentCode ?? o.id}`;
    const score = scoreOpportunity(o);
    if (!seen.has(key) || (scores.get(key)! < score)) {
      seen.set(key, o);
      scores.set(key, score);
    }
  }
  return [...seen.values()];
}

/** Sort by score desc, then by priority asc. */
function sortOpportunities(opportunities: AiOpportunity[]): AiOpportunity[] {
  return [...opportunities].sort((a, b) => {
    const sa = scoreOpportunity(a);
    const sb = scoreOpportunity(b);
    if (sb !== sa) return sb - sa;
    return a.priority - b.priority;
  });
}

export function computeOpportunities(
  signals: OpportunitySignals,
  config: RuleConfig
): AiOpportunity[] {
  const list: AiOpportunity[] = [];

  if (conditionNoAnalysis(signals)) {
    list.push(buildNoAnalysis(signals));
  }
  if (conditionStaleAnalysis(signals, config)) {
    list.push(buildStaleAnalysis(signals, config));
  }
  if (conditionDraftAnalysis(signals)) {
    list.push(buildDraftAnalysis(signals));
  }
  if (conditionNoRecentContact(signals, config)) {
    list.push(buildNoRecentContact(signals, config));
  }
  if (conditionContractReviewDue(signals, config)) {
    list.push(...buildContractReviewDueAll(signals, config));
  }
  if (conditionCoverageGap(signals)) {
    list.push(...buildCoverageGapAll(signals));
  }
  if (conditionProductsNoFollowUp(signals, config)) {
    list.push(buildProductsNoFollowUp(signals, config));
  }
  if (conditionStaleOpportunity(signals, config)) {
    list.push(...buildStaleOpportunityAll(signals, config));
  }
  if (conditionScheduleMeeting(signals)) {
    list.push(buildScheduleMeeting(signals));
  }
  if (conditionAnalysisGaps(signals)) {
    list.push(buildAnalysisGaps(signals));
  }
  if (conditionAskReferral(signals)) {
    list.push(buildAskReferral(signals));
  }

  const deduped = deduplicateOpportunities(list);
  return sortOpportunities(deduped);
}

/** Next best action = top opportunity after sort (already first in sorted list). */
export function selectNextBestAction(opportunities: AiOpportunity[]): AiOpportunity | null {
  return opportunities.length > 0 ? opportunities[0] : null;
}
