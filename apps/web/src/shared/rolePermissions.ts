/**
 * Role + permission checks (no DB, no Node APIs).
 * Client Components must import from this module — not from `@/lib/auth/*` —
 * so the bundler never pulls `get-membership` / `db-client` into the browser.
 */

export type RoleName = "Admin" | "Director" | "Manager" | "Advisor" | "Viewer" | "Client";

export function hasPermission(roleName: RoleName, action: string): boolean {
  const admin = ["*"];
  const director = [
    "contacts:*",
    "households:*",
    "opportunities:*",
    "tasks:*",
    "events:*",
    "documents:*",
    "meeting_notes:*",
    "export:*",
    "team_overview:read",
    "team_calendar:write",
    "financial_analyses:*",
  ];
  const manager = [
    "contacts:*",
    "households:*",
    "opportunities:*",
    "tasks:*",
    "events:*",
    "documents:*",
    "meeting_notes:*",
    "export:*",
    "team_overview:read",
    "team_calendar:write",
    "financial_analyses:*",
  ];
  const advisor = [
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
  ];
  const viewer = [
    "contacts:read",
    "households:read",
    "opportunities:read",
    "tasks:read",
    "events:read",
    "documents:read",
    "financial_analyses:read",
    "financial_analyses:write",
  ];
  const client = ["client_zone:*"];
  const map: Record<RoleName, string[]> = {
    Admin: admin,
    Director: director,
    Manager: manager,
    Advisor: advisor,
    Viewer: viewer,
    Client: client,
  };
  const perms = map[roleName as RoleName] ?? [];
  if (perms.includes("*")) return true;
  const [entity, act] = action.split(":");
  return perms.some((p) => p === action || p === `${entity}:*`);
}
