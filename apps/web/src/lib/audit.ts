/**
 * Central audit logging for sensitive operations.
 * Phase 0: document upload/delete, extraction lifecycle, corrections.
 * Do not log document content, full prompts, or PII in meta.
 */
import { db } from "db";
import { auditLog } from "db";

export type AuditMeta = Record<string, unknown>;

export async function logAudit(params: {
  tenantId: string;
  userId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  meta?: AuditMeta | null;
}): Promise<void> {
  const { tenantId, userId, action, entityType, entityId, meta } = params;
  await db.insert(auditLog).values({
    tenantId,
    userId: userId ?? undefined,
    action,
    entityType: entityType ?? undefined,
    entityId: entityId ?? undefined,
    meta: meta ?? undefined,
  });
}
