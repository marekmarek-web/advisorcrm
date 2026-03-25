import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canEditSettings, canAccessAdmin } from "@/lib/admin/admin-permissions";
import { validateSettingValue, getSettingDefinition } from "@/lib/admin/settings-registry";
import type { SettingDomain } from "@/lib/admin/settings-registry";
import { db, tenantSettings, eq, and } from "db";
import { logConfigChange } from "@/lib/admin/config-audit";

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { key, value, reason } = body;

  if (!key || value === undefined) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 });
  }

  const def = getSettingDefinition(key);
  if (!def) return NextResponse.json({ error: "Unknown setting key" }, { status: 400 });

  if (!canEditSettings(scope, def.domain as SettingDomain)) {
    return NextResponse.json({ error: "Forbidden for this domain" }, { status: 403 });
  }

  const validation = validateSettingValue(key, value);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const existing = await db
    .select({ value: tenantSettings.value, version: tenantSettings.version })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, membership.tenantId), eq(tenantSettings.key, key)));

  const oldValue = existing[0]?.value ?? def.defaultValue;

  if (existing.length > 0) {
    await db
      .update(tenantSettings)
      .set({ value: value as any, updatedBy: userId, updatedAt: new Date(), version: (existing[0]!.version ?? 0) + 1 })
      .where(and(eq(tenantSettings.tenantId, membership.tenantId), eq(tenantSettings.key, key)));
  } else {
    await db.insert(tenantSettings).values({
      tenantId: membership.tenantId,
      key,
      value: value as any,
      domain: def.domain,
      updatedBy: userId,
      version: 1,
    });
  }

  await logConfigChange({
    tenantId: membership.tenantId,
    userId,
    domain: def.domain,
    key,
    oldValue,
    newValue: value,
    reason,
    request,
  });

  return NextResponse.json({ success: true, key, value });
}
