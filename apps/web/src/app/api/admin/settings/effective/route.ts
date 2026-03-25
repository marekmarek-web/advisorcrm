import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canViewSettings, canAccessAdmin } from "@/lib/admin/admin-permissions";
import { resolveEffectiveSettings } from "@/lib/admin/effective-settings-resolver";
import type { SettingDomain } from "@/lib/admin/settings-registry";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain") as SettingDomain | undefined;

  if (domain && !canViewSettings(scope, domain)) {
    return NextResponse.json({ error: "Forbidden for this domain" }, { status: 403 });
  }

  const settings = await resolveEffectiveSettings(membership.tenantId, domain ?? undefined);
  return NextResponse.json({ settings });
}
