/**
 * Config audit service (Plan 8D.1).
 * Tracks changes to platform settings and policies via the audit_log table.
 */

import { logAudit } from "@/lib/audit";
import { db, auditLog, eq, and, desc } from "db";
import { like } from "drizzle-orm";

export type ConfigChangeEntry = {
  id: string;
  tenantId: string;
  userId: string | null;
  domain: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  reason?: string;
  timestamp: string;
  action: string;
};

export type PolicyChangeType = "create" | "update" | "disable" | "enable" | "delete";

export async function logConfigChange(params: {
  tenantId: string;
  userId: string;
  domain: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  reason?: string;
  request?: Request;
}): Promise<void> {
  await logAudit({
    tenantId: params.tenantId,
    userId: params.userId,
    action: `config:${params.domain}:update`,
    entityType: "setting",
    entityId: params.key,
    meta: {
      key: params.key,
      domain: params.domain,
      oldValue: params.oldValue,
      newValue: params.newValue,
      reason: params.reason ?? null,
    },
    request: params.request,
  });
}

export async function logPolicyChange(params: {
  tenantId: string;
  userId: string;
  policyId: string;
  changeType: PolicyChangeType;
  oldPolicy?: unknown;
  newPolicy?: unknown;
  reason?: string;
  request?: Request;
}): Promise<void> {
  await logAudit({
    tenantId: params.tenantId,
    userId: params.userId,
    action: `policy:${params.changeType}`,
    entityType: "policy",
    entityId: params.policyId,
    meta: {
      policyId: params.policyId,
      changeType: params.changeType,
      oldPolicy: params.oldPolicy ?? null,
      newPolicy: params.newPolicy ?? null,
      reason: params.reason ?? null,
    },
    request: params.request,
  });
}

export async function getConfigChangeHistory(
  tenantId: string,
  domain?: string,
  limit = 50
): Promise<ConfigChangeEntry[]> {
  const actionPattern = domain ? `config:${domain}:update` : "config:%";

  const rows = await db
    .select({
      id: auditLog.id,
      tenantId: auditLog.tenantId,
      userId: auditLog.userId,
      action: auditLog.action,
      entityId: auditLog.entityId,
      meta: auditLog.meta,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenantId, tenantId),
        like(auditLog.action, actionPattern)
      )
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId ?? null,
      domain: (meta.domain as string) ?? row.action.split(":")[1] ?? "unknown",
      key: (meta.key as string) ?? row.entityId ?? "unknown",
      oldValue: meta.oldValue ?? null,
      newValue: meta.newValue ?? null,
      reason: meta.reason as string | undefined,
      timestamp: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
      action: row.action,
    };
  });
}

export async function getPolicyChangeHistory(
  tenantId: string,
  limit = 50
): Promise<ConfigChangeEntry[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      tenantId: auditLog.tenantId,
      userId: auditLog.userId,
      action: auditLog.action,
      entityId: auditLog.entityId,
      meta: auditLog.meta,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenantId, tenantId),
        like(auditLog.action, "policy:%")
      )
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId ?? null,
      domain: "policy",
      key: (meta.policyId as string) ?? row.entityId ?? "unknown",
      oldValue: meta.oldPolicy ?? null,
      newValue: meta.newPolicy ?? null,
      reason: meta.reason as string | undefined,
      timestamp: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
      action: row.action,
    };
  });
}
