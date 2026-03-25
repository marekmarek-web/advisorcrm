import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canManageFeatureFlags, canAccessAdmin } from "@/lib/admin/admin-permissions";
import { getAllFlagStates } from "@/lib/admin/feature-flags";

export async function GET() {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const flags = getAllFlagStates(membership.tenantId);
  return NextResponse.json({ flags });
}
