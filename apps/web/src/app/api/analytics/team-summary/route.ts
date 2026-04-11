import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { assertCapability } from "@/lib/billing/plan-access-guards";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";
import { hasPermission } from "@/lib/auth/permissions";
import { resolveAnalyticsScope, canAccessAnalytics } from "@/lib/analytics/analytics-scope";
import { getTeamAnalyticsSummary, getTeamMemberComparison } from "@/lib/analytics/team-analytics";

export async function GET() {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  try {
    await assertCapability({
      tenantId: membership.tenantId,
      userId,
      email: user?.id === userId ? user.email ?? null : null,
      capability: "team_overview",
    });
  } catch (e) {
    const r = nextResponseFromPlanOrQuotaError(e);
    if (r) return r;
    throw e;
  }

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
