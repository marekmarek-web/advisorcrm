import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { assertCapability } from "@/lib/billing/plan-access-guards";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";
import { hasPermission } from "@/lib/auth/permissions";
import { getTeamOperationsSummary } from "@/lib/execution/team-operations-summary";

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
      capability: "manager_summary",
    });
  } catch (e) {
    const r = nextResponseFromPlanOrQuotaError(e);
    if (r) return r;
    throw e;
  }

  if (!hasPermission(membership.roleName, "team_overview:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["Admin", "Director", "Manager"].includes(membership.roleName)) {
    return NextResponse.json({ error: "Requires Manager or higher role" }, { status: 403 });
  }

  const summary = await getTeamOperationsSummary(membership.tenantId);
  return NextResponse.json(summary);
}
