/**
 * Cron: Image Intake cross-session artifact cleanup (Phase 8 / Phase 9 / Phase 11).
 *
 * Runs daily and deletes stale `ai_generations` rows where:
 *   entityType IN ("image_intake_thread_artifact", "image_intake_intent_assist_cache")
 *   createdAt < NOW() - respective TTL
 *
 * Phase 9 monitoring additions:
 * - Structured audit log per cron run (logAuditAction)
 * - Separate deleted counts per entityType
 * - Config summary in response for ops visibility
 * - Skipped/error states clearly signalled
 *
 * Phase 11 schedule hardening:
 * - Intent-assist cache (TTL ~30 min) is ALSO cleaned by a dedicated 2-hourly cron
 *   at /api/cron/image-intake-cache-cleanup. That cron is the primary for cache cleanup.
 * - This daily cron acts as a fallback safety net for any cache entries that survived
 *   the 2-hourly cleanup (e.g. if it was temporarily disabled).
 * - Keeping both is safe — duplicate deletes are idempotent (rowCount=0 on second run).
 * - Phase 11 also adds external webhook push after each run via sendCronHealthWebhook.
 *
 * Safety:
 * - Only deletes rows with the specific entityTypes — no other data touched
 * - Skips if config.crossSessionPersistenceEnabled is false
 * - Non-throwing: failures logged + 500 with error detail
 * - Respects TTL from image-intake-config (artifacts: 72h default, cache: 30 min default)
 *
 * Vercel cron: schedule "0 3 * * *" (3am UTC daily)
 * Auth: cronAuthResponse (CRON_SECRET bearer)
 */

import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron-auth";
import { aiGenerations, eq, and, lt } from "db";
import { dbService } from "@/lib/db/service-db";
import { logAuditAction } from "@/lib/audit";
import { getImageIntakeConfig } from "@/lib/ai/image-intake/image-intake-config";
import { sendCronHealthWebhook } from "@/lib/ai/image-intake/cron-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ENTITY_TYPE_ARTIFACT = "image_intake_thread_artifact";
const ENTITY_TYPE_CACHE = "image_intake_intent_assist_cache";
const CRON_AUDIT_TENANT = "system";
const CRON_AUDIT_USER = "cron";

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const runStart = Date.now();
  const config = getImageIntakeConfig();

  if (!config.crossSessionPersistenceEnabled) {
    logAuditAction({
      tenantId: CRON_AUDIT_TENANT,
      userId: CRON_AUDIT_USER,
      action: "image_intake_cleanup.skipped",
      entityType: "cron_run",
      meta: {
        reason: "cross_session_persistence_enabled=false",
        ttlHours: config.crossSessionTtlMs / 3600000,
      },
    });
    // Phase 11: fire-and-forget external webhook (non-blocking)
    void sendCronHealthWebhook({
      job: "image_intake_cleanup",
      status: "skipped",
      durationMs: Date.now() - runStart,
      deletedArtifacts: 0,
      deletedCache: 0,
      totalDeleted: 0,
      timestamp: new Date().toISOString(),
      message: "cross_session_persistence_enabled is false — cleanup skipped.",
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "cross_session_persistence_enabled is false — cleanup skipped.",
    });
  }

  // Phase 10: separate TTL per entity type
  const artifactCutoffMs = Date.now() - config.crossSessionTtlMs;
  const artifactCutoffDate = new Date(artifactCutoffMs);
  const artifactTtlHours = config.crossSessionTtlMs / 3600000;

  const cacheCutoffMs = Date.now() - config.intentAssistCacheTtlMs;
  const cacheCutoffDate = new Date(cacheCutoffMs);
  const cacheTtlHours = config.intentAssistCacheTtlMs / 3600000;

  logAuditAction({
    tenantId: CRON_AUDIT_TENANT,
    userId: CRON_AUDIT_USER,
    action: "image_intake_cleanup.started",
    entityType: "cron_run",
    meta: {
      artifactCutoffDate: artifactCutoffDate.toISOString(),
      artifactTtlHours,
      cacheCutoffDate: cacheCutoffDate.toISOString(),
      cacheTtlHours,
      entityTypes: [ENTITY_TYPE_ARTIFACT, ENTITY_TYPE_CACHE],
    },
  });

  try {
    // Delete cross-session artifacts (uses crossSessionTtlMs)
    const artifactResult = await dbService
      .delete(aiGenerations)
      .where(
        and(
          eq(aiGenerations.entityType, ENTITY_TYPE_ARTIFACT),
          lt(aiGenerations.createdAt, artifactCutoffDate),
        ),
      );

    // Delete intent-assist cache entries (Phase 10: uses intentAssistCacheTtlMs, default 30 min)
    const cacheResult = await dbService
      .delete(aiGenerations)
      .where(
        and(
          eq(aiGenerations.entityType, ENTITY_TYPE_CACHE),
          lt(aiGenerations.createdAt, cacheCutoffDate),
        ),
      );

    const deletedArtifacts = (artifactResult as { rowCount?: number }).rowCount ?? 0;
    const deletedCache = (cacheResult as { rowCount?: number }).rowCount ?? 0;
    const totalDeleted = deletedArtifacts + deletedCache;
    const durationMs = Date.now() - runStart;

    logAuditAction({
      tenantId: CRON_AUDIT_TENANT,
      userId: CRON_AUDIT_USER,
      action: "image_intake_cleanup.completed",
      entityType: "cron_run",
      meta: {
        deletedArtifacts,
        deletedCache,
        totalDeleted,
        artifactCutoffDate: artifactCutoffDate.toISOString(),
        artifactTtlHours,
        cacheCutoffDate: cacheCutoffDate.toISOString(),
        cacheTtlHours,
        durationMs,
      },
    });

    // Phase 11: fire-and-forget external webhook (non-blocking, after response data is ready)
    void sendCronHealthWebhook({
      job: "image_intake_cleanup",
      status: "ok",
      durationMs,
      deletedArtifacts,
      deletedCache,
      totalDeleted,
      timestamp: new Date().toISOString(),
      message: `Cleanup completed. Deleted ${totalDeleted} rows in ${durationMs}ms.`,
    });

    return NextResponse.json({
      ok: true,
      deletedArtifacts,
      deletedCache,
      totalDeleted,
      artifactCutoffDate: artifactCutoffDate.toISOString(),
      artifactTtlHours,
      cacheCutoffDate: cacheCutoffDate.toISOString(),
      cacheTtlHours,
      durationMs,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown cleanup error";
    const durationMs = Date.now() - runStart;

    logAuditAction({
      tenantId: CRON_AUDIT_TENANT,
      userId: CRON_AUDIT_USER,
      action: "image_intake_cleanup.failed",
      entityType: "cron_run",
      meta: {
        error,
        artifactCutoffDate: artifactCutoffDate.toISOString(),
        artifactTtlHours,
        cacheCutoffDate: cacheCutoffDate.toISOString(),
        cacheTtlHours,
        durationMs,
      },
    });

    // Phase 11: fire-and-forget external webhook on failure too
    void sendCronHealthWebhook({
      job: "image_intake_cleanup",
      status: "failed",
      durationMs,
      deletedArtifacts: 0,
      deletedCache: 0,
      totalDeleted: 0,
      timestamp: new Date().toISOString(),
      message: `Cleanup failed: ${error}`,
    });

    return NextResponse.json(
      {
        ok: false,
        error,
        artifactCutoffDate: artifactCutoffDate.toISOString(),
        artifactTtlHours,
        cacheCutoffDate: cacheCutoffDate.toISOString(),
        cacheTtlHours,
        durationMs,
      },
      { status: 500 },
    );
  }
}
