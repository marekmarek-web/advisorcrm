import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { assertCapability } from "@/lib/billing/plan-access-guards";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";
import { resolveAnalyticsScope } from "@/lib/analytics/analytics-scope";
import { canExport } from "@/lib/analytics/export-governance";
import { generateReport, type ReportType } from "@/lib/analytics/reporting-service";

const VALID_TYPES: ReportType[] = [
  "advisor_weekly", "manager_team", "executive_monthly",
  "pipeline_quality", "payment_readiness", "assistant_adoption",
];

export async function GET(request: Request) {
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
      capability: "reports_advanced",
    });
  } catch (e) {
    const r = nextResponseFromPlanOrQuotaError(e);
    if (r) return r;
    throw e;
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") as ReportType | null;

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid report type", validTypes: VALID_TYPES }, { status: 400 });
  }

  if (!canExport(membership.roleName, type)) {
    return NextResponse.json({ error: "Insufficient permissions for this report type" }, { status: 403 });
  }

  const scope = await resolveAnalyticsScope(membership.tenantId, userId, membership.roleName);
  const report = await generateReport(type, scope);

  return NextResponse.json(report);
}
