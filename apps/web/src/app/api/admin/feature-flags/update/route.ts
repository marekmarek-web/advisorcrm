import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canManageFeatureFlags } from "@/lib/admin/admin-permissions";
import { setFeatureOverride, clearFeatureOverride, getFlagDefinition } from "@/lib/admin/feature-flags";
import { logConfigChange } from "@/lib/admin/config-audit";

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canManageFeatureFlags(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { flagCode, enabled, clear, reason }: { flagCode: string; enabled?: boolean; clear?: boolean; reason?: string } = body;

  if (!flagCode) return NextResponse.json({ error: "flagCode is required" }, { status: 400 });

  const flag = getFlagDefinition(flagCode);
  if (!flag) return NextResponse.json({ error: "Unknown flag code" }, { status: 400 });

  if (clear) {
    clearFeatureOverride(flagCode, membership.tenantId);
    await logConfigChange({
      tenantId: membership.tenantId,
      userId,
      domain: "feature_flags",
      key: flagCode,
      oldValue: enabled,
      newValue: "cleared",
      reason,
      request,
    });
    return NextResponse.json({ success: true, flagCode, cleared: true });
  }

  if (enabled === undefined) return NextResponse.json({ error: "enabled is required" }, { status: 400 });

  setFeatureOverride(flagCode, membership.tenantId, enabled);

  await logConfigChange({
    tenantId: membership.tenantId,
    userId,
    domain: "feature_flags",
    key: flagCode,
    oldValue: flag.defaultEnabled,
    newValue: enabled,
    reason,
    request,
  });

  return NextResponse.json({ success: true, flagCode, enabled });
}
