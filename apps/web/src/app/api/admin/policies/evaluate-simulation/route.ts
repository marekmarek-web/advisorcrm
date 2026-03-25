import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canManagePolicies } from "@/lib/admin/admin-permissions";
import { simulatePolicyOutcome } from "@/lib/admin/policy-simulation";
import type { PolicyType, PolicyDefinition } from "@/lib/admin/policy-engine";

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canManagePolicies(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { policyType, testContext, overridePolicies }: {
    policyType: PolicyType;
    testContext: Record<string, unknown>;
    overridePolicies?: PolicyDefinition[];
  } = body;

  if (!policyType || !testContext) {
    return NextResponse.json({ error: "policyType and testContext are required" }, { status: 400 });
  }

  const result = simulatePolicyOutcome(policyType, testContext, {
    tenantId: membership.tenantId,
    overridePolicies,
  });

  return NextResponse.json({ simulation: result });
}
