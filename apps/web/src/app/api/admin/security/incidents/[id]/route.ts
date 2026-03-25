import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import {
  deriveAdminScope,
  canAccessAdmin,
  canAccessSecurityConsole,
  canManageIncidents,
} from "@/lib/admin/admin-permissions";
import {
  getIncident,
  updateIncidentStatus,
  resolveIncident,
  type IncidentStatus,
} from "@/lib/security/incident-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope) || !canAccessSecurityConsole(scope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const incident = await getIncident(membership.tenantId, id);
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ incident });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  if (body.action === "resolve") {
    const resolution = typeof body.resolution === "string" ? body.resolution : undefined;
    try {
      const incident = await resolveIncident(membership.tenantId, id, resolution);
      return NextResponse.json({ incident });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const status = body.status as IncidentStatus;
  if (!status) return NextResponse.json({ error: "status or action required" }, { status: 400 });

  try {
    const incident = await updateIncidentStatus(membership.tenantId, id, status, {
      meta: typeof body.meta === "object" && body.meta !== null ? (body.meta as Record<string, unknown>) : undefined,
    });
    return NextResponse.json({ incident });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
