/**
 * Role + permission checks (no DB, no Node APIs).
 * Client Components must import from this module — not from `@/lib/auth/*` —
 * so the bundler never pulls `get-membership` / `db-client` into the browser.
 */

export type RoleName = "Admin" | "Director" | "Manager" | "Advisor" | "Viewer" | "Client";

export type PermissionAction =
  | "contacts:read" | "contacts:write" | "contacts:delete" | "contacts:*"
  | "households:read" | "households:write" | "households:*"
  | "opportunities:*"
  | "tasks:read" | "tasks:write" | "tasks:*"
  | "events:read" | "events:write" | "events:*"
  | "documents:read" | "documents:write" | "documents:*"
  | "meeting_notes:read" | "meeting_notes:write" | "meeting_notes:*"
  | "export:*"
  | "team_overview:read" | "team_overview:write"
  | "team_calendar:read" | "team_calendar:write"
  | "team_goals:read" | "team_goals:write"
  | "team_members:read" | "team_members:write"
  | "financial_analyses:read" | "financial_analyses:write" | "financial_analyses:*"
  | "billing:read" | "billing:write"
  | "settings:read" | "settings:write"
  | "ai_assistant:use"
  | "ai_review:use"
  | "admin:*"
  | "notifications:read" | "notifications:write"
  | "production:read"
  | "client_zone:*"
  | "*";

const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  Admin: ["*"],
  Director: [
    "contacts:*",
    "households:*",
    "opportunities:*",
    "tasks:*",
    "events:*",
    "documents:*",
    "meeting_notes:*",
    "export:*",
    "team_overview:read",
    "team_overview:write",
    "team_calendar:read",
    "team_calendar:write",
    "team_goals:read",
    "team_goals:write",
    "team_members:read",
    "team_members:write",
    "financial_analyses:*",
    "billing:read",
    "settings:read",
    "ai_assistant:use",
    "ai_review:use",
    "notifications:read",
    "notifications:write",
    "production:read",
  ],
  Manager: [
    "contacts:*",
    "households:*",
    "opportunities:*",
    "tasks:*",
    "events:*",
    "documents:*",
    "meeting_notes:*",
    "export:*",
    "team_overview:read",
    "team_calendar:read",
    "team_calendar:write",
    "team_goals:read",
    "team_members:read",
    "financial_analyses:*",
    "ai_assistant:use",
    "ai_review:use",
    "notifications:read",
    "notifications:write",
    "production:read",
  ],
  Advisor: [
    "contacts:read",
    "contacts:write",
    "households:read",
    "households:write",
    "opportunities:*",
    "tasks:*",
    "events:*",
    "documents:*",
    "meeting_notes:*",
    "team_overview:read",
    "financial_analyses:read",
    "financial_analyses:write",
    "ai_assistant:use",
    "ai_review:use",
    "notifications:read",
    "production:read",
  ],
  Viewer: [
    "contacts:read",
    "households:read",
    "opportunities:read",
    "tasks:read",
    "events:read",
    "documents:read",
    "financial_analyses:read",
    "financial_analyses:write",
    "notifications:read",
  ],
  Client: ["client_zone:*"],
};

export function hasPermission(roleName: RoleName, action: string): boolean {
  const perms = ROLE_PERMISSIONS[roleName] ?? [];
  if (perms.includes("*")) return true;
  const [entity] = action.split(":");
  return perms.some((p) => p === action || p === `${entity}:*`);
}

export function getPermissionsForRole(roleName: RoleName): readonly string[] {
  return ROLE_PERMISSIONS[roleName] ?? [];
}

/** Higher number = more authority. Useful for hierarchy comparisons. */
const ROLE_RANK: Record<RoleName, number> = {
  Admin: 50,
  Director: 40,
  Manager: 30,
  Advisor: 20,
  Viewer: 10,
  Client: 0,
};

export function getRoleRank(roleName: RoleName): number {
  return ROLE_RANK[roleName] ?? 0;
}

export function isRoleAtLeast(current: RoleName, required: RoleName): boolean {
  return getRoleRank(current) >= getRoleRank(required);
}
