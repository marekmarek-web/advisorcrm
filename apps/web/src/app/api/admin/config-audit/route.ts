import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canViewAudit } from "@/lib/admin/admin-permissions";
import { getConfigChangeHistory, getPolicyChangeHistory } from "@/lib/admin/config-audit";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canViewAudit(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const type = url.searchParams.get("type"); // "config" or "policy"

  const [configHistory, policyHistory] = await Promise.all([
    type !== "policy" ? getConfigChangeHistory(membership.tenantId, domain, limit) : Promise.resolve([]),
    type !== "config" ? getPolicyChangeHistory(membership.tenantId, limit) : Promise.resolve([]),
  ]);

  const history = [...configHistory, ...policyHistory].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ).slice(0, limit);

  return NextResponse.json({ history, total: history.length });
}
