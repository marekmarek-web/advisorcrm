"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { memberships, roles, userProfiles } from "db";
import { eq, asc, and } from "db";
import { hasPermission, isRoleAtLeast, type RoleName } from "@/shared/rolePermissions";

export type TenantMemberRow = {
  membershipId: string;
  userId: string;
  roleName: string;
  parentId: string | null;
  joinedAt: Date;
  displayName: string | null;
  email: string | null;
};

/** List members of the current user's tenant (for Settings > Tým). */
export async function listTenantMembers(): Promise<TenantMemberRow[]> {
  const auth = await requireAuthInAction();
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      parentId: memberships.parentId,
      roleName: roles.name,
      joinedAt: memberships.joinedAt,
      displayName: userProfiles.fullName,
      email: userProfiles.email,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, memberships.userId))
    .where(eq(memberships.tenantId, auth.tenantId))
    .orderBy(asc(memberships.joinedAt));
  return rows.map((r) => ({
    membershipId: r.membershipId,
    userId: r.userId,
    parentId: r.parentId ?? null,
    roleName: r.roleName,
    joinedAt: r.joinedAt,
    displayName: r.displayName?.trim() || null,
    email: r.email?.trim() || null,
  }));
}

export async function updateMemberRole(
  membershipId: string,
  newRoleName: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_members:write")) {
    return { ok: false, error: "Nemáte oprávnění měnit role." };
  }

  const [target] = await db
    .select({ tenantId: memberships.tenantId, userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!target || target.tenantId !== auth.tenantId) {
    return { ok: false, error: "Člen nenalezen." };
  }

  if (target.userId === auth.userId) {
    return { ok: false, error: "Nemůžete změnit svou vlastní roli." };
  }

  const [roleRow] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.tenantId, auth.tenantId), eq(roles.name, newRoleName)))
    .limit(1);

  if (!roleRow) {
    return { ok: false, error: `Role "${newRoleName}" neexistuje.` };
  }

  if (!isRoleAtLeast(auth.roleName, newRoleName as RoleName)) {
    return { ok: false, error: "Nemůžete přidělit roli vyšší než vlastní." };
  }

  await db
    .update(memberships)
    .set({ roleId: roleRow.id })
    .where(eq(memberships.id, membershipId));

  return { ok: true };
}

export async function updateMemberParent(
  membershipId: string,
  parentUserId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_members:write")) {
    return { ok: false, error: "Nemáte oprávnění měnit hierarchii." };
  }

  const [target] = await db
    .select({ tenantId: memberships.tenantId, userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!target || target.tenantId !== auth.tenantId) {
    return { ok: false, error: "Člen nenalezen." };
  }

  if (parentUserId && parentUserId === target.userId) {
    return { ok: false, error: "Člen nemůže být svým vlastním nadřízeným." };
  }

  await db
    .update(memberships)
    .set({ parentId: parentUserId })
    .where(eq(memberships.id, membershipId));

  return { ok: true };
}

export async function removeMember(
  membershipId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_members:write")) {
    return { ok: false, error: "Nemáte oprávnění odebírat členy." };
  }

  const [target] = await db
    .select({ tenantId: memberships.tenantId, userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!target || target.tenantId !== auth.tenantId) {
    return { ok: false, error: "Člen nenalezen." };
  }

  if (target.userId === auth.userId) {
    return { ok: false, error: "Nemůžete odebrat sami sebe." };
  }

  await db.delete(memberships).where(eq(memberships.id, membershipId));
  return { ok: true };
}
