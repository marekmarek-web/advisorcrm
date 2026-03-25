import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { getQualitySummary } from "@/lib/ai/quality-metrics-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getMembership(userId);
  if (!membership || !["admin", "director"].includes(membership.roleName.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = url.searchParams.get("days");
  const windowDays = days ? parseInt(days, 10) : undefined;

  const summary = await getQualitySummary(membership.tenantId, windowDays);
  return NextResponse.json(summary);
}
