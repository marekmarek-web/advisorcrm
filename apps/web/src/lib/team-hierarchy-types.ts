/**
 * Client-safe team hierarchy types and pure helpers (no DB).
 * Client components must import from this module, not from team-hierarchy.ts.
 */

import type { RoleName } from "@/shared/rolePermissions";

export type TeamOverviewScope = "me" | "my_team" | "full";

export type TeamHierarchyMember = {
  /**
   * Logický primární klíč v celém Team Overview pipeline (auth userId pro internal,
   * sentinel `ext:<teamMemberId>` pro external_manual — ať funguje existující
   * collectUserStats/visibility kód beze změny).
   */
  userId: string;
  parentId: string | null;
  roleName: string;
  joinedAt: Date;
  displayName: string | null;
  email: string | null;
  careerProgram: string | null;
  careerTrack: string | null;
  careerPositionCode: string | null;
  /** F1 canonical team_members.id — source of truth pro manual periods a career log. */
  teamMemberId: string | null;
  /** Vazba na auth uživatele. Null → external_manual bez Aidvisora účtu. */
  authUserId: string | null;
  memberKind: "internal_user" | "external_manual";
  status: "active" | "paused" | "offboarded" | "planned";
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

/**
 * Výchozí scope při prvním načtení Team Overview (stejný jako `team-overview/page.tsx`).
 * Liší se od `resolveScopeForRole(role, undefined)` — Director/Admin mají zde `full`, ne `my_team`.
 * Použijte u deep linků na detail člena (`getTeamMemberDetail`), aby viditelnost odpovídala přehledu.
 */
export function defaultLandingScopeForRole(roleName: RoleName): TeamOverviewScope {
  if (roleName === "Advisor" || roleName === "Viewer") return "me";
  if (roleName === "Director" || roleName === "Admin") return "full";
  return "my_team";
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
