import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canManagePolicies, canAccessAdmin } from "@/lib/admin/admin-permissions";
import { getDefaultPolicies, getActivePolicies } from "@/lib/admin/policy-engine";
import type { PolicyType } from "@/lib/admin/policy-engine";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const policyType = url.searchParams.get("type") as PolicyType | undefined;

  const policies = policyType
    ? getActivePolicies(policyType, membership.tenantId)
    : getDefaultPolicies();

  return NextResponse.json({ policies });
}
