/**
 * AI Photo / Image Intake — batch multimodal optimization for grouped threads (Phase 5).
 *
 * Decides the most cost-effective multimodal processing strategy for a group of related assets:
 *   - per_asset: process each asset with its own multimodal call
 *   - combined_pass: one multimodal call representing the group
 *   - skip_all: no multimodal call needed (dead ends / already classified)
 *
 * Cost rules:
 * - MAX_COMBINED_PASS_ASSETS: do not combine more than 3 assets into one call
 *   (prompt size + false-merge risk increases beyond this)
 * - Combined pass only when ALL of:
 *   1. All assets in group are same type (grouped_thread or grouped_related)
 *   2. No existing multimodal result cached for any asset
 *   3. Group size ≤ MAX_COMBINED_PASS_ASSETS
 *   4. No supporting/reference/unusable assets in group
 * - Per-asset when combined conditions fail but multimodal is needed
 * - Skip when assets already have extraction results or are dead-ends
 * - Max 2 vision calls per grouped thread batch (hard limit)
 *
 * No new model types — reuses existing runCombinedMultimodalPass interface.
 */

import type {
  NormalizedImageAsset,
  InputClassificationResult,
  MultimodalCombinedPassResult,
  StitchedAssetGroup,
  BatchMultimodalDecision,
  BatchMultimodalStrategy,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum assets to combine into a single multimodal pass. */
const MAX_COMBINED_PASS_ASSETS = 3;
/** Hard cap on vision calls per grouped-thread batch. */
const MAX_VISION_CALLS_PER_BATCH = 2;

const NEVER_MULTIMODAL_TYPES = new Set([
  "general_unusable_image",
  "supporting_reference_image",
]);

// ---------------------------------------------------------------------------
// Decision logic
// ---------------------------------------------------------------------------

/**
 * Determines optimal multimodal strategy for a stitched group.
 *
 * @param group         Stitched group from stitching v1
 * @param classifications Per-asset classifier results (v1, text-only)
 * @param existingResults Per-asset multimodal results already computed
 * @param multimodalEnabled Whether multimodal flag is ON for this user
 */
export function decideBatchMultimodalStrategy(
  group: StitchedAssetGroup,
  assets: NormalizedImageAsset[],
  classifications: Map<string, InputClassificationResult | null>,
  existingResults: Map<string, MultimodalCombinedPassResult | null>,
  multimodalEnabled: boolean,
): BatchMultimodalDecision {
  const primaryIds = group.assetIds.filter(
    (id) => !group.duplicateAssetIds.includes(id),
  );
  const duplicateIds = group.duplicateAssetIds;

  // Fast path: multimodal disabled
  if (!multimodalEnabled) {
    return {
      strategy: "skip_all",
      combinedPassAssetIds: [],
      perAssetIds: [],
      skipAssetIds: primaryIds,
      costRationale: "Multimodal pass je vypnutý — všechny assety přeskočeny.",
      estimatedVisionCalls: 0,
    };
  }

  // Separate primary assets into: already processed, dead-ends, candidates
  const alreadyProcessed: string[] = [];
  const deadEnds: string[] = [];
  const candidates: string[] = [];

  for (const assetId of primaryIds) {
    const existingResult = existingResults.get(assetId);
    if (existingResult != null) {
      alreadyProcessed.push(assetId);
      continue;
    }

    const classification = classifications.get(assetId);
    if (!classification || NEVER_MULTIMODAL_TYPES.has(classification.inputType)) {
      deadEnds.push(assetId);
      continue;
    }

    const asset = assets.find((a) => a.assetId === assetId);
    if (!asset?.storageUrl) {
      deadEnds.push(assetId);
      continue;
    }

    candidates.push(assetId);
  }

  const skipAssetIds = [...alreadyProcessed, ...deadEnds, ...duplicateIds];

  if (candidates.length === 0) {
    return {
      strategy: "skip_all",
      combinedPassAssetIds: [],
      perAssetIds: [],
      skipAssetIds,
      costRationale: "Žádné nové assety ke zpracování (vše přeskočeno nebo již zpracováno).",
      estimatedVisionCalls: 0,
    };
  }

  // Check combined pass eligibility
  const allSameType = checkAllSameType(candidates, classifications);
  const groupEligibleForCombined =
    allSameType &&
    candidates.length >= 2 &&
    candidates.length <= MAX_COMBINED_PASS_ASSETS &&
    (group.decision === "grouped_thread" || group.decision === "grouped_related");

  if (groupEligibleForCombined) {
    return {
      strategy: "combined_pass",
      combinedPassAssetIds: candidates,
      perAssetIds: [],
      skipAssetIds,
      costRationale: `${candidates.length} assetů stejného typu — sloučeno do jednoho combined multimodal passu.`,
      estimatedVisionCalls: 1,
    };
  }

  // Per-asset, but capped at MAX_VISION_CALLS_PER_BATCH
  const cappedCandidates = candidates.slice(0, MAX_VISION_CALLS_PER_BATCH);
  const overCap = candidates.slice(MAX_VISION_CALLS_PER_BATCH);

  return {
    strategy: cappedCandidates.length > 0 ? "per_asset" : "skip_all",
    combinedPassAssetIds: [],
    perAssetIds: cappedCandidates,
    skipAssetIds: [...skipAssetIds, ...overCap],
    costRationale:
      cappedCandidates.length < candidates.length
        ? `Omezeno na ${MAX_VISION_CALLS_PER_BATCH} vision callů (batch limit). ${overCap.length} assetů přeskočeno.`
        : `${cappedCandidates.length} asset${cappedCandidates.length > 1 ? "y" : ""} zpracován${cappedCandidates.length > 1 ? "y" : ""} individuálně.`,
    estimatedVisionCalls: cappedCandidates.length,
  };
}

function checkAllSameType(
  assetIds: string[],
  classifications: Map<string, InputClassificationResult | null>,
): boolean {
  if (assetIds.length === 0) return false;
  const types = new Set(
    assetIds.map((id) => classifications.get(id)?.inputType).filter(Boolean),
  );
  return types.size === 1;
}

/**
 * Returns a cost summary string for audit/trace.
 */
export function buildBatchCostSummary(decision: BatchMultimodalDecision): string {
  return (
    `Batch strategy: ${decision.strategy} | ` +
    `vision calls: ${decision.estimatedVisionCalls} | ` +
    decision.costRationale
  );
}
