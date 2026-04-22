/**
 * Cron health: Image Intake cleanup job signal (Phase 10).
 *
 * Returns structured health status of the last image-intake-cleanup cron run.
 * Reads the most recent audit log entries for the cron actions and computes
 * a health signal without adding request-time overhead to the cleanup cron itself.
 *
 * Auth: Requires advisor auth (same as other internal health endpoints).
 * No CRON_SECRET required — this is a read endpoint for internal monitoring.
 *
 * Health status:
 *   healthy   — last run completed within the expected window
 *   degraded  — last run failed or completed with errors
 *   stale     — no completed run found in last 48h
 *   unknown   — no audit records found at all
 *
 * Cost: 1 DB read (max 5 rows). No model calls. No request overhead.
 */

import { NextResponse } from "next/server";
import { auditLog, and, eq, desc, gte } from "db";
import { dbService } from "@/lib/db/service-db";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { getImageIntakeConfig } from "@/lib/ai/image-intake/image-intake-config";
import { isCronWebhookConfigured } from "@/lib/ai/image-intake/cron-webhook";
import { getImageIntakeRuntimeHealthSummary } from "@/lib/ai/image-intake/feature-flag";

export const dynamic = "force-dynamic";

const CRON_AUDIT_TENANT = "system";
const CRON_ACTION_COMPLETED = "image_intake_cleanup.completed";
const CRON_ACTION_FAILED = "image_intake_cleanup.failed";
const CRON_ACTION_SKIPPED = "image_intake_cleanup.skipped";
const HEALTH_WINDOW_HOURS = 48;

type CronHealthStatus = "healthy" | "degraded" | "stale" | "unknown";

export async function GET(_request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await getMembership(user.id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = getImageIntakeConfig();
  const since = new Date(Date.now() - HEALTH_WINDOW_HOURS * 60 * 60 * 1000);

  try {
    const rows = await dbService
      .select({
        action: auditLog.action,
        meta: auditLog.meta,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, CRON_AUDIT_TENANT),
          gte(auditLog.createdAt, since),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(5);

    const relevantRows = rows.filter((r) =>
      r.action === CRON_ACTION_COMPLETED ||
      r.action === CRON_ACTION_FAILED ||
      r.action === CRON_ACTION_SKIPPED,
    );

    if (relevantRows.length === 0) {
      return NextResponse.json({
        status: "unknown" as CronHealthStatus,
        lastRunAt: null,
        lastAction: null,
        lastRunMeta: null,
        configSummary: buildConfigSummary(config),
        message: `Žádný cleanup run nenalezen v posledních ${HEALTH_WINDOW_HOURS}h.`,
      });
    }

    const latest = relevantRows[0]!;
    const status = computeHealthStatus(latest.action);
    const meta = (latest.meta ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      status,
      lastRunAt: latest.createdAt?.toISOString() ?? null,
      lastAction: latest.action,
      lastRunMeta: {
        deletedArtifacts: meta.deletedArtifacts ?? null,
        deletedCache: meta.deletedCache ?? null,
        totalDeleted: meta.totalDeleted ?? null,
        durationMs: meta.durationMs ?? null,
        artifactTtlHours: meta.artifactTtlHours ?? null,
        cacheTtlHours: meta.cacheTtlHours ?? null,
        error: meta.error ?? null,
      },
      configSummary: buildConfigSummary(config),
      message: buildHealthMessage(status, latest.action, meta),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "unknown" as CronHealthStatus,
        error: err instanceof Error ? err.message : "DB lookup failed",
        message: "Chyba při načítání health statusu cleanup cronu.",
      },
      { status: 200 }, // 200 intentional — health endpoint should not 500
    );
  }
}

function computeHealthStatus(action: string): CronHealthStatus {
  if (action === CRON_ACTION_COMPLETED) return "healthy";
  if (action === CRON_ACTION_SKIPPED) return "healthy"; // skipped is expected when disabled
  if (action === CRON_ACTION_FAILED) return "degraded";
  return "unknown";
}

function buildConfigSummary(config: ReturnType<typeof getImageIntakeConfig>) {
  return {
    crossSessionPersistenceEnabled: config.crossSessionPersistenceEnabled,
    artifactTtlHours: config.crossSessionTtlMs / 3600000,
    cacheTtlHours: config.intentAssistCacheTtlMs / 3600000,
    externalWebhookConfigured: isCronWebhookConfigured(),
    runtimeFlags: getImageIntakeRuntimeHealthSummary(),
  };
}

function buildHealthMessage(
  status: CronHealthStatus,
  action: string,
  meta: Record<string, unknown>,
): string {
  if (status === "healthy" && action === CRON_ACTION_COMPLETED) {
    const deleted = meta.totalDeleted ?? 0;
    const ms = meta.durationMs ?? 0;
    return `Cleanup proběhl úspěšně. Smazáno ${deleted} záznamů za ${ms}ms.`;
  }
  if (status === "healthy" && action === CRON_ACTION_SKIPPED) {
    return `Cleanup byl přeskočen (cross_session_persistence_enabled=false).`;
  }
  if (status === "degraded") {
    return `Poslední cleanup selhal: ${meta.error ?? "neznámá chyba"}.`;
  }
  return "Stav cleanup cronu nelze určit.";
}
