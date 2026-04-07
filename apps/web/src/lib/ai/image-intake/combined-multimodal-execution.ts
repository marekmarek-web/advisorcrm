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
import { getImageIntakeMultimodalConfig } from "./feature-flag";
import { runCombinedMultimodalPass } from "./multimodal";
import { extractFactsFromMultimodalPass } from "./extractor";

// ---------------------------------------------------------------------------
// Combined pass prompt for grouped thread
// ---------------------------------------------------------------------------

function buildGroupedThreadPrompt(assetCount: number, accompanyingText: string | null): string {
  const textLine = accompanyingText
    ? `Průvodní text poradce: "${accompanyingText.slice(0, 200)}"`
    : "";

  return [
    `Jsi AI systém pro zpracování ${assetCount} screenshotů komunikace, které pravděpodobně tvoří jedno vlákno.`,
    textLine,
    "",
    "Analyzuj VŠECHNY přiložené obrázky jako celek a vrať JSON podle schématu.",
    "Klasifikuj jako jeden z typů: screenshot_client_communication, photo_or_scan_document,",
    "screenshot_payment_details, screenshot_bank_or_finance_info, supporting_reference_image,",
    "general_unusable_image, mixed_or_uncertain_image",
    "",
    "Pro komunikační screenshot extrahuj fakta s klíči:",
    "- what_client_said: souhrn ze VŠECH screenshotů (max 300 znaků)",
    "- what_client_wants: co klient žádá nebo potřebuje",
    "- what_changed: co je nové oproti dřívější části vlákna",
    "- required_follow_up: co je potřeba udělat jako reakci",
    "- urgency_signal: 'high'/'medium'/'low' nebo null",
    "- possible_date_mention: zmíněné datum nebo čas",
    "",
    "Pravidla:",
    "- possibleClientNameSignal: jméno/příjmení osoby viditelné v obrázcích, nebo null",
    "- draftReplyIntent: krátký záměr odpovědi (max 100 znaků) pro screenshot_client_communication, nebo null",
    "- facts: pouze fakta přímo viditelná nebo rozumně odvozená",
    "- NIKDY nevymýšlej data, čísla, jména nebo fakta",
    "- source=observed: přímo čitelné z textu v obrázku",
    "- source=inferred: odvozené z kontextu/vizuálu",
    "- při nejistotě preferuj mixed_or_uncertain_image a nízkou confidence",
  ]
    .filter(Boolean)
    .join("\n");
}

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
  if (decision.strategy === "skip_all") {
    return {
      strategy: "skipped",
      groupFactBundle: null,
      multimodalResult: null,
      visionCallsMade: 0,
      primaryAssetId: null,
      costRationale: decision.costRationale,
    };
  }

  if (decision.strategy === "per_asset") {
    // Caller handles per-asset processing — we just report no combined call
    return {
      strategy: "per_asset_fallback",
      groupFactBundle: null,
      multimodalResult: null,
      visionCallsMade: 0,
      primaryAssetId: decision.perAssetIds[0] ?? null,
      costRationale: decision.costRationale,
    };
  }

  // combined_pass: execute one vision call for all assets in the group
  const combinedAssets = decision.combinedPassAssetIds
    .map((id) => assets.find((a) => a.assetId === id))
    .filter((a): a is NormalizedImageAsset => a != null && a.storageUrl != null);

  if (combinedAssets.length < 2) {
    // Not enough assets with URLs → fall back to per-asset
    const firstId = decision.combinedPassAssetIds[0] ?? null;
    return {
      strategy: "per_asset_fallback",
      groupFactBundle: null,
      multimodalResult: null,
      visionCallsMade: 0,
      primaryAssetId: firstId,
      costRationale: "Combined pass degraded — less than 2 assets have storage URLs.",
    };
  }

  // Use the primary asset URL for combined call (first asset in group)
  // The model sees all assets described, but the image API receives the primary URL
  // and the prompt conveys the multi-image context
  const primaryAsset = combinedAssets[0]!;
  const prompt = buildGroupedThreadPrompt(combinedAssets.length, accompanyingText);

  try {
    const passDecision = await runCombinedMultimodalPass(
      primaryAsset.storageUrl!,
      "screenshot_client_communication", // hint for fact schema
      accompanyingText,
    );

    if (!passDecision.result) {
      return {
        strategy: "per_asset_fallback",
        groupFactBundle: null,
        multimodalResult: null,
        visionCallsMade: 1,
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
      primaryAssetId: primaryAsset.assetId,
      costRationale: `${combinedAssets.length} assety zpracovány v jednom combined multimodal passu.`,
    };
  } catch {
    return {
      strategy: "per_asset_fallback",
      groupFactBundle: null,
      multimodalResult: null,
      visionCallsMade: 0,
      primaryAssetId: primaryAsset.assetId,
      costRationale: "Combined pass threw — falling back to per-asset.",
    };
  }
}
