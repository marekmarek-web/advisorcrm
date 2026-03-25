import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canAccessAdmin, canAccessSecurityConsole } from "@/lib/admin/admin-permissions";
import { getSecurityEvents, getSecuritySummary, type SecurityEventType } from "@/lib/security/security-audit";

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
  const summaryOnly = url.searchParams.get("summaryOnly") === "1";
  const sinceHours = Math.min(168, Math.max(1, Number(url.searchParams.get("sinceHours") ?? "24") || 24));
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100));
  const eventType = url.searchParams.get("eventType") as SecurityEventType | null;

  if (summaryOnly) {
    const summary = await getSecuritySummary(membership.tenantId, sinceHours);
    return NextResponse.json({ summary });
  }

  const events = await getSecurityEvents(membership.tenantId, {
    sinceHours,
    limit,
    ...(eventType ? { eventType } : {}),
  });
  const summary = await getSecuritySummary(membership.tenantId, sinceHours);

  return NextResponse.json({ events, summary });
}
