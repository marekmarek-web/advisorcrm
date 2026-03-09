import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { db } from "db";
import { documents, auditLog } from "db";
import { eq, and } from "db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", _request.url));
  }
  const membership = await getMembership(user.id);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [doc] = await db.select().from(documents).where(and(eq(documents.tenantId, membership.tenantId), eq(documents.id, id))).limit(1);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (membership.roleName === "Client") {
    if (!membership.contactId || doc.contactId !== membership.contactId || !doc.visibleToClient) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  await db.insert(auditLog).values({
    tenantId: membership.tenantId,
    userId: user.id,
    action: "download",
    entityType: "document",
    entityId: id,
  });
  const admin = createAdminClient();
  const { data: signed } = await admin.storage.from("documents").createSignedUrl(doc.storagePath, 60);
  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "Storage URL failed" }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
