/**
 * Security audit service (Plan 9C.1).
 * Logs security events (auth failures, access violations, suspicious patterns)
 * to the audit_log table with a structured security: prefix.
 */

import { logAudit } from "@/lib/audit";
import { db, auditLog, eq, and, desc, gte } from "db";
import { like } from "drizzle-orm";

export type SecurityEventType =
  | "auth_failure"
  | "auth_success"
  | "session_expired"
  | "permission_denied"
  | "cross_tenant_attempt"
  | "rate_limit_exceeded"
  | "abuse_detected"
  | "suspicious_pattern"
  | "sensitive_access"
  | "bulk_operation"
  | "credential_change"
  | "api_key_usage"
  | "export_triggered"
  | "document_accessed"
  | "cron_auth_failure"
  | "service_error";

export type SecuritySeverity = "info" | "warning" | "high" | "critical";

export type SecurityEventContext = {
  tenantId: string;
  userId?: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  request?: Request;
  correlationId?: string;
};

const EVENT_SEVERITY_DEFAULTS: Record<SecurityEventType, SecuritySeverity> = {
  auth_failure: "warning",
  auth_success: "info",
  session_expired: "info",
  permission_denied: "warning",
  cross_tenant_attempt: "critical",
  rate_limit_exceeded: "high",
  abuse_detected: "high",
  suspicious_pattern: "high",
  sensitive_access: "warning",
  bulk_operation: "high",
  credential_change: "high",
  api_key_usage: "info",
  export_triggered: "warning",
  document_accessed: "info",
  cron_auth_failure: "critical",
  service_error: "warning",
};

export function getDefaultSeverity(eventType: SecurityEventType): SecuritySeverity {
  return EVENT_SEVERITY_DEFAULTS[eventType] ?? "info";
}

export async function logSecurityEvent(ctx: SecurityEventContext): Promise<void> {
  const severity = ctx.severity ?? getDefaultSeverity(ctx.eventType);
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId ?? null,
    action: `security:${ctx.eventType}`,
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    meta: {
      severity,
      eventType: ctx.eventType,
      correlationId: ctx.correlationId ?? null,
      ...ctx.meta,
    },
    request: ctx.request,
  });
}

export type SecurityEventRow = {
  id: string;
  tenantId: string;
  userId: string | null;
  eventType: string;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  correlationId: string | null;
  meta: Record<string, unknown>;
  timestamp: string;
};

export async function getSecurityEvents(
  tenantId: string,
  options: {
    eventType?: SecurityEventType;
    severity?: SecuritySeverity;
    sinceHours?: number;
    limit?: number;
  } = {}
): Promise<SecurityEventRow[]> {
  const { eventType, sinceHours = 24, limit = 100 } = options;
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const actionPattern = eventType ? `security:${eventType}` : "security:%";

  const rows = await db
    .select({
      id: auditLog.id,
      tenantId: auditLog.tenantId,
      userId: auditLog.userId,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      meta: auditLog.meta,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenantId, tenantId),
        like(auditLog.action, actionPattern),
        gte(auditLog.createdAt, since)
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
      eventType: row.action.replace("security:", ""),
      severity: (meta.severity as string) ?? "info",
      entityType: row.entityType ?? null,
      entityId: row.entityId?.toString() ?? null,
      correlationId: (meta.correlationId as string) ?? null,
      meta,
      timestamp: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
    };
  });
}

export type SecuritySummary = {
  tenantId: string;
  periodHours: number;
  totalEvents: number;
  bySeverity: Record<SecuritySeverity, number>;
  byEventType: Record<string, number>;
  criticalEvents: SecurityEventRow[];
  uniqueUserIds: number;
};

export async function getSecuritySummary(
  tenantId: string,
  periodHours = 24
): Promise<SecuritySummary> {
  const events = await getSecurityEvents(tenantId, { sinceHours: periodHours, limit: 500 });

  const bySeverity: Record<SecuritySeverity, number> = {
    info: 0,
    warning: 0,
    high: 0,
    critical: 0,
  };
  const byEventType: Record<string, number> = {};
  const userIds = new Set<string>();

  for (const event of events) {
    const sev = event.severity as SecuritySeverity;
    if (sev in bySeverity) bySeverity[sev]++;
    byEventType[event.eventType] = (byEventType[event.eventType] ?? 0) + 1;
    if (event.userId) userIds.add(event.userId);
  }

  return {
    tenantId,
    periodHours,
    totalEvents: events.length,
    bySeverity,
    byEventType,
    criticalEvents: events.filter((e) => e.severity === "critical" || e.severity === "high"),
    uniqueUserIds: userIds.size,
  };
}
