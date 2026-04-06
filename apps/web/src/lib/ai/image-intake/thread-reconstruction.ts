/**
 * AI Photo / Image Intake — long-thread conversation reconstruction v1 (Phase 5).
 *
 * Reconstructs the probable story of a multi-screenshot communication thread:
 * - Orders related screenshots chronologically (heuristic: upload order, filename hints)
 * - Deduplicates overlapping content
 * - Merges extracted facts from multiple assets into one thread fact summary
 * - Identifies the "latest actionable signal" in the thread
 * - Returns ambiguity when reconstruction is uncertain
 *
 * Cost rules:
 * - NO additional model calls — pure logic over existing extraction results
 * - Reuses stitching result + per-asset ExtractedFactBundle maps
 * - Only produces richer output if group has ≥2 non-duplicate assets
 * - Uncertain threads → partial_thread or ambiguous_thread, not fabricated certainty
 */

import type {
  NormalizedImageAsset,
  ExtractedFactBundle,
  FactType,
  MergedThreadFact,
  ThreadAssetOrder,
  ThreadReconstructionOutcome,
  ThreadReconstructionResult,
  StitchedAssetGroup,
} from "./types";

// ---------------------------------------------------------------------------
// Asset ordering (heuristic — upload order as proxy for chronological order)
// ---------------------------------------------------------------------------

/**
 * Determines probable chronological order from asset metadata.
 * Uses: uploadedAt, originalFilename (numeric suffix), assetId order.
 * Conservative: if ordering is uncertain, preserve original order.
 */
function orderAssetsChronologically(
  assets: NormalizedImageAsset[],
): { ordered: NormalizedImageAsset[]; wasReordered: boolean } {
  if (assets.length <= 1) return { ordered: assets, wasReordered: false };

  // Try to sort by uploadedAt if available
  const allHaveDates = assets.every((a) => a.uploadedAt != null);
  if (allHaveDates) {
    const sorted = [...assets].sort(
      (a, b) => new Date(a.uploadedAt!).getTime() - new Date(b.uploadedAt!).getTime(),
    );
    const wasReordered = sorted.some((a, i) => a.assetId !== assets[i]?.assetId);
    return { ordered: sorted, wasReordered };
  }

  // Fallback: numeric suffix in filename (screenshot_001.jpg → screenshot_002.jpg)
  const numericSuffixRe = /(\d+)\.[a-zA-Z]+$/;
  const allHaveSuffix = assets.every((a) => numericSuffixRe.test(a.originalFilename ?? ""));
  if (allHaveSuffix) {
    const sorted = [...assets].sort((a, b) => {
      const numA = parseInt(numericSuffixRe.exec(a.originalFilename!)![1]!, 10);
      const numB = parseInt(numericSuffixRe.exec(b.originalFilename!)![1]!, 10);
      return numA - numB;
    });
    const wasReordered = sorted.some((a, i) => a.assetId !== assets[i]?.assetId);
    return { ordered: sorted, wasReordered };
  }

  // Preserve original upload order
  return { ordered: assets, wasReordered: false };
}

// ---------------------------------------------------------------------------
// Fact merging — combine per-asset facts into thread-level summary
// ---------------------------------------------------------------------------

const LATEST_SIGNAL_FACT_KEYS = new Set([
  "what_client_wants",
  "required_follow_up",
  "urgency_signal",
  "what_changed",
  "candidate_reply_intent",
]);

const HISTORICAL_FACT_KEYS = new Set([
  "what_client_said",
  "possible_dates",
  "evidence_snippet",
]);

/**
 * Merges facts from multiple per-asset ExtractedFactBundles into thread-level facts.
 * Strategy:
 * - For each unique factKey, combine values from all assets
 * - Mark as isLatestSignal if from the last ordered asset
 * - Deduplicate identical values from overlapping screenshots
 */
function mergeThreadFacts(
  orderedAssetIds: string[],
  factBundles: Map<string, ExtractedFactBundle>,
): MergedThreadFact[] {
  if (orderedAssetIds.length === 0) return [];

  const lastAssetId = orderedAssetIds[orderedAssetIds.length - 1]!;

  // Collect all facts keyed by factKey
  const byKey = new Map<string, {
    values: Map<string, { assetIds: string[]; confidence: number; inferred: boolean }>;
    factType: FactType;
  }>();

  for (const assetId of orderedAssetIds) {
    const bundle = factBundles.get(assetId);
    if (!bundle) continue;

    for (const fact of bundle.facts) {
      const valueStr = String(fact.value ?? "").trim();
      if (!valueStr) continue;

      if (!byKey.has(fact.factKey)) {
        byKey.set(fact.factKey, { values: new Map(), factType: fact.factType });
      }
      const entry = byKey.get(fact.factKey)!;

      if (!entry.values.has(valueStr)) {
        entry.values.set(valueStr, { assetIds: [], confidence: fact.confidence, inferred: fact.observedVsInferred === "inferred" });
      }
      const valEntry = entry.values.get(valueStr)!;
      if (!valEntry.assetIds.includes(assetId)) {
        valEntry.assetIds.push(assetId);
      }
      // Take max confidence across assets
      valEntry.confidence = Math.max(valEntry.confidence, fact.confidence);
    }
  }

  const merged: MergedThreadFact[] = [];

  for (const [factKey, { values, factType }] of byKey.entries()) {
    for (const [value, { assetIds, confidence, inferred }] of values.entries()) {
      const isFromLastAsset = assetIds.includes(lastAssetId);
      const isLatestSignal = isFromLastAsset && LATEST_SIGNAL_FACT_KEYS.has(factKey);

      merged.push({
        factKey,
        factType,
        value,
        sourceAssetIds: assetIds,
        confidence,
        observedVsInferred: inferred ? "inferred" : "observed",
        isLatestSignal,
      });
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Latest actionable signal extraction
// ---------------------------------------------------------------------------

function extractLatestActionableSignal(mergedFacts: MergedThreadFact[]): string | null {
  // Prioritize: urgency > required_follow_up > what_client_wants > what_changed
  const priority = [
    "urgency_signal",
    "required_follow_up",
    "what_client_wants",
    "what_changed",
    "candidate_reply_intent",
  ];

  for (const key of priority) {
    const fact = mergedFacts.find(
      (f) => f.factKey === key && f.isLatestSignal && f.value,
    );
    if (fact) return String(fact.value);
  }

  // Fallback: any latest signal
  const anyLatest = mergedFacts.find((f) => f.isLatestSignal && f.value);
  return anyLatest ? String(anyLatest.value) : null;
}

// ---------------------------------------------------------------------------
// Reconstruction outcome and confidence
// ---------------------------------------------------------------------------

function determineOutcome(
  assetCount: number,
  dupCount: number,
  factCount: number,
  hasLatestSignal: boolean,
  wasReordered: boolean,
): { outcome: ThreadReconstructionOutcome; confidence: number; rationale: string } {
  if (assetCount === 1) {
    return {
      outcome: "single_asset",
      confidence: 1.0,
      rationale: "Pouze jeden asset — rekonstrukce vlákna není potřeba.",
    };
  }

  const usableCount = assetCount - dupCount;

  if (usableCount <= 0) {
    return {
      outcome: "duplicate_only",
      confidence: 0.9,
      rationale: "Všechny assety jsou duplikáty — zpracován pouze primární.",
    };
  }

  if (factCount === 0) {
    return {
      outcome: "ambiguous_thread",
      confidence: 0.3,
      rationale: "Z assetů nebyly extrahovány žádné fakty — vlákno nelze rekonstruovat.",
    };
  }

  if (usableCount >= 2 && factCount >= 2 && hasLatestSignal) {
    const confidence = wasReordered ? 0.70 : 0.85;
    return {
      outcome: "full_thread",
      confidence,
      rationale: `${usableCount} assetů, ${factCount} faktů, nejnovější signál identifikován.${wasReordered ? " Pořadí bylo heuristicky seřazeno." : ""}`,
    };
  }

  return {
    outcome: "partial_thread",
    confidence: 0.55,
    rationale: `${usableCount} assetů, ${factCount} faktů, ale chybí ${hasLatestSignal ? "dostatek kontextu" : "nejnovější signál"} pro plnou rekonstrukci.`,
  };
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Reconstructs a long-thread conversation from a group of related screenshots.
 *
 * Pure function — no model calls. Takes stitching group + per-asset extraction results.
 *
 * @param group  The stitched group (must be grouped_thread or grouped_related)
 * @param assets All assets (to access metadata for ordering)
 * @param factBundles Per-asset extracted fact bundles (may be empty for assets without extraction)
 */
export function reconstructThread(
  group: StitchedAssetGroup,
  assets: NormalizedImageAsset[],
  factBundles: Map<string, ExtractedFactBundle>,
): ThreadReconstructionResult {
  const groupAssets = group.assetIds
    .map((id) => assets.find((a) => a.assetId === id))
    .filter((a): a is NormalizedImageAsset => a != null);

  // Exclude duplicates from reconstruction
  const usableAssets = groupAssets.filter(
    (a) => !group.duplicateAssetIds.includes(a.assetId),
  );
  const suppressedDuplicateAssetIds = group.duplicateAssetIds;

  if (usableAssets.length === 0) {
    return {
      outcome: "duplicate_only",
      orderedAssets: [],
      mergedFacts: [],
      latestActionableSignal: null,
      unresolvedGaps: ["Všechny assety ve skupině jsou duplikáty."],
      reconstructionConfidence: 0.9,
      reconstructionRationale: "Skupina obsahuje pouze duplikáty.",
      suppressedDuplicateAssetIds,
    };
  }

  const { ordered, wasReordered } = orderAssetsChronologically(usableAssets);
  const orderedAssetIds = ordered.map((a) => a.assetId);

  const mergedFacts = mergeThreadFacts(orderedAssetIds, factBundles);
  const latestActionableSignal = extractLatestActionableSignal(mergedFacts);

  const orderedAssetOrders: ThreadAssetOrder[] = ordered.map((a, i) => ({
    assetId: a.assetId,
    position: i,
    overlapsWithPrevious: i > 0 && group.duplicateAssetIds.includes(a.assetId),
  }));

  const unresolvedGaps: string[] = [];
  if (!latestActionableSignal) {
    unresolvedGaps.push("Nejnovější actionable signál nebyl identifikován.");
  }
  if (mergedFacts.length === 0) {
    unresolvedGaps.push("Žádné fakty nebyly extrahovány z assetů ve skupině.");
  }

  const { outcome, confidence, rationale } = determineOutcome(
    usableAssets.length,
    suppressedDuplicateAssetIds.length,
    mergedFacts.length,
    latestActionableSignal !== null,
    wasReordered,
  );

  return {
    outcome,
    orderedAssets: orderedAssetOrders,
    mergedFacts,
    latestActionableSignal,
    unresolvedGaps,
    reconstructionConfidence: confidence,
    reconstructionRationale: rationale,
    suppressedDuplicateAssetIds,
  };
}

/**
 * Builds a human-readable thread summary for preview.
 */
export function buildThreadSummaryLines(result: ThreadReconstructionResult, limit = 5): string[] {
  const lines: string[] = [];

  if (result.outcome === "single_asset" || result.outcome === "duplicate_only") {
    return [];
  }

  if (result.latestActionableSignal) {
    lines.push(`Nejnovější požadavek: ${result.latestActionableSignal}`);
  }

  const latestFacts = result.mergedFacts
    .filter((f) => f.isLatestSignal && f.value)
    .slice(0, limit - lines.length);

  for (const fact of latestFacts) {
    if (lines.length >= limit) break;
    lines.push(`${fact.factKey}: ${String(fact.value)}`);
  }

  if (result.unresolvedGaps.length > 0) {
    lines.push(`Chybí: ${result.unresolvedGaps[0]}`);
  }

  return lines;
}
