/**
 * Plan 9D alias: POST /api/admin/compliance/subject-requests/create
 * Equivalent to POST /api/admin/compliance/subject-requests
 */
import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import {
  deriveAdminScope,
  canAccessAdmin,
  canManageComplianceRequests,
} from "@/lib/admin/admin-permissions";
import {
  createSubjectRequest,
  type SubjectRequestType,
} from "@/lib/compliance/subject-workflows";

const REQUEST_TYPES: SubjectRequestType[] = [
  "gdpr_export",
  "gdpr_delete",
  "gdpr_anonymize",
  "consent_revoke",
];

function isRequestType(v: string): v is SubjectRequestType {
  return REQUEST_TYPES.includes(v as SubjectRequestType);
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
  const requestTypeRaw = typeof body.requestType === "string" ? body.requestType : "";
  if (!contactId || !isRequestType(requestTypeRaw)) {
    return NextResponse.json({ error: "contactId and valid requestType required" }, { status: 400 });
  }

  const row = await createSubjectRequest({
    tenantId: membership.tenantId,
    contactId,
    requestType: requestTypeRaw,
    requestedBy: userId,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  });

  return NextResponse.json({ request: row }, { status: 201 });
}
