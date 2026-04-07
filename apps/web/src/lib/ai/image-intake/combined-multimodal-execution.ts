/**
 * AI Photo / Image Intake — combined multimodal pass execution v1 (Phase 6).
 *
 * Executes a grouped multimodal pass when batch decision says combined_pass.
 * Sends multiple image URLs to the vision model in a single call, representing
 * a grouped thread of related screenshots.
 *
 * Cost rules:
 * - Only called when BatchMultimodalDecision.strategy === "combined_pass"
 * - Hard cap MAX_COMBINED_PASS_ASSETS = 3 (same as batch decision)
 * - Reuses COMBINED_PASS_SCHEMA from multimodal.ts
 * - Result is mapped to the same MultimodalCombinedPassResult shape
 * - Per-asset fallback always available
 * - Gated by isImageIntakeCombinedMultimodalEnabledForUser()
 *
 * No new model schema — reuses existing runCombinedMultimodalPass interface.
 */

import type {
  NormalizedImageAsset,
  MultimodalCombinedPassResult,
  BatchMultimodalDecision,
  ExtractedFactBundle,
} from "./types";
import { runMultiImageCombinedPass } from "./multimodal";
import { extractFactsFromMultimodalPass } from "./extractor";
import { getImageIntakeConfig } from "./image-intake-config";

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------

export type CombinedMultimodalExecutionResult = {
  strategy: "combined_pass" | "per_asset_fallback" | "skipped";
  /** Merged fact bundle for the entire group. */
  groupFactBundle: ExtractedFactBundle | null;
  /** The raw multimodal result (for classification upgrade). */
  multimodalResult: MultimodalCombinedPassResult | null;
  /** Number of vision calls actually made. */
  visionCallsMade: number;
  /** Number of images sent in combined pass (Phase 7: multi-image). */
  imagesSentInPass: number;
  /** Asset IDs sent in combined pass. */
  assetIdsSent: string[];
  /** Primary asset ID this result is attributed to. */
  primaryAssetId: string | null;
  costRationale: string;
};

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Executes combined multimodal pass when batch decision allows it.
 *
 * Strategy execution:
 * - combined_pass: one vision call for the group
 * - per_asset: falls through to standard per-asset path (returns null result)
 * - skip_all: immediate skip
 *
 * @param decision    Batch multimodal decision from decideBatchMultimodalStrategy
 * @param assets      All assets (to get storageUrls)
 * @param accompanyingText Free text from advisor
 */
export async function executeBatchMultimodalStrategy(
  decision: BatchMultimodalDecision,
  assets: NormalizedImageAsset[],
  accompanyingText: string | null,
): Promise<CombinedMultimodalExecutionResult> {
  const config = getImageIntakeConfig();

  if (decision.strategy === "skip_all") {
    return {
      strategy: "skipped",
      groupFactBundle: null,
      multimodalResult: null,
      visionCallsMade: 0,
      imagesSentInPass: 0,
      assetIdsSent: [],
      primaryAssetId: null,
      costRationale: decision.costRationale,
    };
  }

  if (decision.strategy === "per_asset") {
    return {
      strategy: "per_asset_fallback",
      groupFactBundle: null,
      multimodalResult: null,
      visionCallsMade: 0,
      imagesSentInPass: 0,
      assetIdsSent: [],
      primaryAssetId: decision.perAssetIds[0] ?? null,
      costRationale: decision.costRationale,
    };
  }

  // combined_pass: Phase 7 — use multi-image path
  const combinedAssets = decision.combinedPassAssetIds
    .map((id) => assets.find((a) => a.assetId === id))
    .filter((a): a is NormalizedImageAsset => a != null && a.storageUrl != null)
    .slice(0, config.combinedPassMaxImages);

  if (combinedAssets.length < 2) {
    const firstId = decision.combinedPassAssetIds[0] ?? null;
    return {
      strategy: "per_asset_fallback",
      groupFactBundle: null,
      multimodalResult: null,
      visionCallsMade: 0,
      imagesSentInPass: 0,
      assetIdsSent: [],
      primaryAssetId: firstId,
      costRationale: "Combined pass degraded — less than 2 assets have storage URLs.",
    };
  }

  const primaryAsset = combinedAssets[0]!;
  const imageUrls = combinedAssets.map((a) => a.storageUrl!);

  try {
    // Phase 7: use runMultiImageCombinedPass to send all images in one call
    const passDecision = await runMultiImageCombinedPass(
      imageUrls,
      "screenshot_client_communication",
      accompanyingText,
      config.combinedPassMaxImages,
    );

    if (!passDecision.result || passDecision.imageCount === 0) {
      return {
        strategy: "per_asset_fallback",
        groupFactBundle: null,
        multimodalResult: null,
        visionCallsMade: 1,
        imagesSentInPass: 0,
        assetIdsSent: [],
        primaryAssetId: primaryAsset.assetId,
        costRationale: "Combined pass produced no result — falling back.",
      };
    }

    const groupFactBundle = extractFactsFromMultimodalPass(passDecision.result, primaryAsset.assetId);

    return {
      strategy: "combined_pass",
      groupFactBundle,
      multimodalResult: passDecision.result,
      visionCallsMade: 1,
      imagesSentInPass: passDecision.imageCount,
      assetIdsSent: combinedAssets.slice(0, passDecision.imageCount).map((a) => a.assetId),
      primaryAssetId: primaryAsset.assetId,
      costRationale: `${passDecision.imageCount} image(s) zpracovány v jednom multi-image combined passu.`,
    };
  } catch {
    return {
      strategy: "per_asset_fallback",
      groupFactBundle: null,
      multimodalResult: null,
      visionCallsMade: 0,
      imagesSentInPass: 0,
      assetIdsSent: [],
      primaryAssetId: primaryAsset.assetId,
      costRationale: "Combined pass threw — falling back to per-asset.",
    };
  }
}
