/**
 * Retention service (Plan 9C.3).
 * Defines retention policies for each data class, evaluates effective retention
 * for tenant-specific overrides, and manages retention locks (legal hold, audit).
 */

import { db, processingPurposes, eq } from "db";
import { DATA_CLASS_DEFINITIONS, getDataClass, type DataClass } from "@/lib/security/data-classification";

export type RetentionBasis = "regulatory" | "contractual" | "legitimate_interest" | "consent";

export type RetentionPolicy = {
  dataClass: DataClass;
  retentionMonths: number;
  basis: RetentionBasis;
  allowsDeletion: boolean;
  allowsAnonymization: boolean;
  description: string;
};

const DEFAULT_RETENTION_POLICIES: Record<DataClass, RetentionPolicy> = {
  public_metadata: {
    dataClass: "public_metadata",
    retentionMonths: 84,
    basis: "legitimate_interest",
    allowsDeletion: true,
    allowsAnonymization: true,
    description: "Non-sensitive metadata retained 7 years",
  },
  internal_operational: {
    dataClass: "internal_operational",
    retentionMonths: 84,
    basis: "legitimate_interest",
    allowsDeletion: false,
    allowsAnonymization: false,
    description: "Operational records retained 7 years per regulatory requirement",
  },
  personal_data: {
    dataClass: "personal_data",
    retentionMonths: 60,
    basis: "contractual",
    allowsDeletion: true,
    allowsAnonymization: true,
    description: "Personal data retained 5 years after relationship ends",
  },
  sensitive_personal: {
    dataClass: "sensitive_personal",
    retentionMonths: 60,
    basis: "regulatory",
    allowsDeletion: true,
    allowsAnonymization: true,
    description: "Special category data retained 5 years",
  },
  financial_payment: {
    dataClass: "financial_payment",
    retentionMonths: 120,
    basis: "regulatory",
    allowsDeletion: false,
    allowsAnonymization: false,
    description: "Financial records retained 10 years (AMLD5, Czech financial regulation)",
  },
  document_original: {
    dataClass: "document_original",
    retentionMonths: 84,
    basis: "regulatory",
    allowsDeletion: true,
    allowsAnonymization: false,
    description: "Original documents retained 7 years",
  },
  extracted_payload: {
    dataClass: "extracted_payload",
    retentionMonths: 60,
    basis: "contractual",
    allowsDeletion: true,
    allowsAnonymization: true,
    description: "AI-extracted fields retained 5 years",
  },
  audit_security: {
    dataClass: "audit_security",
    retentionMonths: 84,
    basis: "regulatory",
    allowsDeletion: false,
    allowsAnonymization: false,
    description: "Audit and security logs retained 7 years",
  },
};

// In-memory retention lock store (writable without DB migration for Plan 9)
const retentionLocks = new Map<string, { lockedAt: Date; reason: string; lockedBy: string }>();

function lockKey(tenantId: string, entityType: string, entityId?: string): string {
  return `${tenantId}:${entityType}:${entityId ?? "*"}`;
}

export function getRetentionPolicy(dataClass: DataClass): RetentionPolicy {
  return DEFAULT_RETENTION_POLICIES[dataClass];
}

export function getEntityRetentionPolicy(entityType: string): RetentionPolicy {
  const dataClass = getDataClass(entityType);
  return getRetentionPolicy(dataClass);
}

export async function getEffectiveRetention(
  tenantId: string,
  entityType: string
): Promise<RetentionPolicy & { tenantOverrideMonths?: number; source: "default" | "tenant_override" }> {
  const defaultPolicy = getEntityRetentionPolicy(entityType);

  // Look for tenant-specific processing purpose override
  const purposes = await db
    .select({ retentionMonths: processingPurposes.retentionMonths })
    .from(processingPurposes)
    .where(eq(processingPurposes.tenantId, tenantId));

  // Use the maximum tenant purpose retention, then clamp to at least the regulatory minimum
  const tenantMonths = purposes
    .map((p) => p.retentionMonths)
    .filter((m): m is number => m !== null && m !== undefined);

  if (tenantMonths.length > 0) {
    const maxTenantMonths = Math.max(...tenantMonths);
    const effectiveMonths = Math.max(defaultPolicy.retentionMonths, maxTenantMonths);
    return {
      ...defaultPolicy,
      retentionMonths: effectiveMonths,
      tenantOverrideMonths: maxTenantMonths,
      source: "tenant_override",
    };
  }

  return { ...defaultPolicy, source: "default" };
}

export function addRetentionLock(
  tenantId: string,
  entityType: string,
  entityId: string,
  reason: string,
  lockedBy: string
): void {
  const key = lockKey(tenantId, entityType, entityId);
  retentionLocks.set(key, { lockedAt: new Date(), reason, lockedBy });
}

export function removeRetentionLock(
  tenantId: string,
  entityType: string,
  entityId: string
): boolean {
  return retentionLocks.delete(lockKey(tenantId, entityType, entityId));
}

export function isRetentionLocked(
  tenantId: string,
  entityType: string,
  entityId: string
): boolean {
  const specificKey = lockKey(tenantId, entityType, entityId);
  const wildcardKey = lockKey(tenantId, entityType);
  return retentionLocks.has(specificKey) || retentionLocks.has(wildcardKey);
}

export function getRetentionLock(
  tenantId: string,
  entityType: string,
  entityId: string
): { lockedAt: Date; reason: string; lockedBy: string } | null {
  const specificKey = lockKey(tenantId, entityType, entityId);
  const wildcardKey = lockKey(tenantId, entityType);
  return retentionLocks.get(specificKey) ?? retentionLocks.get(wildcardKey) ?? null;
}

export function canDeleteEntity(
  tenantId: string,
  entityType: string,
  entityId: string
): { canDelete: boolean; reason?: string } {
  const policy = getEntityRetentionPolicy(entityType);

  if (!policy.allowsDeletion) {
    return { canDelete: false, reason: `Data class ${policy.dataClass} does not allow deletion` };
  }

  if (isRetentionLocked(tenantId, entityType, entityId)) {
    const lock = getRetentionLock(tenantId, entityType, entityId);
    return { canDelete: false, reason: `Entity is under retention lock: ${lock?.reason}` };
  }

  return { canDelete: true };
}
