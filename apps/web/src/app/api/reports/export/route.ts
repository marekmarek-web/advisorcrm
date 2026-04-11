import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { assertCapability } from "@/lib/billing/plan-access-guards";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";
import { resolveAnalyticsScope } from "@/lib/analytics/analytics-scope";
import { canExport, maskSensitiveFields, logExport, formatCsv, formatJson } from "@/lib/analytics/export-governance";
import { generateReport, type ReportType } from "@/lib/analytics/reporting-service";

export async function POST(request: Request) {
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

  const body = await request.json();
  const { type, format = "json" } = body as { type?: ReportType; format?: "csv" | "json" };

  if (!type) return NextResponse.json({ error: "Missing report type" }, { status: 400 });

  if (!canExport(membership.roleName, type)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const scope = await resolveAnalyticsScope(membership.tenantId, userId, membership.roleName);
  const report = await generateReport(type, scope);

  for (const section of report.sections) {
    section.data = maskSensitiveFields(section.data, membership.roleName);
  }

  await logExport(membership.tenantId, userId, type, format);

  if (format === "csv") {
    const csv = formatCsv(report);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json(JSON.parse(formatJson(report)));
}
