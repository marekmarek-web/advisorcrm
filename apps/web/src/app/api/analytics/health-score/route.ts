import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { computeHealthScore } from "@/lib/analytics/health-scoring";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const url = new URL(request.url);
  const entity = (url.searchParams.get("entity") as "advisor" | "team" | "pipeline" | "payments" | "assistant") ?? "advisor";

  const score = await computeHealthScore(membership.tenantId, entity, userId);
  return NextResponse.json(score);
}
