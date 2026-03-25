/**
 * Sensitive action guard (Plan 9A.1).
 * Central registry for risk classification of sensitive platform actions.
 * Used to enforce re-auth, audit trails, and tenant isolation checks.
 */

import { logAudit } from "@/lib/audit";
import type { RoleName } from "@/lib/auth/permissions";

export type SensitiveActionType =
  | "payment_apply"
  | "client_data_update"
  | "document_export"
  | "policy_change"
  | "feature_rollout"
  | "assistant_capability_change"
  | "communication_send"
  | "gate_override"
  | "admin_config_change"
  | "bulk_delete"
  | "sensitive_document_view"
  | "cross_tenant_access"
  | "escalation_override"
  | "approval_override";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type SensitiveActionEntry = {
  actionType: SensitiveActionType;
  riskLevel: RiskLevel;
  requiresReauth: boolean;
  requiresAudit: boolean;
  requiresTenantMatch: boolean;
  allowedRoles?: RoleName[];
  description: string;
};

export const SENSITIVE_ACTIONS: SensitiveActionEntry[] = [
  {
    actionType: "payment_apply",
    riskLevel: "high",
    requiresReauth: false,
    requiresAudit: true,
    requiresTenantMatch: true,
    description: "Apply payment instructions to client portal",
  },
  {
    actionType: "client_data_update",
    riskLevel: "medium",
    requiresReauth: false,
    requiresAudit: true,
    requiresTenantMatch: true,
    description: "Update client personal data",
  },
  {
    actionType: "document_export",
    riskLevel: "high",
    requiresReauth: false,
    requiresAudit: true,
    requiresTenantMatch: true,
    description: "Export document or document data",
  },
  {
    actionType: "policy_change",
    riskLevel: "high",
    requiresReauth: true,
    requiresAudit: true,
    requiresTenantMatch: true,
    allowedRoles: ["Admin", "Director", "Manager"],
    description: "Change platform policy configuration",
  },
  {
    actionType: "feature_rollout",
    riskLevel: "critical",
    requiresReauth: true,
    requiresAudit: true,
    requiresTenantMatch: false,
    allowedRoles: ["Admin"],
    description: "Enable or disable a feature flag rollout",
  },
  {
    actionType: "assistant_capability_change",
    riskLevel: "high",
    requiresReauth: false,
    requiresAudit: true,
    requiresTenantMatch: true,
    allowedRoles: ["Admin", "Director"],
    description: "Modify AI assistant capabilities for tenant",
  },
  {
    actionType: "communication_send",
    riskLevel: "medium",
    requiresReauth: false,
    requiresAudit: true,
    requiresTenantMatch: true,
    description: "Send communication to client",
  },
  {
    actionType: "gate_override",
    riskLevel: "critical",
    requiresReauth: true,
    requiresAudit: true,
    requiresTenantMatch: true,
    allowedRoles: ["Admin", "Director", "Manager"],
    description: "Override a quality or apply gate",
  },
  {
    actionType: "admin_config_change",
    riskLevel: "high",
    requiresReauth: false,
    requiresAudit: true,
    requiresTenantMatch: true,
    allowedRoles: ["Admin", "Director"],
    description: "Change admin/platform configuration",
  },
  {
    actionType: "bulk_delete",
    riskLevel: "critical",
    requiresReauth: true,
    requiresAudit: true,
    requiresTenantMatch: true,
    allowedRoles: ["Admin"],
    description: "Bulk delete of records",
  },
  {
    actionType: "sensitive_document_view",
    riskLevel: "medium",
    requiresReauth: false,
    requiresAudit: true,
    requiresTenantMatch: true,
    description: "View a document marked sensitive",
  },
  {
    actionType: "cross_tenant_access",
    riskLevel: "critical",
    requiresReauth: true,
    requiresAudit: true,
    requiresTenantMatch: false,
    allowedRoles: ["Admin"],
    description: "Access data across tenant boundaries",
  },
  {
    actionType: "escalation_override",
    riskLevel: "high",
    requiresReauth: false,
    requiresAudit: true,
    requiresTenantMatch: true,
    allowedRoles: ["Admin", "Director", "Manager"],
    description: "Override an escalation decision",
  },
  {
    actionType: "approval_override",
    riskLevel: "high",
    requiresReauth: false,
    requiresAudit: true,
    requiresTenantMatch: true,
    allowedRoles: ["Admin", "Director"],
    description: "Override a required approval",
  },
];

export type SensitiveActionContext = {
  userId: string;
  tenantId: string;
  roleName: RoleName;
  entityTenantId?: string;
  request?: Request;
};

export type SensitiveActionResult = {
  allowed: boolean;
  requiresReauth: boolean;
  riskLevel: RiskLevel;
  reason?: string;
};

export function getSensitiveAction(actionType: SensitiveActionType): SensitiveActionEntry | undefined {
  return SENSITIVE_ACTIONS.find((a) => a.actionType === actionType);
}

export function requireTenantIsolation(userTenantId: string, entityTenantId: string): void {
  if (userTenantId !== entityTenantId) {
    throw new Error("Tenant isolation violation");
  }
}

export async function checkSensitiveAction(
  actionType: SensitiveActionType,
  context: SensitiveActionContext
): Promise<SensitiveActionResult> {
  const entry = getSensitiveAction(actionType);
  if (!entry) {
    return { allowed: true, requiresReauth: false, riskLevel: "low" };
  }

  if (entry.requiresTenantMatch && context.entityTenantId) {
    if (context.tenantId !== context.entityTenantId) {
      if (entry.requiresAudit) {
        await logAudit({
          tenantId: context.tenantId,
          userId: context.userId,
          action: `security:cross_tenant_attempt:${actionType}`,
          meta: { entityTenantId: context.entityTenantId, roleName: context.roleName },
          request: context.request,
        });
      }
      return {
        allowed: false,
        requiresReauth: false,
        riskLevel: "critical",
        reason: "Tenant isolation violation",
      };
    }
  }

  if (entry.allowedRoles && !entry.allowedRoles.includes(context.roleName)) {
    if (entry.requiresAudit) {
      await logAudit({
        tenantId: context.tenantId,
        userId: context.userId,
        action: `security:permission_denied:${actionType}`,
        meta: { roleName: context.roleName, requiredRoles: entry.allowedRoles },
        request: context.request,
      });
    }
    return {
      allowed: false,
      requiresReauth: false,
      riskLevel: entry.riskLevel,
      reason: `Role ${context.roleName} is not allowed to perform ${actionType}`,
    };
  }

  if (entry.requiresAudit && (entry.riskLevel === "high" || entry.riskLevel === "critical")) {
    await logAudit({
      tenantId: context.tenantId,
      userId: context.userId,
      action: `security:sensitive_action:${actionType}`,
      meta: { riskLevel: entry.riskLevel, roleName: context.roleName },
      request: context.request,
    });
  }

  return {
    allowed: true,
    requiresReauth: entry.requiresReauth,
    riskLevel: entry.riskLevel,
  };
}

export function getSensitiveActionsForRole(roleName: RoleName): SensitiveActionEntry[] {
  return SENSITIVE_ACTIONS.filter(
    (a) => !a.allowedRoles || a.allowedRoles.includes(roleName)
  );
}

export function isHighRiskAction(actionType: SensitiveActionType): boolean {
  const entry = getSensitiveAction(actionType);
  return entry ? (entry.riskLevel === "high" || entry.riskLevel === "critical") : false;
}
