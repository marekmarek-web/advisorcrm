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
  listSubjectRequests,
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

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const adminScope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(adminScope) || !canManageComplianceRequests(adminScope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const contactId = url.searchParams.get("contactId") ?? undefined;
  const typeParam = url.searchParams.get("type");
  const type = typeParam && isRequestType(typeParam) ? typeParam : undefined;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));

  const requests = await listSubjectRequests(membership.tenantId, {
    ...(contactId ? { contactId } : {}),
    ...(type ? { type } : {}),
    limit,
  });

  return NextResponse.json({ requests });
}

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
