import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { canAccessAnalytics } from "@/lib/analytics/analytics-scope";
import { getExecutiveKPIs, getExecutiveFunnel, getExecutiveTrends } from "@/lib/analytics/executive-analytics";

export async function GET() {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  if (!canAccessAnalytics(membership.roleName, "executive")) {
    return NextResponse.json({ error: "Requires Director or higher role" }, { status: 403 });
  }

  const [kpis, funnel, trends] = await Promise.all([
    getExecutiveKPIs(membership.tenantId),
    getExecutiveFunnel(membership.tenantId),
    getExecutiveTrends(membership.tenantId),
  ]);

  return NextResponse.json({ kpis, funnel, trends });
}
