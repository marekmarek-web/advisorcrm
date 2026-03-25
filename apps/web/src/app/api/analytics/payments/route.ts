import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { canAccessAnalytics } from "@/lib/analytics/analytics-scope";
import { getPaymentMetrics, getPaymentQualityBreakdown } from "@/lib/analytics/payment-analytics";

export async function GET() {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  if (!canAccessAnalytics(membership.roleName, "team")) {
    return NextResponse.json({ error: "Requires Manager or higher role" }, { status: 403 });
  }

  const [metrics, quality] = await Promise.all([
    getPaymentMetrics(membership.tenantId),
    getPaymentQualityBreakdown(membership.tenantId),
  ]);

  return NextResponse.json({ metrics, quality });
}
