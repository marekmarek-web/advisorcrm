import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import {
  deriveAdminScope,
  canAccessAdmin,
  canManageComplianceRequests,
} from "@/lib/admin/admin-permissions";
import {
  getSubjectRequest,
  processExportRequest,
  processDeleteRequest,
  cancelSubjectRequest,
} from "@/lib/compliance/subject-workflows";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const adminScope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(adminScope) || !canManageComplianceRequests(adminScope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const row = await getSubjectRequest(membership.tenantId, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ request: row });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const adminScope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(adminScope) || !canManageComplianceRequests(adminScope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = await params;
  const action = body.action;

  try {
    if (action === "process_export") {
      const result = await processExportRequest(membership.tenantId, id);
      return NextResponse.json({ result });
    }
    if (action === "process_delete") {
      const result = await processDeleteRequest(membership.tenantId, id);
      return NextResponse.json({ result });
    }
    if (action === "cancel") {
      const row = await cancelSubjectRequest(membership.tenantId, id);
      return NextResponse.json({ request: row });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
