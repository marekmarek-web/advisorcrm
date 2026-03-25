/**
 * Document access policy (Plan 9A.3).
 * Centralized document access checks, audit logging, and access history.
 */

import { logAudit } from "@/lib/audit";
import { db, auditLog, eq, and, desc, like } from "db";
import type { RoleName } from "@/lib/auth/permissions";

export type DocumentAccessPurpose = "preview" | "download" | "export" | "processing" | "review";

export type DocumentAccessCheck = {
  documentId: string;
  tenantId: string;
  userId: string;
  roleName: RoleName;
  purpose: DocumentAccessPurpose;
  documentTenantId: string;
  isClientDoc?: boolean;
  visibleToClient?: boolean;
  isSensitive?: boolean;
  contactId?: string;
  documentContactId?: string;
};

export type DocumentAccessResult = {
  allowed: boolean;
  reason?: string;
  requiresAudit: boolean;
};

const ROLE_ALLOWED_PURPOSES: Record<RoleName, DocumentAccessPurpose[]> = {
  Admin: ["preview", "download", "export", "processing", "review"],
  Director: ["preview", "download", "export", "processing", "review"],
  Manager: ["preview", "download", "export", "review"],
  Advisor: ["preview", "download", "review"],
  Viewer: ["preview"],
  Client: ["preview", "download"],
};

export function checkDocumentAccess(check: DocumentAccessCheck): DocumentAccessResult {
  const { tenantId, documentTenantId, roleName, purpose, isClientDoc, visibleToClient, contactId, documentContactId } = check;

  // Tenant isolation
  if (documentTenantId && tenantId !== documentTenantId) {
    return { allowed: false, reason: "Tenant isolation violation", requiresAudit: true };
  }

  // Client-role restrictions
  if (roleName === "Client") {
    if (!visibleToClient) {
      return { allowed: false, reason: "Document not visible to client", requiresAudit: false };
    }
    if (contactId && documentContactId && contactId !== documentContactId) {
      return { allowed: false, reason: "Document belongs to a different client", requiresAudit: true };
    }
    if (purpose === "export" || purpose === "processing") {
      return { allowed: false, reason: "Clients cannot export or trigger processing", requiresAudit: false };
    }
  }

  // Role-based purpose check
  const allowedPurposes = ROLE_ALLOWED_PURPOSES[roleName] ?? [];
  if (!allowedPurposes.includes(purpose)) {
    return {
      allowed: false,
      reason: `Role ${roleName} cannot ${purpose} documents`,
      requiresAudit: false,
    };
  }

  // Sensitive documents require higher roles for export
  if (check.isSensitive && purpose === "export" && roleName === "Advisor") {
    return {
      allowed: false,
      reason: "Sensitive documents require Manager+ for export",
      requiresAudit: true,
    };
  }

  return {
    allowed: true,
    requiresAudit: purpose === "download" || purpose === "export" || check.isSensitive === true,
  };
}

export async function logDocumentAccess(
  check: DocumentAccessCheck,
  options?: { signedUrl?: string; request?: Request }
): Promise<void> {
  const action = `document:access:${check.purpose}`;

  await logAudit({
    tenantId: check.tenantId,
    userId: check.userId,
    action,
    entityType: "document",
    entityId: check.documentId,
    meta: {
      purpose: check.purpose,
      roleName: check.roleName,
      isSensitive: check.isSensitive ?? false,
    },
    request: options?.request,
  });
}

export type DocumentAccessHistoryEntry = {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  purpose: string;
  documentId: string | null;
  timestamp: string;
};

export async function getDocumentAccessHistory(
  tenantId: string,
  documentId?: string,
  limit = 50
): Promise<DocumentAccessHistoryEntry[]> {
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
        like(auditLog.action, "document:access:%"),
        ...(documentId ? [eq(auditLog.entityId as any, documentId)] : [])
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
      action: row.action,
      purpose: (meta.purpose as string) ?? row.action.replace("document:access:", ""),
      documentId: row.entityId?.toString() ?? null,
      timestamp: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
    };
  });
}
