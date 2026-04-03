import { NextResponse } from "next/server";
import { getMembership } from "@/lib/auth/get-membership";
import { getContractReviewById } from "@/lib/ai/review-queue-repository";
import { createAdminClient } from "@/lib/supabase/server";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

export async function GET(
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

    const row = await getContractReviewById(id, membership.tenantId);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    const signed = await createSignedStorageUrl({
      adminClient: admin,
      bucket: "documents",
      path: row.storagePath,
      purpose: "advisor_document_preview",
    });

    if (!signed.signedUrl) {
      return NextResponse.json(
        { error: "Odkaz na soubor není k dispozici." },
        { status: 500 }
      );
    }
    await logAudit({
      tenantId: membership.tenantId,
      userId,
      action: "download",
      entityType: "contract_review",
      entityId: id,
      request,
    }).catch(() => {});

    return NextResponse.json({ url: signed.signedUrl, expiresIn: signed.expiresIn });
  } catch {
    return NextResponse.json(
      { error: "Načtení souboru selhalo." },
      { status: 500 }
    );
  }
}
