/**
 * AI Photo / Image Intake — multi-day / cross-session thread reconstruction v1 (Phase 6).
 *
 * Maintains a lightweight in-process artifact store for cross-session thread context.
 * When a user uploads new screenshots, checks if prior session artifacts exist for
 * the same client and reconstructs a combined view.
 *
 * Scope limits:
 * - In-process store only (no DB writes — avoids heavy redesign)
 * - Max ARTIFACT_TTL_MS = 72h (3 days)
 * - Max 20 stored artifacts per tenant+client pair
 * - Conservative: ambiguity is always valid output
 * - No aggressive merge without sufficient confidence
 *
 * Cost: Zero model calls — pure state combination from existing fact bundles.
 */

import type {
  MergedThreadFact,
  CrossSessionThreadArtifact,
  CrossSessionReconstructionResult,
  FactType,
} from "./types";

// ---------------------------------------------------------------------------
// In-process artifact store (bounded by TTL and count)
// ---------------------------------------------------------------------------

const ARTIFACT_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
const MAX_ARTIFACTS_PER_CLIENT = 20;

const artifactStore = new Map<string, CrossSessionThreadArtifact[]>();

function storeKey(tenantId: string, clientId: string): string {
  return `${tenantId}:${clientId}`;
}

function pruneExpired(artifacts: CrossSessionThreadArtifact[]): CrossSessionThreadArtifact[] {
  const cutoff = Date.now() - ARTIFACT_TTL_MS;
  return artifacts.filter((a) => new Date(a.lastUpdatedAt).getTime() > cutoff);
}

// ---------------------------------------------------------------------------
// Write artifact (called after successful intake)
// ---------------------------------------------------------------------------

/**
 * Saves or updates a cross-session thread artifact for a client.
 * Call after successful processing to enable future cross-session reconstruction.
 */
export function persistThreadArtifact(
  tenantId: string,
  userId: string,
  clientId: string,
  sessionId: string,
  mergedFacts: MergedThreadFact[],
  latestSignal: string | null,
): void {
  if (!clientId || mergedFacts.length === 0) return;

  const key = storeKey(tenantId, clientId);
  let existing = pruneExpired(artifactStore.get(key) ?? []);

  // Find existing artifact for this session (update) or create new
  const existingIdx = existing.findIndex((a) => a.sourceSessionIds.includes(sessionId));

  const artifact: CrossSessionThreadArtifact = {
    artifactId: `${tenantId}:${clientId}:${Date.now()}`,
    tenantId,
    userId,
    clientId,
    lastUpdatedAt: new Date().toISOString(),
    priorMergedFacts: mergedFacts,
    priorLatestSignal: latestSignal,
    sourceSessionIds: [sessionId],
  };

  if (existingIdx >= 0) {
    existing[existingIdx] = artifact;
  } else {
    existing = [artifact, ...existing].slice(0, MAX_ARTIFACTS_PER_CLIENT);
  }

  artifactStore.set(key, existing);
}

// ---------------------------------------------------------------------------
// Read artifacts
// ---------------------------------------------------------------------------

function getRecentArtifacts(
  tenantId: string,
  clientId: string,
  currentSessionId: string,
): CrossSessionThreadArtifact[] {
  const key = storeKey(tenantId, clientId);
  const all = pruneExpired(artifactStore.get(key) ?? []);
  // Exclude current session (already handled by within-session stitching)
  return all.filter((a) => !a.sourceSessionIds.includes(currentSessionId));
}

// ---------------------------------------------------------------------------
// Fact merging (cross-session)
// ---------------------------------------------------------------------------

function mergeCrossSessionFacts(
  priorFacts: MergedThreadFact[],
  currentFacts: MergedThreadFact[],
): { merged: MergedThreadFact[]; delta: string | null } {
  // Index current facts by factKey:value
  const currentByKey = new Map<string, MergedThreadFact>();
  for (const f of currentFacts) {
    currentByKey.set(`${f.factKey}:${String(f.value)}`, f);
  }

  const additionalPrior: MergedThreadFact[] = [];
  const newInCurrent: string[] = [];

  // Mark current facts as latest
  for (const f of currentFacts) {
    newInCurrent.push(f.factKey);
  }

  // Add prior facts not present in current (historical context)
  for (const pf of priorFacts) {
    const key = `${pf.factKey}:${String(pf.value)}`;
    if (!currentByKey.has(key)) {
      // Add as non-latest historical fact
      additionalPrior.push({ ...pf, isLatestSignal: false });
    }
  }

  const merged = [...currentFacts, ...additionalPrior];

  // Compute delta: what's new in current vs prior
  const priorFactKeys = new Set(priorFacts.map((f) => f.factKey));
  const newKeys = newInCurrent.filter((k) => !priorFactKeys.has(k));
  const delta = newKeys.length > 0
    ? `Nové informace v tomto vstupu: ${newKeys.slice(0, 3).join(", ")}`
    : null;

  return { merged, delta };
}

// ---------------------------------------------------------------------------
// Cross-session confidence scoring
// ---------------------------------------------------------------------------

function scoreCrossSessionConfidence(
  artifact: CrossSessionThreadArtifact,
  currentFacts: MergedThreadFact[],
): number {
  const ageMs = Date.now() - new Date(artifact.lastUpdatedAt).getTime();
  const daysSince = ageMs / (24 * 60 * 60 * 1000);

  // Recency: same day → 0.85, within 3 days → 0.65, older → 0.40
  let score = daysSince < 1 ? 0.85 : daysSince < 3 ? 0.65 : 0.40;

  // Fact overlap: more overlap → higher confidence in linkage
  const priorKeys = new Set(artifact.priorMergedFacts.map((f) => f.factKey));
  const currentKeys = new Set(currentFacts.map((f) => f.factKey));
  const overlap = [...currentKeys].filter((k) => priorKeys.has(k)).length;
  if (overlap >= 3) score = Math.min(0.90, score + 0.1);
  else if (overlap === 0) score = Math.max(0.20, score - 0.2);

  return Math.round(score * 100) / 100;
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Attempts to reconstruct a cross-session thread view for the current intake.
 * Returns null when cross-session reconstruction is not applicable.
 *
 * @param tenantId        For artifact scoping
 * @param clientId        Client to look up prior artifacts for (may be null)
 * @param sessionId       Current session ID (excluded from prior lookup)
 * @param currentFacts    Facts from current session reconstruction
 */
export function reconstructCrossSessionThread(
  tenantId: string,
  clientId: string | null,
  sessionId: string,
  currentFacts: MergedThreadFact[],
): CrossSessionReconstructionResult {
  if (!clientId) {
    return {
      hasPriorContext: false,
      priorMergedFacts: [],
      currentMergedFacts: currentFacts,
      priorVsLatestDelta: null,
      crossSessionConfidence: 0.0,
      unresolvedGaps: ["Klient nebyl identifikován — cross-session rekonstrukce není možná."],
    };
  }

  const priorArtifacts = getRecentArtifacts(tenantId, clientId, sessionId);

  if (priorArtifacts.length === 0) {
    return {
      hasPriorContext: false,
      priorMergedFacts: [],
      currentMergedFacts: currentFacts,
      priorVsLatestDelta: null,
      crossSessionConfidence: 0.0,
      unresolvedGaps: [],
    };
  }

  // Use most recent artifact
  const mostRecent = priorArtifacts[0]!;
  const confidence = scoreCrossSessionConfidence(mostRecent, currentFacts);

  if (confidence < 0.35) {
    return {
      hasPriorContext: true,
      priorMergedFacts: mostRecent.priorMergedFacts,
      currentMergedFacts: currentFacts,
      priorVsLatestDelta: null,
      crossSessionConfidence: confidence,
      unresolvedGaps: [
        "Cross-session spojení má nízkou jistotu — starší kontext nebyl sloučen.",
        `Uplynulo: ${Math.round((Date.now() - new Date(mostRecent.lastUpdatedAt).getTime()) / (60 * 60 * 1000))} hodin od posledního uploadu.`,
      ],
    };
  }

  const { merged: _merged, delta } = mergeCrossSessionFacts(mostRecent.priorMergedFacts, currentFacts);

  return {
    hasPriorContext: true,
    priorMergedFacts: mostRecent.priorMergedFacts,
    currentMergedFacts: currentFacts,
    priorVsLatestDelta: delta,
    crossSessionConfidence: confidence,
    unresolvedGaps: [],
  };
}

/** For testing: clear all artifacts. */
export function clearAllArtifacts(): void {
  artifactStore.clear();
}
