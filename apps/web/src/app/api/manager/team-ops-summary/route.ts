import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership, hasPermission } from "@/lib/auth/get-membership";
import { getTeamOperationsSummary } from "@/lib/execution/team-operations-summary";

export async function GET() {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  if (!hasPermission(membership.roleName, "team_overview:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["Admin", "Director", "Manager"].includes(membership.roleName)) {
    return NextResponse.json({ error: "Requires Manager or higher role" }, { status: 403 });
  }

  const summary = await getTeamOperationsSummary(membership.tenantId);
  return NextResponse.json(summary);
}
