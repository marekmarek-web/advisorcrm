/**
 * Assistant permissions (Plan 5D.3).
 * Role-based action matrix for controlling assistant feature access.
 */

export type AssistantAction =
  | "chat"
  | "view_summaries"
  | "create_draft"
  | "approve_draft"
  | "suggest_actions"
  | "override_quality_gates"
  | "debug"
  | "run_evals"
  | "view_audit";

type RoleName = "Admin" | "Director" | "Manager" | "Advisor" | "Viewer" | "Client";

type PermissionMatrix = Record<RoleName, Set<AssistantAction>>;

const PERMISSIONS: PermissionMatrix = {
  Admin: new Set([
    "chat", "view_summaries", "create_draft", "approve_draft",
    "suggest_actions", "override_quality_gates", "debug", "run_evals", "view_audit",
  ]),
  Director: new Set([
    "chat", "view_summaries", "create_draft", "approve_draft",
    "suggest_actions", "override_quality_gates", "view_audit",
  ]),
  Manager: new Set([
    "chat", "view_summaries", "create_draft", "approve_draft",
    "suggest_actions", "override_quality_gates",
  ]),
  Advisor: new Set([
    "chat", "view_summaries", "create_draft", "suggest_actions",
  ]),
  Viewer: new Set([
    "chat",
  ]),
  Client: new Set([
    "chat",
  ]),
};

export type PermissionCheckResult = {
  allowed: boolean;
  reason?: string;
};

export function canPerformAssistantAction(
  roleName: string,
  action: AssistantAction,
): PermissionCheckResult {
  const role = roleName as RoleName;
  const allowed = PERMISSIONS[role];
  if (!allowed) {
    return { allowed: false, reason: `Unknown role: ${roleName}` };
  }
  if (allowed.has(action)) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Role ${roleName} cannot perform ${action}` };
}

export function getAllowedActions(roleName: string): AssistantAction[] {
  const role = roleName as RoleName;
  const set = PERMISSIONS[role];
  if (!set) return [];
  return [...set];
}
