/**
 * Admin permissions (Plan 8A.4).
 * Scope derivation and access controls for admin operations.
 */

import type { RoleName } from "@/lib/auth/permissions";
import type { SettingDomain } from "./settings-registry";

export type AdminScope =
  | "global_admin"
  | "tenant_admin"
  | "manager_admin"
  | "ops_admin"
  | "readonly_admin"
  | "no_admin";

const SCOPE_EDIT_DOMAINS: Record<AdminScope, SettingDomain[]> = {
  global_admin: [
    "tenant_profile", "ai_behavior", "review_policies", "apply_policies",
    "payment_policies", "communication_policies", "notification_policies",
    "automation_policies", "mobile_capture_policies", "feature_flags", "branding",
  ],
  tenant_admin: [
    "tenant_profile", "ai_behavior", "review_policies", "apply_policies",
    "payment_policies", "communication_policies", "notification_policies",
    "automation_policies", "mobile_capture_policies", "branding",
  ],
  manager_admin: [
    "review_policies", "apply_policies", "communication_policies", "notification_policies",
  ],
  ops_admin: [
    "notification_policies", "automation_policies", "mobile_capture_policies",
  ],
  readonly_admin: [],
  no_admin: [],
};

const SCOPE_VIEW_DOMAINS: Record<AdminScope, SettingDomain[]> = {
  global_admin: [
    "tenant_profile", "ai_behavior", "review_policies", "apply_policies",
    "payment_policies", "communication_policies", "notification_policies",
    "automation_policies", "mobile_capture_policies", "feature_flags", "branding",
  ],
  tenant_admin: [
    "tenant_profile", "ai_behavior", "review_policies", "apply_policies",
    "payment_policies", "communication_policies", "notification_policies",
    "automation_policies", "mobile_capture_policies", "branding",
  ],
  manager_admin: [
    "review_policies", "apply_policies", "communication_policies",
    "notification_policies", "automation_policies",
  ],
  ops_admin: [
    "notification_policies", "automation_policies", "mobile_capture_policies",
    "review_policies",
  ],
  readonly_admin: [
    "tenant_profile", "review_policies", "apply_policies", "payment_policies",
    "communication_policies",
  ],
  no_admin: [],
};

export function deriveAdminScope(roleName: RoleName): AdminScope {
  switch (roleName) {
    case "Admin": return "global_admin";
    case "Director": return "tenant_admin";
    case "Manager": return "manager_admin";
    case "Advisor": return "readonly_admin";
    case "Viewer": return "no_admin";
    case "Client": return "no_admin";
    default: return "no_admin";
  }
}

export function canEditSettings(scope: AdminScope, domain: SettingDomain): boolean {
  return SCOPE_EDIT_DOMAINS[scope].includes(domain);
}

export function canViewSettings(scope: AdminScope, domain: SettingDomain): boolean {
  return SCOPE_VIEW_DOMAINS[scope].includes(domain);
}

export function canAccessAdmin(scope: AdminScope): boolean {
  return scope !== "no_admin";
}

export function canManagePolicies(scope: AdminScope): boolean {
  return ["global_admin", "tenant_admin", "manager_admin"].includes(scope);
}

export function canManageFeatureFlags(scope: AdminScope): boolean {
  return scope === "global_admin";
}

export function canManageInstitutions(scope: AdminScope): boolean {
  return ["global_admin", "tenant_admin"].includes(scope);
}

export function canViewAudit(scope: AdminScope): boolean {
  return ["global_admin", "tenant_admin", "manager_admin", "ops_admin", "readonly_admin"].includes(scope);
}

/** Security events, provider status, dead-letter read access. */
export function canAccessSecurityConsole(scope: AdminScope): boolean {
  return ["global_admin", "tenant_admin", "manager_admin"].includes(scope);
}

/** Create/update/resolve incidents. */
export function canManageIncidents(scope: AdminScope): boolean {
  return ["global_admin", "tenant_admin"].includes(scope);
}

/** Retry/discard dead-letter items, toggle degraded mode. */
export function canManageOpsDeadLetter(scope: AdminScope): boolean {
  return ["global_admin", "tenant_admin"].includes(scope);
}

/** GDPR / subject-rights request handling. */
export function canManageComplianceRequests(scope: AdminScope): boolean {
  return ["global_admin", "tenant_admin"].includes(scope);
}
