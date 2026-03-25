import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership, hasPermission } from "@/lib/auth/get-membership";
import { resolveAnalyticsScope, canAccessAnalytics } from "@/lib/analytics/analytics-scope";
import { getTeamAnalyticsSummary, getTeamMemberComparison } from "@/lib/analytics/team-analytics";

export async function GET() {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  if (!canAccessAnalytics(membership.roleName, "team")) {
    return NextResponse.json({ error: "Requires Manager or higher role" }, { status: 403 });
  }

  const scope = await resolveAnalyticsScope(membership.tenantId, userId, membership.roleName);
  const [summary, comparison] = await Promise.all([
    getTeamAnalyticsSummary(scope),
    getTeamMemberComparison(scope),
  ]);

  return NextResponse.json({ summary, comparison });
}
