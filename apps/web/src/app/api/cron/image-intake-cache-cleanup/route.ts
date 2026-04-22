/**
 * Cron: Image Intake intent-assist cache cleanup (Phase 11).
 *
 * Separate from the main image-intake-cleanup cron which handles artifacts (TTL 72h).
 * This endpoint only deletes stale `ai_generations` rows where:
 *   entityType = "image_intake_intent_assist_cache"
 *   createdAt < NOW() - intentAssistCacheTtlMs (default 30 min)
 *
 * Schedule (vercel.json): once daily — Vercel Hobby allows only ≤1 run per day per cron.
 * With daily cleanup, stale intent-assist cache rows may live longer than the 30-min TTL until
 * the next run; acceptable trade-off on Hobby. For Pro, you can use a more frequent schedule.
 *
 * Configurable via IMAGE_INTAKE_INTENT_ASSIST_CACHE_TTL_HOURS env var or runtime override.
 *
 * Phase 11 rationale: separate from daily artifact cleanup; on Hobby both run at most once
 * per day per Vercel cron entry, so this endpoint still trims cache when cross-session
 * persistence is enabled.
 *
 * Safety:
 * - Only deletes rows with entityType = "image_intake_intent_assist_cache" — no other data
 * - Skips if config.crossSessionPersistenceEnabled is false (no rows to clean)
 * - Non-throwing: failures logged as structured audit + 500 response
 * - Minimum TTL guard: never deletes rows fresher than 10 minutes regardless of config
 *
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
export const maxDuration = 30;

const ENTITY_TYPE_CACHE = "image_intake_intent_assist_cache";
const CRON_AUDIT_TENANT = "system";
const CRON_AUDIT_USER = "cron";
/** Minimum TTL guard: never delete entries fresher than 10 minutes. */
const MIN_CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const runStart = Date.now();
  const config = getImageIntakeConfig();

  if (!config.crossSessionPersistenceEnabled) {
    logAuditAction({
      tenantId: CRON_AUDIT_TENANT,
      userId: CRON_AUDIT_USER,
      action: "image_intake_cache_cleanup.skipped",
      entityType: "cron_run",
      meta: {
        reason: "cross_session_persistence_enabled=false",
        cacheTtlHours: config.intentAssistCacheTtlMs / 3600000,
      },
    });
    void sendCronHealthWebhook({
      job: "image_intake_cache_cleanup",
      status: "skipped",
      durationMs: Date.now() - runStart,
      deletedArtifacts: 0,
      deletedCache: 0,
      totalDeleted: 0,
      timestamp: new Date().toISOString(),
      message: "cross_session_persistence_enabled is false — cache cleanup skipped.",
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "cross_session_persistence_enabled is false — cache cleanup skipped.",
    });
  }

  // Apply minimum TTL guard
  const effectiveCacheTtlMs = Math.max(config.intentAssistCacheTtlMs, MIN_CACHE_TTL_MS);
  const cacheCutoffMs = Date.now() - effectiveCacheTtlMs;
  const cacheCutoffDate = new Date(cacheCutoffMs);
  const cacheTtlHours = effectiveCacheTtlMs / 3600000;

  logAuditAction({
    tenantId: CRON_AUDIT_TENANT,
    userId: CRON_AUDIT_USER,
    action: "image_intake_cache_cleanup.started",
    entityType: "cron_run",
    meta: {
      cacheCutoffDate: cacheCutoffDate.toISOString(),
      cacheTtlHours,
      effectiveCacheTtlMs,
    },
  });

  try {
    const cacheResult = await dbService
      .delete(aiGenerations)
      .where(
        and(
          eq(aiGenerations.entityType, ENTITY_TYPE_CACHE),
          lt(aiGenerations.createdAt, cacheCutoffDate),
        ),
      );

    const deletedCache = (cacheResult as { rowCount?: number }).rowCount ?? 0;
    const durationMs = Date.now() - runStart;

    logAuditAction({
      tenantId: CRON_AUDIT_TENANT,
      userId: CRON_AUDIT_USER,
      action: "image_intake_cache_cleanup.completed",
      entityType: "cron_run",
      meta: {
        deletedCache,
        cacheCutoffDate: cacheCutoffDate.toISOString(),
        cacheTtlHours,
        durationMs,
      },
    });

    void sendCronHealthWebhook({
      job: "image_intake_cache_cleanup",
      status: "ok",
      durationMs,
      deletedArtifacts: 0,
      deletedCache,
      totalDeleted: deletedCache,
      timestamp: new Date().toISOString(),
      message: `Cache cleanup completed. Deleted ${deletedCache} entries in ${durationMs}ms.`,
    });

    return NextResponse.json({
      ok: true,
      deletedCache,
      cacheCutoffDate: cacheCutoffDate.toISOString(),
      cacheTtlHours,
      durationMs,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown cache cleanup error";
    const durationMs = Date.now() - runStart;

    logAuditAction({
      tenantId: CRON_AUDIT_TENANT,
      userId: CRON_AUDIT_USER,
      action: "image_intake_cache_cleanup.failed",
      entityType: "cron_run",
      meta: { error, cacheCutoffDate: cacheCutoffDate.toISOString(), cacheTtlHours, durationMs },
    });

    void sendCronHealthWebhook({
      job: "image_intake_cache_cleanup",
      status: "failed",
      durationMs,
      deletedArtifacts: 0,
      deletedCache: 0,
      totalDeleted: 0,
      timestamp: new Date().toISOString(),
      message: `Cache cleanup failed: ${error}`,
    });

    return NextResponse.json(
      { ok: false, error, cacheCutoffDate: cacheCutoffDate.toISOString(), cacheTtlHours, durationMs },
      { status: 500 },
    );
  }
}
