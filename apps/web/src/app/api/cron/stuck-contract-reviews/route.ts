/**
 * GET /api/cron/stuck-contract-reviews
 *
 * Watchdog: re-classify AI review rows that have been stuck in
 * `processing_status = 'processing'` longer than STUCK_MINUTES as `failed`,
 * so poradce can retry. `updateContractReview` bumps `updated_at` on every
 * transition, so this is a reliable "last movement" clock.
 */
import { NextResponse } from "next/server";
import { contractUploadReviews, and, eq, lt, sql } from "db";
import { dbService, withServiceTenantContext } from "@/lib/db/service-db";
import { cronAuthResponse } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reviews stuck >= this many minutes are considered dead. */
const STUCK_MINUTES = 15;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);

  const stuck = await dbService
    .select({
      id: contractUploadReviews.id,
      tenantId: contractUploadReviews.tenantId,
      updatedAt: contractUploadReviews.updatedAt,
    })
    .from(contractUploadReviews)
    .where(
      and(
        eq(contractUploadReviews.processingStatus, "processing"),
        lt(contractUploadReviews.updatedAt, cutoff),
      ),
    )
    .limit(500);

  if (stuck.length === 0) {
    return NextResponse.json({ reaped: 0, stuckMinutes: STUCK_MINUTES });
  }

  const byTenant = new Map<string, string[]>();
  for (const row of stuck) {
    const list = byTenant.get(row.tenantId) ?? [];
    list.push(row.id);
    byTenant.set(row.tenantId, list);
  }

  for (const [tenantId, ids] of byTenant.entries()) {
    await withServiceTenantContext({ tenantId }, async (tx) => {
      await tx
        .update(contractUploadReviews)
        .set({
          processingStatus: "failed",
          errorMessage:
            "Zpracování bylo ukončeno ochranným sledováním (přerušeno serverem). Zkuste spustit znovu.",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contractUploadReviews.tenantId, tenantId),
            eq(contractUploadReviews.processingStatus, "processing"),
            sql`${contractUploadReviews.id} = ANY(${ids}::uuid[])`,
          ),
        );
    });
  }

  return NextResponse.json({
    reaped: stuck.length,
    stuckMinutes: STUCK_MINUTES,
    ids: stuck.map((r) => r.id),
  });
}
