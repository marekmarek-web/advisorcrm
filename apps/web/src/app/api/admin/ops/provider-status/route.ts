import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canAccessAdmin, canAccessSecurityConsole } from "@/lib/admin/admin-permissions";
import { getProviderStatusReport, getUnhealthyProviders } from "@/lib/resilience/provider-fallbacks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope) || !canAccessSecurityConsole(scope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const unhealthyOnly = url.searchParams.get("unhealthyOnly") === "1";

  if (unhealthyOnly) {
    return NextResponse.json({ providers: getUnhealthyProviders() });
  }

  return NextResponse.json({ providers: getProviderStatusReport() });
}
