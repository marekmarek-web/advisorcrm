/**
 * Central audit logging for sensitive operations.
 * Phase 0: document upload/delete, extraction lifecycle, corrections.
 * Do not log document content, full prompts, or PII in meta.
 */
import { db } from "db";
import { auditLog } from "db";

export type AuditMeta = Record<string, unknown>;

type AuditRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

function buildRequestContext(request: Request): AuditRequestContext {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = (forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null) ?? null;
  const userAgent = request.headers.get("user-agent");
  const requestId = request.headers.get("x-request-id");
  return { ipAddress, userAgent, requestId };
}

export async function logAudit(params: {
  tenantId: string;
  userId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  meta?: AuditMeta | null;
  request?: Request;
  requestContext?: AuditRequestContext;
}): Promise<void> {
  const { tenantId, userId, action, entityType, entityId, meta, request, requestContext } = params;
  const ctx = request ? buildRequestContext(request) : (requestContext ?? {});
  const finalMeta = {
    ...(meta ?? {}),
    ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
  };
  await db.insert(auditLog).values({
    tenantId,
    userId: userId ?? undefined,
    action,
    entityType: entityType ?? undefined,
    entityId: entityId ?? undefined,
    meta: finalMeta,
    ipAddress: ctx.ipAddress ?? undefined,
    userAgent: ctx.userAgent ?? undefined,
  });
}

/**
 * Fire-and-forget audit action logger.
 * Errors are caught silently so callers are never blocked.
 */
export function logAuditAction(params: {
  tenantId: string;
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}): void {
  db.insert(auditLog)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType ?? undefined,
      entityId: params.entityId ?? undefined,
      meta: params.meta ?? undefined,
    })
    .then(() => {})
    .catch(() => {});
}
