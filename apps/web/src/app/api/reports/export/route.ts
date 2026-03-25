import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { resolveAnalyticsScope } from "@/lib/analytics/analytics-scope";
import { canExport, maskSensitiveFields, logExport, formatCsv, formatJson } from "@/lib/analytics/export-governance";
import { generateReport, type ReportType } from "@/lib/analytics/reporting-service";

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

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
