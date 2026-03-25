import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canEditSettings, canAccessAdmin } from "@/lib/admin/admin-permissions";
import { getEffectiveAssistantProfile, isCapabilityEnabled, getEnabledCapabilities, setTenantAssistantProfile } from "@/lib/admin/assistant-governance";
import { logConfigChange } from "@/lib/admin/config-audit";

export async function GET() {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profile = getEffectiveAssistantProfile(membership.tenantId);
  const enabledCapabilities = getEnabledCapabilities(membership.tenantId);

  return NextResponse.json({ profile, enabledCapabilities });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canEditSettings(scope, "ai_behavior")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { profileId, reason }: { profileId: string; reason?: string } = body;

  if (!profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });

  const currentProfile = getEffectiveAssistantProfile(membership.tenantId);
  setTenantAssistantProfile(membership.tenantId, profileId);

  await logConfigChange({
    tenantId: membership.tenantId,
    userId,
    domain: "ai_behavior",
    key: "ai.assistant_profile",
    oldValue: currentProfile.profileId,
    newValue: profileId,
    reason,
    request,
  });

  const newProfile = getEffectiveAssistantProfile(membership.tenantId);
  return NextResponse.json({ success: true, profile: newProfile });
}
