import "server-only";

import { db, memberships, roles, userProfiles } from "db";
import { and, eq, inArray } from "db";
import type { RoleName } from "@/lib/auth/permissions";
import type { TeamOverviewScope, TeamHierarchyMember, TeamTreeNode } from "./team-hierarchy-types";
import { getVisibleUserIdsFromMembers } from "./team-hierarchy-types";

export type { TeamOverviewScope, TeamHierarchyMember, TeamTreeNode } from "./team-hierarchy-types";
export { resolveScopeForRole, getVisibleUserIdsFromMembers } from "./team-hierarchy-types";

const TEAM_ROLE_NAMES = ["Admin", "Director", "Manager", "Advisor", "Viewer"] as const;

export async function listTenantHierarchyMembers(tenantId: string): Promise<TeamHierarchyMember[]> {
  const rows = await db
    .select({
      userId: memberships.userId,
      parentId: memberships.parentId,
      roleName: roles.name,
      joinedAt: memberships.joinedAt,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
      careerProgram: memberships.careerProgram,
      careerTrack: memberships.careerTrack,
      careerPositionCode: memberships.careerPositionCode,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, memberships.userId))
    .where(and(eq(memberships.tenantId, tenantId), inArray(roles.name, TEAM_ROLE_NAMES as unknown as string[])));

  return rows.map((r) => ({
    userId: r.userId,
    parentId: r.parentId ?? null,
    roleName: r.roleName,
    joinedAt: r.joinedAt,
    displayName: r.fullName?.trim() || null,
    email: r.email?.trim() || null,
    careerProgram: r.careerProgram ?? null,
    careerTrack: r.careerTrack ?? null,
    careerPositionCode: r.careerPositionCode ?? null,
  }));
}

export async function getVisibleUserIds(
  tenantId: string,
  currentUserId: string,
  roleName: RoleName,
  requestedScope?: TeamOverviewScope
): Promise<string[]> {
  const members = await listTenantHierarchyMembers(tenantId);
  return getVisibleUserIdsFromMembers(members, currentUserId, roleName, requestedScope);
}

function buildNode(
  userId: string,
  byUser: Map<string, TeamHierarchyMember>,
  byParent: Map<string, TeamHierarchyMember[]>,
  depth: number
): TeamTreeNode | null {
  const member = byUser.get(userId);
  if (!member) return null;
  const children = (byParent.get(userId) ?? [])
    .map((child) => buildNode(child.userId, byUser, byParent, depth + 1))
    .filter((v): v is TeamTreeNode => v != null);
  return { ...member, depth, children };
}

export async function getTeamTree(
  tenantId: string,
  currentUserId: string,
  roleName: RoleName,
  requestedScope?: TeamOverviewScope
): Promise<TeamTreeNode[]> {
  const members = await listTenantHierarchyMembers(tenantId);
  const visibleIds = new Set(getVisibleUserIdsFromMembers(members, currentUserId, roleName, requestedScope));
  const filtered = members.filter((m) => visibleIds.has(m.userId));
  const byUser = new Map(filtered.map((m) => [m.userId, m]));
  const byParent = new Map<string, TeamHierarchyMember[]>();
  for (const m of filtered) {
    if (!m.parentId || !visibleIds.has(m.parentId)) continue;
    const bucket = byParent.get(m.parentId) ?? [];
    bucket.push(m);
    byParent.set(m.parentId, bucket);
  }

  const roots = filtered.filter((m) => !m.parentId || !visibleIds.has(m.parentId));
  const nodes = roots
    .map((r) => buildNode(r.userId, byUser, byParent, 0))
    .filter((v): v is TeamTreeNode => v != null);
  return nodes;
}
