"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";
import { db, deadLetterItems, tenantSettings, eq, and, desc } from "db";
import { getEffectiveSettingValue } from "@/lib/admin/effective-settings-resolver";
import { validateSettingValue } from "@/lib/admin/settings-registry";

export type DeadLetterRow = {
  id: string;
  jobType: string;
  failureReason: string | null;
  attempts: number;
  status: string;
  correlationId: string | null;
  createdAt: string;
};

export type AiControlSettings = {
  assistantEnabled: boolean;
  maxAutomationLevel: string;
  assistantProfile: string;
  allowApplySuggestions: boolean;
};

export async function getDeadLetterItems(limit = 50): Promise<DeadLetterRow[]> {
  const auth = await requireAuthInAction();
  if (
    !hasPermission(auth.roleName as RoleName, "admin:*") &&
    !hasPermission(auth.roleName as RoleName, "settings:read")
  ) {
    throw new Error("Forbidden");
  }
  const rows = await db
    .select({
      id: deadLetterItems.id,
      jobType: deadLetterItems.jobType,
      failureReason: deadLetterItems.failureReason,
      attempts: deadLetterItems.attempts,
      status: deadLetterItems.status,
      correlationId: deadLetterItems.correlationId,
      createdAt: deadLetterItems.createdAt,
    })
    .from(deadLetterItems)
    .where(eq(deadLetterItems.tenantId, auth.tenantId))
    .orderBy(desc(deadLetterItems.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    jobType: r.jobType,
    failureReason: r.failureReason,
    attempts: r.attempts,
    status: r.status,
    correlationId: r.correlationId,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getAiControlSettings(): Promise<AiControlSettings> {
  const auth = await requireAuthInAction();
  if (
    !hasPermission(auth.roleName as RoleName, "admin:*") &&
    !hasPermission(auth.roleName as RoleName, "settings:read")
  ) {
    throw new Error("Forbidden");
  }
  const [assistantEnabled, maxAutomationLevel, assistantProfile, allowApplySuggestions] = await Promise.all([
    getEffectiveSettingValue<boolean>(auth.tenantId, "ai.assistant_enabled"),
    getEffectiveSettingValue<string>(auth.tenantId, "ai.max_automation_level"),
    getEffectiveSettingValue<string>(auth.tenantId, "ai.assistant_profile"),
    getEffectiveSettingValue<boolean>(auth.tenantId, "ai.allow_apply_suggestions"),
  ]);
  return {
    assistantEnabled: assistantEnabled ?? true,
    maxAutomationLevel: maxAutomationLevel ?? "draft_only",
    assistantProfile: assistantProfile ?? "balanced",
    allowApplySuggestions: allowApplySuggestions ?? false,
  };
}

export async function updateAiControlSetting(
  key: string,
  value: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "settings:write")) {
    return { ok: false, error: "Nedostatečná oprávnění." };
  }
  const validation = validateSettingValue(key, value);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  const [existing] = await db
    .select({ id: tenantSettings.id, version: tenantSettings.version })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, auth.tenantId), eq(tenantSettings.key, key)))
    .limit(1);

  if (existing) {
    await db
      .update(tenantSettings)
      .set({ value: value as Record<string, unknown>, updatedBy: auth.userId, updatedAt: new Date(), version: existing.version + 1 })
      .where(eq(tenantSettings.id, existing.id));
  } else {
    await db.insert(tenantSettings).values({
      tenantId: auth.tenantId,
      key,
      value: value as Record<string, unknown>,
      domain: "ai_behavior",
      updatedBy: auth.userId,
      version: 1,
    });
  }

  return { ok: true };
}
