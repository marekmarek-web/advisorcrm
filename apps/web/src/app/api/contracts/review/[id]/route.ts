import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership, hasPermission, type RoleName } from "@/lib/auth/get-membership";
import { getContractReviewById } from "@/lib/ai/review-queue-repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/contracts/review/[id]
 * Returns contract review detail and payload for review queue UI.
 * Server-side only; no API key or raw document in response.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const membership = await getMembership(user.id);
    if (!membership || !hasPermission(membership.roleName as RoleName, "documents:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const row = await getContractReviewById(id, membership.tenantId);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      processingStatus: row.processingStatus,
      errorMessage: row.errorMessage,
      extractedPayload: row.extractedPayload,
      clientMatchCandidates: row.clientMatchCandidates,
      draftActions: row.draftActions,
      confidence: row.confidence,
      reasonsForReview: row.reasonsForReview,
      reviewStatus: row.reviewStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch {
    return NextResponse.json(
      { error: "Načtení detailu selhalo." },
      { status: 500 }
    );
  }
}
