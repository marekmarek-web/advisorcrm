/**
 * Central audit logging for sensitive operations.
 * Phase 0: document upload/delete, extraction lifecycle, corrections.
 * Do not log document content, full prompts, or PII in meta.
 *
 * Runtime pod `aidvisora_app` (NOBYPASSRLS, FORCE RLS):
 *   `audit_log` tenant-scoped policy (rls-m8 core-tier) vyžaduje
 *   `app.tenant_id = tenant_id`. Audit callery jsou ale různorodé (actions,
 *   cron joby, webhooks) a píšou mimo caller-transakci. Abychom audit
 *   nepodmiňovali wrapperem v každém callsite, zapisujeme přes service-role
 *   (`dbService`) a vždy nastavíme GUC přes `withServiceTenantContext` —
 *   tím i po případném downgrade service role na NOBYPASSRLS policy projde.
 *
 *   Legacy hodnoty `tenantId = "system"` (image-intake cronu) nejsou platné
 *   UUID a do `audit_log.tenant_id (uuid)` by neprošly. V těch případech
 *   audit rovnou zahodíme + zalogujeme do console (fire-and-forget historie).
 */
import { auditLog } from "db";
import { withServiceTenantContext } from "@/lib/db/service-db";

export type AuditMeta = Record<string, unknown>;

export type AuditRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidTenantId(tenantId: string): boolean {
  return UUID_RE.test(tenantId);
}

/** Exported for background jobs that cannot keep the original Request alive. */
export function buildRequestContext(request: Request): AuditRequestContext {
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

  if (!isValidTenantId(tenantId)) {
    console.warn("[audit] skipping log for non-uuid tenantId", { tenantId, action });
    return;
  }

  await withServiceTenantContext(
    { tenantId, userId: userId ?? null },
    async (tx) => {
      await tx.insert(auditLog).values({
        tenantId,
        userId: userId ?? undefined,
        action,
        entityType: entityType ?? undefined,
        entityId: entityId ?? undefined,
        meta: finalMeta,
        ipAddress: ctx.ipAddress ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
      });
    },
  );
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
  if (!isValidTenantId(params.tenantId)) {
    console.info("[audit] action (non-uuid tenant, skip DB)", {
      tenantId: params.tenantId,
      action: params.action,
    });
    return;
  }

  withServiceTenantContext(
    { tenantId: params.tenantId, userId: params.userId },
    async (tx) => {
      await tx.insert(auditLog).values({
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType ?? undefined,
        entityId: params.entityId ?? undefined,
        meta: params.meta ?? undefined,
      });
    },
  )
    .then(() => {})
    .catch(() => {});
}
