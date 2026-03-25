import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission } from "@/lib/auth/permissions";
import { getAdvisorSummary, getAdvisorPerformance } from "@/lib/analytics/advisor-performance";

export async function GET() {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const [summary, performance] = await Promise.all([
    getAdvisorSummary(membership.tenantId, userId),
    getAdvisorPerformance(membership.tenantId, userId),
  ]);

  return NextResponse.json({ summary, performance });
}
