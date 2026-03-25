import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import {
  deriveAdminScope,
  canAccessAdmin,
  canAccessSecurityConsole,
  canManageIncidents,
} from "@/lib/admin/admin-permissions";
import { createIncident, listIncidents, type IncidentSeverity } from "@/lib/security/incident-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope) || !canAccessSecurityConsole(scope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));
  const severity = url.searchParams.get("severity") as IncidentSeverity | null;
  const status = url.searchParams.get("status");

  const statusList = status ? (status.split(",").filter(Boolean) as IncidentStatus[]) : undefined;

  const incidents = await listIncidents(membership.tenantId, {
    limit,
    ...(severity ? { severity } : {}),
    ...(statusList?.length ? { status: statusList } : {}),
  });

  return NextResponse.json({ incidents });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope) || !canManageIncidents(scope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const severity = body.severity as IncidentSeverity;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!severity || !["low", "medium", "high", "critical"].includes(severity)) {
    return NextResponse.json({ error: "valid severity required" }, { status: 400 });
  }

  const incident = await createIncident({
    tenantId: membership.tenantId,
    title,
    description: typeof body.description === "string" ? body.description : undefined,
    severity,
    reportedBy: userId,
    meta: typeof body.meta === "object" && body.meta !== null ? (body.meta as Record<string, unknown>) : undefined,
  });

  return NextResponse.json({ incident }, { status: 201 });
}
