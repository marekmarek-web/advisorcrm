"use server";

import { requireAuthInAction, type AuthContext } from "@/lib/auth/require-auth";
import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { db, households, householdMembers, contacts, eq, and, asc, sql, inArray } from "db";
import { notifyAdvisorClientHouseholdUpdate } from "@/lib/client-portal/notify-advisor-client-self-service";
import { normalizeHouseholdRole } from "@/lib/households/roles";
import { logActivity } from "./activity";

/** Drizzle `db` nebo tx z `withTenantContext` — strukturálně kompatibilní `select` API. */
type HouseholdReader = Pick<typeof db, "select">;

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

export type HouseholdSharedGoal = {
  id: string;
  title: string;
  /** Cílová částka v Kč (volitelné). */
  amount?: number | null;
  /** Cílový datum ve formátu DD.MM.YYYY (volitelné). */
  targetDate?: string | null;
  /** Interní poznámka poradce. */
  note?: string | null;
  createdAt: string;
};

export type HouseholdDetail = {
  id: string;
  name: string;
  icon: string | null;
  sharedGoals: HouseholdSharedGoal[];
  members: { id: string; contactId: string; firstName: string; lastName: string; email: string | null; phone: string | null; role: string | null }[];
};

export async function getHouseholdsList(): Promise<HouseholdRow[]> {
  return withAuthContext((auth, tx) => getHouseholdsListWithAuth(auth, tx));
}

/** Stejné jako getHouseholdsList, ale bez druhého auth (pro bundlované server actions). */
export async function getHouseholdsListWithAuth(
  auth: AuthContext,
  reader: HouseholdReader = db,
): Promise<HouseholdRow[]> {
  if (!hasPermission(auth.roleName, "households:read")) return [];
  return reader
    .select({
      id: households.id,
      name: households.name,
      memberCount: sql<number>`count(${householdMembers.id})::int`,
    })
    .from(households)
    .leftJoin(householdMembers, eq(householdMembers.householdId, households.id))
    .where(eq(households.tenantId, auth.tenantId))
    .groupBy(households.id, households.name)
    .orderBy(asc(households.name));
}

/** ID domácnosti kontaktu; jeden dotaz bez načítání všech členů. */
export async function getHouseholdIdForContactWithAuth(
  auth: AuthContext,
  contactId: string,
  reader: HouseholdReader = db,
): Promise<string | null> {
  const isClientPortal = auth.roleName === "Client" && auth.contactId === contactId;
  if (!isClientPortal && !hasPermission(auth.roleName, "households:read")) return null;
  const [member] = await reader
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(and(eq(householdMembers.contactId, contactId), eq(households.tenantId, auth.tenantId)))
    .limit(1);
  return member?.householdId ?? null;
}

export async function getHouseholdsWithMembers(): Promise<HouseholdRowWithMembers[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "households:read")) throw new Error("Forbidden");
    const rows = await tx
      .select({ id: households.id, name: households.name })
      .from(households)
      .where(eq(households.tenantId, auth.tenantId))
      .orderBy(asc(households.name));
    if (rows.length === 0) return [];
    const householdIds = rows.map((r) => r.id);
    const memberRows = await tx
      .select({
        householdId: householdMembers.householdId,
        id: householdMembers.id,
        role: householdMembers.role,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(householdMembers)
      .innerJoin(contacts, eq(householdMembers.contactId, contacts.id))
      .where(inArray(householdMembers.householdId, householdIds));
    const byHousehold = new Map<string, HouseholdMemberSummary[]>();
    for (const m of memberRows) {
      const list = byHousehold.get(m.householdId) ?? [];
      list.push({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        role: m.role,
      });
      byHousehold.set(m.householdId, list);
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      members: byHousehold.get(r.id) ?? [],
    }));
  });
}

export type HouseholdForContact = {
  id: string;
  name: string;
  role: string | null;
  memberCount: number;
};

export type ClientHouseholdMember = {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  role: string | null;
};

export type ClientHouseholdDetail = {
  id: string;
  name: string;
  role: string | null;
  memberCount: number;
  members: ClientHouseholdMember[];
};

/** Household (if any) that this contact belongs to; for profile sidebar/card. */
export async function getHouseholdForContact(contactId: string): Promise<HouseholdForContact | null> {
  return withAuthContext(async (auth, tx) => {
    const isClientPortal = auth.roleName === "Client" && auth.contactId === contactId;
    if (!isClientPortal && !hasPermission(auth.roleName, "households:read")) return null;
    const [member] = await tx
      .select({
        householdId: householdMembers.householdId,
        role: householdMembers.role,
        name: households.name,
        memberCount: sql<number>`(select count(*)::int from household_members hm2 where hm2.household_id = ${householdMembers.householdId})`,
      })
      .from(householdMembers)
      .innerJoin(households, eq(householdMembers.householdId, households.id))
      .where(and(eq(householdMembers.contactId, contactId), eq(households.tenantId, auth.tenantId)))
      .limit(1);
    if (!member) return null;
    return {
      id: member.householdId,
      name: member.name,
      role: member.role,
      memberCount: member.memberCount ?? 0,
    };
  });
}

export async function getClientHouseholdForContact(
  contactId: string
): Promise<ClientHouseholdDetail | null> {
  return withAuthContext(async (auth, tx) => {
    const isClientPortal = auth.roleName === "Client" && auth.contactId === contactId;
    if (!isClientPortal && !hasPermission(auth.roleName, "households:read")) return null;

    const [member] = await tx
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

    const members = await tx
      .select({
        id: householdMembers.id,
        contactId: householdMembers.contactId,
        role: householdMembers.role,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        birthDate: contacts.birthDate,
      })
      .from(householdMembers)
      .innerJoin(contacts, eq(householdMembers.contactId, contacts.id))
      .where(eq(householdMembers.householdId, member.householdId))
      .orderBy(asc(contacts.firstName), asc(contacts.lastName));

    return {
      id: member.householdId,
      name: member.name,
      role: member.role,
      memberCount: members.length,
      members,
    };
  });
}

export async function getHousehold(id: string): Promise<HouseholdDetail | null> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "households:read")) throw new Error("Forbidden");
    const [h] = await tx
      .select()
      .from(households)
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, id)))
      .limit(1);
    if (!h) return null;
    const members = await tx
      .select({
        id: householdMembers.id,
        contactId: householdMembers.contactId,
        role: householdMembers.role,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(householdMembers)
      .innerJoin(contacts, eq(householdMembers.contactId, contacts.id))
      .where(eq(householdMembers.householdId, id));
    const sharedGoals = parseSharedGoals((h as { sharedGoals?: unknown }).sharedGoals);
    return {
      id: h.id,
      name: h.name,
      icon: h.icon ?? null,
      sharedGoals,
      members: members.map((m) => ({
        id: m.id,
        contactId: m.contactId,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        phone: m.phone ?? null,
        role: m.role,
      })),
    };
  });
}

function parseSharedGoals(raw: unknown): HouseholdSharedGoal[] {
  if (!Array.isArray(raw)) return [];
  const out: HouseholdSharedGoal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    const title = typeof record.title === "string" ? record.title : null;
    if (!id || !title) continue;
    out.push({
      id,
      title,
      amount: typeof record.amount === "number" ? record.amount : null,
      targetDate: typeof record.targetDate === "string" ? record.targetDate : null,
      note: typeof record.note === "string" ? record.note : null,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    });
  }
  return out;
}

export async function addHouseholdSharedGoal(
  householdId: string,
  goal: { title: string; amount?: number | null; targetDate?: string | null; note?: string | null },
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  const title = goal.title.trim();
  if (!title) throw new Error("Název cíle je povinný.");
  return withTenantContextFromAuth(auth, async (tx) => {
    const [existing] = await tx
      .select({ sharedGoals: households.sharedGoals })
      .from(households)
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, householdId)))
      .limit(1);
    if (!existing) throw new Error("Domácnost neexistuje.");
    const current = parseSharedGoals((existing as { sharedGoals?: unknown }).sharedGoals);
    const next: HouseholdSharedGoal = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `goal-${Date.now()}`,
      title,
      amount: goal.amount ?? null,
      targetDate: goal.targetDate ?? null,
      note: goal.note?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    const updated = [...current, next];
    await tx
      .update(households)
      .set({ sharedGoals: updated, updatedAt: new Date() })
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, householdId)));
    return next;
  });
}

export async function removeHouseholdSharedGoal(householdId: string, goalId: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  await withTenantContextFromAuth(auth, async (tx) => {
    const [existing] = await tx
      .select({ sharedGoals: households.sharedGoals })
      .from(households)
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, householdId)))
      .limit(1);
    if (!existing) throw new Error("Domácnost neexistuje.");
    const current = parseSharedGoals((existing as { sharedGoals?: unknown }).sharedGoals);
    const updated = current.filter((g) => g.id !== goalId);
    await tx
      .update(households)
      .set({ sharedGoals: updated, updatedAt: new Date() })
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, householdId)));
  });
}

export async function createHousehold(name: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  const [row] = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .insert(households)
      .values({ tenantId: auth.tenantId, name: name.trim() })
      .returning({ id: households.id }),
  );
  return row?.id ?? null;
}

export async function updateHousehold(id: string, name: string, icon?: string | null) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  await withTenantContextFromAuth(auth, (tx) =>
    tx
      .update(households)
      .set({ name: name.trim(), ...(icon !== undefined && { icon: icon || null }), updatedAt: new Date() })
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, id))),
  );
}

export async function deleteHousehold(id: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  await withTenantContextFromAuth(auth, (tx) =>
    tx
      .delete(households)
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, id))),
  );
}

export async function addHouseholdMember(householdId: string, contactId: string, role?: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  const normalizedRole = normalizeHouseholdRole(role ?? null);
  return withTenantContextFromAuth(auth, async (tx) => {
    const [h] = await tx
      .select({ id: households.id })
      .from(households)
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, householdId)))
      .limit(1);
    if (!h) throw new Error("Household not found");
    const [row] = await tx
      .insert(householdMembers)
      .values({ householdId, contactId, role: normalizedRole })
      .returning({ id: householdMembers.id });
    return row?.id ?? null;
  });
}

/**
 * Aktualizuje rodinnou roli člena domácnosti (enum z @/lib/households/roles).
 * Nevalidní hodnoty se ukládají jako `null` (DB CHECK constraint by je stejně odmítl).
 */
export async function updateHouseholdMemberRole(memberId: string, role: string | null) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  const normalizedRole = normalizeHouseholdRole(role);
  await withTenantContextFromAuth(auth, async (tx) => {
    const [member] = await tx
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.id, memberId))
      .limit(1);
    if (!member) return;
    const [h] = await tx
      .select({ id: households.id })
      .from(households)
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, member.householdId)))
      .limit(1);
    if (!h) throw new Error("Forbidden");
    await tx
      .update(householdMembers)
      .set({ role: normalizedRole })
      .where(eq(householdMembers.id, memberId));
  });
}

export async function removeHouseholdMember(memberId: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  await withTenantContextFromAuth(auth, async (tx) => {
    const [member] = await tx
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.id, memberId))
      .limit(1);
    if (!member) return;
    const [h] = await tx
      .select({ id: households.id })
      .from(households)
      .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, member.householdId)))
      .limit(1);
    if (!h) throw new Error("Forbidden");
    await tx.delete(householdMembers).where(eq(householdMembers.id, memberId));
  });
}

/** Nastaví domácnost kontaktu: null = odebrat z domácnosti, jinak přidat do zvolené domácnosti (případně přesunout). */
export async function setContactHousehold(contactId: string, householdId: string | null): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:write")) throw new Error("Forbidden");
  await withTenantContextFromAuth(auth, async (tx) => {
    const existing = await tx
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(eq(householdMembers.contactId, contactId));
    for (const row of existing) {
      await tx.delete(householdMembers).where(eq(householdMembers.id, row.id));
    }
    if (householdId) {
      const [h] = await tx
        .select({ id: households.id })
        .from(households)
        .where(and(eq(households.tenantId, auth.tenantId), eq(households.id, householdId)))
        .limit(1);
      if (!h) throw new Error("Domácnost nenalezena");
      await tx.insert(householdMembers).values({ householdId, contactId, role: null });
    }
  });
}

export async function addHouseholdMemberFromClient(params: {
  role: string;
  fullName: string;
  birthDate?: string | null;
}) {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) throw new Error("Forbidden");

  const fullName = params.fullName.trim();
  if (!fullName) throw new Error("Jméno člena domácnosti je povinné.");

  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts.shift() || "Člen";
  const lastName = nameParts.join(" ") || "Domácnosti";

  const clientContactId = auth.contactId;

  const result = await withTenantContextFromAuth(auth, async (tx) => {
    let householdId: string | null = null;

    const [currentMember] = await tx
      .select({
        householdId: householdMembers.householdId,
        role: householdMembers.role,
        name: households.name,
      })
      .from(householdMembers)
      .innerJoin(households, eq(householdMembers.householdId, households.id))
      .where(and(eq(householdMembers.contactId, clientContactId), eq(households.tenantId, auth.tenantId)))
      .limit(1);

    if (currentMember) {
      householdId = currentMember.householdId;
    } else {
      const [createdHousehold] = await tx
        .insert(households)
        .values({
          tenantId: auth.tenantId,
          name: `${firstName} domácnost`,
        })
        .returning({ id: households.id });
      householdId = createdHousehold?.id ?? null;
      if (householdId) {
        await tx.insert(householdMembers).values({
          householdId,
          contactId: clientContactId,
          role: "partner",
        });
      }
    }

    if (!householdId) throw new Error("Domácnost se nepodařilo připravit.");

    const [newContact] = await tx
      .insert(contacts)
      .values({
        tenantId: auth.tenantId,
        firstName,
        lastName,
        birthDate: params.birthDate || null,
        lifecycleStage: "active",
        leadSource: "client_portal_household",
      })
      .returning({ id: contacts.id });

    if (!newContact?.id) throw new Error("Nepodařilo se vytvořit člena domácnosti.");
    const roleLabel = normalizeHouseholdRole(params.role) ?? "jiny";
    await tx.insert(householdMembers).values({
      householdId,
      contactId: newContact.id,
      role: roleLabel,
    });
    return { newContactId: newContact.id, roleLabel };
  });

  const { newContactId: newContactIdFinal, roleLabel } = result;

  await logActivity("contact", clientContactId, "client_household_member_add", {
    memberContactId: newContactIdFinal,
    role: roleLabel,
    via: "client_portal",
  }).catch(() => {});

  await notifyAdvisorClientHouseholdUpdate({
    tenantId: auth.tenantId,
    clientContactId,
    newMemberContactId: newContactIdFinal,
    preview: `${fullName} byl přidán do domácnosti.`,
  }).catch(() => {});

  return { success: true as const, contactId: newContactIdFinal };
}
