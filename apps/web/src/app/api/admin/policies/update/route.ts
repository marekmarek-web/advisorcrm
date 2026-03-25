import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canManagePolicies } from "@/lib/admin/admin-permissions";
import { registerTenantPolicies, getActivePolicies } from "@/lib/admin/policy-engine";
import { logPolicyChange } from "@/lib/admin/config-audit";
import type { PolicyDefinition } from "@/lib/admin/policy-engine";

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canManagePolicies(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { policy, changeType = "update", reason }: { policy: PolicyDefinition; changeType?: string; reason?: string } = body;

  if (!policy?.policyId || !policy?.policyType) {
    return NextResponse.json({ error: "Invalid policy definition" }, { status: 400 });
  }

  const existing = getActivePolicies(policy.policyType, membership.tenantId)
    .find((p) => p.policyId === policy.policyId);

  const allPolicies = getActivePolicies(policy.policyType, membership.tenantId);
  const withoutCurrent = allPolicies.filter((p) => p.policyId !== policy.policyId);
  registerTenantPolicies(membership.tenantId, [...withoutCurrent, policy]);

  await logPolicyChange({
    tenantId: membership.tenantId,
    userId,
    policyId: policy.policyId,
    changeType: (changeType as any) ?? "update",
    oldPolicy: existing ?? null,
    newPolicy: policy,
    reason,
    request,
  });

  return NextResponse.json({ success: true, policyId: policy.policyId });
}
