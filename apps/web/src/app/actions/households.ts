"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db, households, householdMembers, contacts, eq, and, asc } from "db";

export type HouseholdRow = { id: string; name: string; memberCount: number };

export type HouseholdMemberSummary = {
  id: string;
  firstName: string;
  lastName: string;
  role: string | null;
};

export type HouseholdRowWithMembers = {
  id: string;
  name: string;
  members: HouseholdMemberSummary[];
};

export type HouseholdDetail = {
  id: string;
  name: string;
  icon: string | null;
  members: { id: string; contactId: string; firstName: string; lastName: string; email: string | null; phone: string | null; role: string | null }[];
};

export async function getHouseholdsList(): Promise<HouseholdRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:read")) throw new Error("Forbidden");
  const rows = await db.select({ id: households.id, name: households.name }).from(households).where(eq(households.tenantId, auth.tenantId)).orderBy(asc(households.name));
  const withCount = await Promise.all(rows.map(async (r) => {
    const members = await db.select({ id: householdMembers.id }).from(householdMembers).where(eq(householdMembers.householdId, r.id));
    return { ...r, memberCount: members.length };
  }));
  return withCount;
}

export async function getHouseholdsWithMembers(): Promise<HouseholdRowWithMembers[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:read")) throw new Error("Forbidden");
  const rows = await db.select({ id: households.id, name: households.name }).from(households).where(eq(households.tenantId, auth.tenantId)).orderBy(asc(households.name));
  const withMembers = await Promise.all(
    rows.map(async (r) => {
      const members = await db
        .select({
          id: householdMembers.id,
          role: householdMembers.role,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
        })
        .from(householdMembers)
        .innerJoin(contacts, eq(householdMembers.contactId, contacts.id))
        .where(eq(householdMembers.householdId, r.id));
      return {
        id: r.id,
        name: r.name,
        members: members.map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, role: m.role })),
      };
    })
  );
  return withMembers;
}

export type HouseholdForContact = {
  id: string;
  name: string;
  role: string | null;
  memberCount: number;
};

/** Household (if any) that this contact belongs to; for profile sidebar/card. */
export async function getHouseholdForContact(contactId: string): Promise<HouseholdForContact | null> {
  const auth = await requireAuthInAction();
  const isClientPortal = auth.roleName === "Client" && auth.contactId === contactId;
  if (!isClientPortal && !hasPermission(auth.roleName, "households:read")) return null;
  const [member] = await db
    .select({
      householdId: householdMembers.householdId,
      role: householdMembers.role,
      name: households.name,
    })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(and(eq(householdMembers.contactId, contactId), eq(households.tenantId, auth.tenantId)))
    .limit(1);
  if (!member) return null;
  const count = await db.select({ id: householdMembers.id }).from(householdMembers).where(eq(householdMembers.householdId, member.householdId));
  return {
    id: member.householdId,
    name: member.name,
    role: member.role,
    memberCount: count.length,
  };
}

export async function getHousehold(id: string): Promise<HouseholdDetail | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:read")) throw new Error("Forbidden");
  const [h] = await db.select().from(households).where(and(eq(households.tenantId, auth.tenantId), eq(households.id, id))).limit(1);
  if (!h) return null;
  const members = await db.select({ id: householdMembers.id, contactId: householdMembers.contactId, role: householdMembers.role, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone }).from(householdMembers).innerJoin(contacts, eq(householdMembers.contactId, contacts.id)).where(eq(householdMembers.householdId, id));
  return { id: h.id, name: h.name, icon: h.icon ?? null, members: members.map((m) => ({ id: m.id, contactId: m.contactId, firstName: m.firstName, lastName: m.lastName, email: m.email, phone: m.phone ?? null, role: m.role })) };
}

export async function createHousehold(name: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  const [row] = await db
    .insert(households)
    .values({ tenantId: auth.tenantId, name: name.trim() })
    .returning({ id: households.id });
  return row?.id ?? null;
}

export async function updateHousehold(id: string, name: string, icon?: string | null) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  await db
    .update(households)
    .set({ name: name.trim(), ...(icon !== undefined && { icon: icon || null }), updatedAt: new Date() })
    .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, id)));
}

export async function deleteHousehold(id: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  await db
    .delete(households)
    .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, id)));
}

export async function addHouseholdMember(householdId: string, contactId: string, role?: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  const [h] = await db
    .select({ id: households.id })
    .from(households)
    .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, householdId)))
    .limit(1);
  if (!h) throw new Error("Household not found");
  const [row] = await db
    .insert(householdMembers)
    .values({ householdId, contactId, role: role || null })
    .returning({ id: householdMembers.id });
  return row?.id ?? null;
}

export async function removeHouseholdMember(memberId: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  const [member] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.id, memberId))
    .limit(1);
  if (!member) return;
  const [h] = await db
    .select({ id: households.id })
    .from(households)
    .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, member.householdId)))
    .limit(1);
  if (!h) throw new Error("Forbidden");
  await db.delete(householdMembers).where(eq(householdMembers.id, memberId));
}

/** Nastaví domácnost kontaktu: null = odebrat z domácnosti, jinak přidat do zvolené domácnosti (případně přesunout). */
export async function setContactHousehold(contactId: string, householdId: string | null): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  const existing = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.contactId, contactId));
  for (const row of existing) {
    await db.delete(householdMembers).where(eq(householdMembers.id, row.id));
  }
  if (householdId) {
    const [h] = await db
      .select({ id: households.id })
      .from(households)
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, householdId)))
      .limit(1);
    if (!h) throw new Error("Domácnost nenalezena");
    await db.insert(householdMembers).values({ householdId, contactId, role: null });
  }
}
