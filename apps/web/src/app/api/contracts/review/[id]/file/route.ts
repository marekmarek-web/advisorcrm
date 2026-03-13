import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission } from "@/lib/auth/get-membership";
import { getContractReviewById } from "@/lib/ai/review-queue-repository";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Short-lived signed URL to download original contract file. Tenant-isolated. */
const SIGNED_URL_EXPIRES_SEC = 60;

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
    if (!membership || !hasPermission(membership.roleName, "documents:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const row = await getContractReviewById(id, membership.tenantId);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(row.storagePath, SIGNED_URL_EXPIRES_SEC);

    if (!signed?.signedUrl) {
      return NextResponse.json(
        { error: "Odkaz na soubor není k dispozici." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: signed.signedUrl, expiresIn: SIGNED_URL_EXPIRES_SEC });
  } catch {
    return NextResponse.json(
      { error: "Načtení souboru selhalo." },
      { status: 500 }
    );
  }
}
