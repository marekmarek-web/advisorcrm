/**
 * Client-safe team hierarchy types and pure helpers (no DB).
 * Client components must import from this module, not from team-hierarchy.ts.
 */

import type { RoleName } from "@/shared/rolePermissions";

export type TeamOverviewScope = "me" | "my_team" | "full";

export type TeamHierarchyMember = {
  userId: string;
  parentId: string | null;
  roleName: string;
  joinedAt: Date;
  displayName: string | null;
  email: string | null;
  /** Kariérní vrstva — nullable dokud není vyplněno v memberships */
  careerProgram: string | null;
  careerTrack: string | null;
  careerPositionCode: string | null;
};

export type TeamTreeNode = TeamHierarchyMember & {
  children: TeamTreeNode[];
  depth: number;
};

export function resolveScopeForRole(roleName: RoleName, requested?: TeamOverviewScope): TeamOverviewScope {
  const next = requested ?? (roleName === "Advisor" || roleName === "Viewer" ? "me" : "my_team");
  if (roleName === "Advisor" || roleName === "Viewer") return "me";
  if (roleName === "Manager" && next === "full") return "my_team";
  return next;
}

function getDescendantIds(members: TeamHierarchyMember[], rootUserId: string): Set<string> {
  const byParent = new Map<string, TeamHierarchyMember[]>();
  for (const m of members) {
    if (!m.parentId) continue;
    const bucket = byParent.get(m.parentId) ?? [];
    bucket.push(m);
    byParent.set(m.parentId, bucket);
  }

  const visited = new Set<string>();
  const queue = [rootUserId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = byParent.get(current) ?? [];
    for (const child of children) {
      if (visited.has(child.userId)) continue;
      visited.add(child.userId);
      queue.push(child.userId);
    }
  }
  return visited;
}

export function getVisibleUserIdsFromMembers(
  members: TeamHierarchyMember[],
  currentUserId: string,
  roleName: RoleName,
  requestedScope?: TeamOverviewScope
): string[] {
  const scope = resolveScopeForRole(roleName, requestedScope);
  const hasAnyHierarchy = members.some((m) => !!m.parentId);
  const allIds = members.map((m) => m.userId);

  if (scope === "me") return [currentUserId];

  if (roleName === "Manager" || roleName === "Director" || roleName === "Admin") {
    const descendants = getDescendantIds(members, currentUserId);
    if (scope === "my_team") {
      // Bez jediného parent_id nelze bezpečně určit větev — dříve to padlo na „všichni v tenantu“
      // (scope leak pro managery). Konzervativně jen aktuální uživatel + banner v UI.
      if (!hasAnyHierarchy) return [currentUserId];
      return Array.from(new Set([currentUserId, ...descendants]));
    }
    return allIds;
  }

  return [currentUserId];
}
