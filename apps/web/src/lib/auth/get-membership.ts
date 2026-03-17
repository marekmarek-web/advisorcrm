import { db, memberships, roles, clientContacts, contacts } from "db";
import { eq, and } from "db";

export type RoleName = "Admin" | "Manager" | "Advisor" | "Viewer" | "Client";

export type MembershipResult = {
  membershipId: string;
  tenantId: string;
  roleId: string;
  roleName: string;
  contactId?: string | null;
};

export async function getMembership(userId: string): Promise<MembershipResult | null> {
  const rows = await db
    .select({
      membershipId: memberships.id,
      tenantId: memberships.tenantId,
      roleId: memberships.roleId,
      roleName: roles.name,
      contactId: clientContacts.contactId,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .leftJoin(
      clientContacts,
      and(eq(memberships.tenantId, clientContacts.tenantId), eq(memberships.userId, clientContacts.userId))
    )
    .where(eq(memberships.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    membershipId: row.membershipId,
    tenantId: row.tenantId,
    roleId: row.roleId,
    roleName: row.roleName,
    contactId: row.contactId ?? undefined,
  };
}

export async function requireMembership(userId: string) {
  const m = await getMembership(userId);
  if (!m) throw new Error("Unauthorized: no tenant membership");
  return m;
}

/** V demo režimu: vrátí první kontakt tenanta (pro zobrazení klientského portálu bez přihlášení). */
export async function getDemoClientContactId(tenantId: string): Promise<string | null> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId))
    .limit(1);
  return rows[0]?.id ?? null;
}

export function hasPermission(roleName: RoleName, action: string): boolean {
  const admin = ["*"];
  const manager = ["contacts:*", "households:*", "opportunities:*", "tasks:*", "events:*", "documents:*", "meeting_notes:*", "export:*", "team_overview:read", "team_calendar:write"];
  const advisor = ["contacts:read", "contacts:write", "households:read", "households:write", "opportunities:*", "tasks:*", "events:*", "documents:*", "meeting_notes:*"];
  const viewer = ["contacts:read", "households:read", "opportunities:read", "tasks:read", "events:read", "documents:read"];
  const client = ["client_zone:*"];
  const map: Record<RoleName, string[]> = {
    Admin: admin,
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
