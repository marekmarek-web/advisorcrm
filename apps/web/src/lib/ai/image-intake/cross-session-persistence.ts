/**
 * AI Photo / Image Intake — cross-session persistence adapter v1 (Phase 7).
 *
 * Provides DB-backed persistence for cross-session thread artifacts.
 * Reuses the existing `ai_generations` table pattern:
 *   entityType = "image_intake_thread_artifact"
 *   entityId   = "<tenantId>:<clientId>"
 *   outputText = JSON serialized artifact array
 *   contextHash = stateVersion (for conflict detection)
 *
 * No new DB migration required.
 *
 * Safety:
 * - All DB operations are non-throwing (failures degrade gracefully)
 * - Failed persistence does NOT break the intake flow
 * - Lane continues on in-process fallback if DB unavailable
 * - Scope limited: max artifacts per client, TTL enforced on read
 *
 * Cost: Zero model calls.
 */

import "server-only";
import { db, aiGenerations, eq, and, desc } from "db";
import type { CrossSessionThreadArtifact } from "./types";
import { getImageIntakeConfig } from "./image-intake-config";

const ENTITY_TYPE = "image_intake_thread_artifact";

// ---------------------------------------------------------------------------
// Persistence operations
// ---------------------------------------------------------------------------

function makeEntityId(tenantId: string, clientId: string): string {
  return `${tenantId}:${clientId}`;
}

/**
 * Persists thread artifacts for a client to the DB.
 * Overwrites the existing record for this tenant:client pair.
 * Non-throwing — failure degrades gracefully.
 */
export async function persistArtifactsToDb(
  tenantId: string,
  userId: string,
  clientId: string,
  artifacts: CrossSessionThreadArtifact[],
): Promise<{ persisted: boolean; reason?: string }> {
  const config = getImageIntakeConfig();
  if (!config.crossSessionPersistenceEnabled) {
    return { persisted: false, reason: "Persistence disabled via config." };
  }

  try {
    const entityId = makeEntityId(tenantId, clientId);
    const stateVersion = `v1:${Date.now()}`;
    const serialized = JSON.stringify(artifacts.slice(0, config.crossSessionMaxArtifacts));

    // Upsert pattern: delete existing + insert new
    // Simple approach reusing existing db pattern (drizzle)
    await db
      .delete(aiGenerations)
      .where(
        and(
          eq(aiGenerations.tenantId, tenantId),
          eq(aiGenerations.entityType, ENTITY_TYPE),
          eq(aiGenerations.entityId, entityId),
        ),
      );

    await db.insert(aiGenerations).values({
      tenantId,
      entityType: ENTITY_TYPE,
      entityId,
      promptType: "cross_session_thread_artifact",
      promptId: "cross_session_v1",
      promptVersion: "1",
      generatedByUserId: userId,
      outputText: serialized,
      status: "success",
      contextHash: stateVersion,
    });

    return { persisted: true };
  } catch (err) {
    return {
      persisted: false,
      reason: `DB persistence failed: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

/**
 * Loads persisted artifacts for a client from the DB.
 * Returns empty array on any error (safe degradation).
 */
export async function loadArtifactsFromDb(
  tenantId: string,
  clientId: string,
): Promise<CrossSessionThreadArtifact[]> {
  const config = getImageIntakeConfig();
  if (!config.crossSessionPersistenceEnabled) {
    return [];
  }

  try {
    const entityId = makeEntityId(tenantId, clientId);
    const rows = await db
      .select({ outputText: aiGenerations.outputText, createdAt: aiGenerations.createdAt })
      .from(aiGenerations)
      .where(
        and(
          eq(aiGenerations.tenantId, tenantId),
          eq(aiGenerations.entityType, ENTITY_TYPE),
          eq(aiGenerations.entityId, entityId),
        ),
      )
      .orderBy(desc(aiGenerations.createdAt))
      .limit(1);

    if (rows.length === 0 || !rows[0]?.outputText) return [];

    const parsed = JSON.parse(rows[0].outputText) as CrossSessionThreadArtifact[];
    if (!Array.isArray(parsed)) return [];

    // Apply TTL filter
    const cutoff = Date.now() - config.crossSessionTtlMs;
    return parsed.filter((a) => new Date(a.lastUpdatedAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

/**
 * Clears persisted artifacts for a client (e.g., for testing or reset).
 */
export async function clearArtifactsFromDb(
  tenantId: string,
  clientId: string,
): Promise<void> {
  try {
    const entityId = makeEntityId(tenantId, clientId);
    await db
      .delete(aiGenerations)
      .where(
        and(
          eq(aiGenerations.tenantId, tenantId),
          eq(aiGenerations.entityType, ENTITY_TYPE),
          eq(aiGenerations.entityId, entityId),
        ),
      );
  } catch {
    // Non-throwing
  }
}
