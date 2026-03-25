/**
 * Plan 9D alias: POST /api/admin/security/incidents/update
 * Forwards to the same logic as PATCH /api/admin/security/incidents/[id]
 */
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
  updateIncidentStatus,
  resolveIncident,
  type IncidentStatus,
} from "@/lib/security/incident-service";

export const dynamic = "force-dynamic";

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

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

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
