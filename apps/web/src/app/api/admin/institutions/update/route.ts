import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canManageInstitutions } from "@/lib/admin/admin-permissions";
import { getInstitutionProfile, getInstitutionApplyRules } from "@/lib/admin/institution-rules";
import { logConfigChange } from "@/lib/admin/config-audit";

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canManageInstitutions(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { institutionCode, applyRulesOverride, reason } = body;

  if (!institutionCode) return NextResponse.json({ error: "institutionCode is required" }, { status: 400 });

  const profile = getInstitutionProfile(institutionCode);
  if (!profile) return NextResponse.json({ error: "Unknown institution code" }, { status: 400 });

  const currentRules = getInstitutionApplyRules(institutionCode);

  await logConfigChange({
    tenantId: membership.tenantId,
    userId,
    domain: "tenant_profile",
    key: `institution.${institutionCode}.applyRules`,
    oldValue: currentRules,
    newValue: applyRulesOverride,
    reason,
    request,
  });

  return NextResponse.json({ success: true, institutionCode, applyRulesOverride });
}
