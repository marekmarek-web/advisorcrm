import "server-only";

import { db, memberships, roles, userProfiles, teamMembers } from "db";
import { and, eq, inArray, or, isNull } from "db";
import type { RoleName } from "@/lib/auth/permissions";
import type { TeamOverviewScope, TeamHierarchyMember, TeamTreeNode } from "./team-hierarchy-types";
import { getVisibleUserIdsFromMembers } from "./team-hierarchy-types";

export type { TeamOverviewScope, TeamHierarchyMember, TeamTreeNode } from "./team-hierarchy-types";
export {
  resolveScopeForRole,
  getVisibleUserIdsFromMembers,
  defaultLandingScopeForRole,
} from "./team-hierarchy-types";

const TEAM_ROLE_NAMES = ["Admin", "Director", "Manager", "Advisor", "Viewer"] as const;

/**
 * Synteticky primární klíč pro external_manual členy (bez auth účtu).
 * Umožňuje existujícím pipeline (collectUserStats, visibility) pracovat
 * beze změny — neautoritativní cesty vrátí prázdný dataset a F3/F4 dodá
 * manual period overlay.
 */
export const EXTERNAL_MEMBER_USER_ID_PREFIX = "ext:";

export function isExternalMemberUserId(userId: string): boolean {
  return userId.startsWith(EXTERNAL_MEMBER_USER_ID_PREFIX);
}

export function externalMemberUserId(teamMemberId: string): string {
  return `${EXTERNAL_MEMBER_USER_ID_PREFIX}${teamMemberId}`;
}

export async function listTenantHierarchyMembers(tenantId: string): Promise<TeamHierarchyMember[]> {
  // F2 read adapter: team_members je source of truth. memberships join je kv\u016fli roleName
  // pro internal_user (external_manual nem\u00e1 role v RBAC \u2014 default "Advisor").
  const rows = await db
    .select({
      teamMemberId: teamMembers.id,
      authUserId: teamMembers.authUserId,
      parentMemberId: teamMembers.parentMemberId,
      memberKind: teamMembers.memberKind,
      status: teamMembers.status,
      joinedAt: teamMembers.joinedAt,
      displayName: teamMembers.displayName,
      tmEmail: teamMembers.email,
      tmCareerProgram: teamMembers.careerProgram,
      tmCareerTrack: teamMembers.careerTrack,
      tmCareerPositionCode: teamMembers.careerPositionCode,
      roleName: roles.name,
      profileFullName: userProfiles.fullName,
      profileEmail: userProfiles.email,
    })
    .from(teamMembers)
    .leftJoin(memberships, and(eq(memberships.tenantId, teamMembers.tenantId), eq(memberships.userId, teamMembers.authUserId)))
    .leftJoin(roles, eq(memberships.roleId, roles.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, teamMembers.authUserId))
    .where(
      and(
        eq(teamMembers.tenantId, tenantId),
        or(
          isNull(memberships.userId),
          inArray(roles.name, TEAM_ROLE_NAMES as unknown as string[])
        )
      )
    );

  const tmIdToUserId = new Map<string, string>();
  for (const r of rows) {
    const uid = r.authUserId ?? externalMemberUserId(r.teamMemberId);
    tmIdToUserId.set(r.teamMemberId, uid);
  }

  return rows.map((r) => {
    const userId = r.authUserId ?? externalMemberUserId(r.teamMemberId);
    const parentId = r.parentMemberId ? tmIdToUserId.get(r.parentMemberId) ?? null : null;
    const displayName = (r.displayName?.trim() || r.profileFullName?.trim() || null) as string | null;
    const email = (r.tmEmail?.trim() || r.profileEmail?.trim() || null) as string | null;
    return {
      userId,
      parentId,
      roleName: r.roleName ?? "Advisor",
      joinedAt: r.joinedAt,
      displayName,
      email,
      careerProgram: r.tmCareerProgram ?? null,
      careerTrack: r.tmCareerTrack ?? null,
      careerPositionCode: r.tmCareerPositionCode ?? null,
      teamMemberId: r.teamMemberId,
      authUserId: r.authUserId ?? null,
      memberKind: (r.memberKind as "internal_user" | "external_manual") ?? "internal_user",
      status: (r.status as TeamHierarchyMember["status"]) ?? "active",
    } satisfies TeamHierarchyMember;
  });
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
