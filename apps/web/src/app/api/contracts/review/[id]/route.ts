import { NextResponse } from "next/server";
import { getMembership } from "@/lib/auth/get-membership";
import { deleteContractReview, getContractReviewById } from "@/lib/ai/review-queue-repository";
import { expireStaleScanPendingOcrIfNeeded } from "@/lib/contracts/ocr-scan-pending-watchdog";
import { serializeContractReviewDetailResponse } from "@/lib/ai/contract-review-serialize";
import { createAdminClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

function storageRemoveErrorIsBenign(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not found") ||
    m.includes("does not exist") ||
    m.includes("object not found") ||
    m.includes("no such file") ||
    m.includes("404")
  );
}

/**
 * GET /api/contracts/review/[id]
 * Returns contract review detail and payload for review queue UI.
 * Auth only via x-user-id from middleware (no Supabase in route).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const wantsDebug = new URL(request.url).searchParams.get("debug") === "1";
    const userId = request.headers.get(USER_ID_HEADER);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const membership = await getMembership(userId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const includeDebug = wantsDebug && membership.roleName.toLowerCase() === "admin";

    const row = await getContractReviewById(id, membership.tenantId);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const afterWatchdog = await expireStaleScanPendingOcrIfNeeded(row, membership.tenantId, {
      userId,
    });
    const finalRow = afterWatchdog ?? row;

    return NextResponse.json(serializeContractReviewDetailResponse(finalRow, includeDebug));
  } catch {
    return NextResponse.json(
      { error: "Načtení detailu selhalo." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/contracts/review/[id]
 * Removes the object from Storage (documents bucket) then deletes the DB row.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = request.headers.get(USER_ID_HEADER);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const membership = await getMembership(userId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limiter = checkRateLimit(request, "contracts-review-delete", `${membership.tenantId}:${userId}`, {
      windowMs: 60_000,
      maxRequests: 30,
    });
    if (!limiter.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho požadavků na smazání. Zkuste to za chvíli.", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      );
    }

    const row = await getContractReviewById(id, membership.tenantId);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const path = row.storagePath?.trim();
    if (path) {
      const admin = createAdminClient();
      const { error: storageErr } = await admin.storage.from("documents").remove([path]);
      if (storageErr) {
        const msg = storageErr.message ?? String(storageErr);
        if (!storageRemoveErrorIsBenign(msg)) {
          console.error("[DELETE /api/contracts/review/[id]] storage.remove failed", msg);
          return NextResponse.json(
            { error: "Smazání souboru v úložišti selhalo.", code: "STORAGE_DELETE_FAILED" },
            { status: 500 }
          );
        }
         
        console.warn("[DELETE /api/contracts/review/[id]] storage object already missing or benign error:", msg);
      }
    }

    const { deleted } = await deleteContractReview(id, membership.tenantId);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await logAudit({
      tenantId: membership.tenantId,
      userId,
      action: "contract_review_deleted",
      entityType: "contract_review",
      entityId: id,
      request,
      meta: { fileName: row.fileName },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/contracts/review/[id]]", err);
    return NextResponse.json({ error: "Smazání položky selhalo." }, { status: 500 });
  }
}
