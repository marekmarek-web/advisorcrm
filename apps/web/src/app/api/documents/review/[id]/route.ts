import { NextResponse } from "next/server";
import { getMembership } from "@/lib/auth/get-membership";
import { getContractReviewById } from "@/lib/ai/review-queue-repository";
import { expireStaleScanPendingOcrIfNeeded } from "@/lib/contracts/ocr-scan-pending-watchdog";
import { serializeContractReviewDetailResponse } from "@/lib/ai/contract-review-serialize";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

/**
 * Plan 3 §11.3 — alias for contract AI review detail (same payload as GET /api/contracts/review/[id]).
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
    return NextResponse.json({ error: "Načtení detailu selhalo." }, { status: 500 });
  }
}
