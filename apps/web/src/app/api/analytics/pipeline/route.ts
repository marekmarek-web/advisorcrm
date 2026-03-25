import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { canAccessAnalytics } from "@/lib/analytics/analytics-scope";
import { getPipelineMetrics, getPipelineBreakdown, getPipelineLatency } from "@/lib/analytics/pipeline-analytics";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  if (!canAccessAnalytics(membership.roleName, "pipeline")) {
    return NextResponse.json({ error: "Requires Director or higher role" }, { status: 403 });
  }

  const url = new URL(request.url);
  const dimension = (url.searchParams.get("dimension") as "documentType" | "advisor" | "institution") ?? "documentType";

  const [metrics, breakdown, latency] = await Promise.all([
    getPipelineMetrics(membership.tenantId),
    getPipelineBreakdown(membership.tenantId, dimension),
    getPipelineLatency(membership.tenantId),
  ]);

  const res = NextResponse.json({ metrics, breakdown, latency });
  res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
  return res;
}
