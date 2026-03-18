"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { getMembership } from "@/lib/auth/get-membership";
import { db } from "db";
import { tenants, roles, memberships, clientContacts, clientInvitations, contacts, userProfiles } from "db";
import { eq, and, gt, inArray, sql } from "db";

export type EnsureMembershipResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; redirectTo?: string };

/** Po prvním přihlášení (OAuth nebo signup) vytvoří workspace a uživatele jako Admin, pokud ještě nemá membership. */
export async function ensureMembership(): Promise<EnsureMembershipResult> {
  try {
    let supabase;
    try {
      supabase = await createClient();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return { ok: false, error: m || "Chyba připojení k Supabase." };
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "Nejprve se přihlaste.", redirectTo: "/" };
    }
    const existing = await getMembership(user.id);
    if (existing) {
      const redirectTo = existing.roleName === "Client" ? "/client" : "/portal/today";
      return { ok: true, redirectTo };
    }
    const email = user.email ?? "";
    const slug =
      email.replace(/@.*/, "").replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 20) ||
      "workspace";
    const [tenant] = await db
      .insert(tenants as any)
      .values({
        name: "Můj workspace",
        slug: slug + "-" + Math.random().toString(36).slice(2, 8),
      })
      .returning({ id: tenants.id, slug: tenants.slug } as any);
    if (!tenant) return { ok: false, error: "Nepodařilo se vytvořit workspace." };
    const [adminRole] = await db
      .insert(roles as any)
      .values({ tenantId: tenant.id, name: "Admin" })
      .returning({ id: roles.id } as any);
    await db.insert(roles as any).values({ tenantId: tenant.id, name: "Advisor" }).returning({ id: roles.id } as any);
    await db.insert(roles as any).values({ tenantId: tenant.id, name: "Manager" }).returning({ id: roles.id } as any);
    await db.insert(roles as any).values({ tenantId: tenant.id, name: "Director" }).returning({ id: roles.id } as any);
    await db.insert(roles as any).values({ tenantId: tenant.id, name: "Viewer" }).returning({ id: roles.id } as any);
    await db.insert(roles as any).values({ tenantId: tenant.id, name: "Client" }).returning({ id: roles.id } as any);
    if (!adminRole) return { ok: false, error: "Nepodařilo se vytvořit roli." };
    await db.insert(memberships as any).values({
      tenantId: tenant.id,
      userId: user.id,
      roleId: adminRole.id,
    });
    return { ok: true, redirectTo: "/portal/today" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("relation") && msg.includes("does not exist")) {
      return {
        ok: false,
        error: "V databázi chybí tabulky. V repozitáři spusť: pnpm db:apply-schema (s DATABASE_URL na tento Supabase projekt).",
      };
    }
    if (msg.includes("connection") || msg.includes("ECONNREFUSED") || msg.includes("timeout")) {
      return {
        ok: false,
        error: "Nepodařilo se připojit k databázi. Zkontrolujte DATABASE_URL na Vercelu a že Supabase projekt běží.",
      };
    }
    if (msg.includes("authentication") || msg.includes("password")) {
      return {
        ok: false,
        error: "Chyba přihlášení k databázi. Zkontrolujte heslo v DATABASE_URL na Vercelu.",
      };
    }
    if (msg.includes("SUPABASE") || msg.includes("supabase") || msg.includes("NEXT_PUBLIC")) {
      return {
        ok: false,
        error: "Chybí nebo je špatně nastavená proměnná Supabase na Vercelu (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).",
      };
    }
    if (msg.includes("DATABASE_URL")) {
      return {
        ok: false,
        error: "Na Vercelu v Environment Variables přidej DATABASE_URL (celý connection string z Supabase → Database).",
      };
    }
    if (msg.includes("MaxClients") || msg.includes("max clients") || msg.toLowerCase().includes("pool")) {
      return {
        ok: false,
        error: "Server je momentálně přetížen. Zkuste to za minutu znovu.",
      };
    }
    return { ok: false, error: msg || "Nepodařilo se dokončit registraci." };
  }
}

/** Vytvoří pozvánku do Client Zone a vrátí odkaz. E-mail se odešle v EPIC 7 (Resend). */
export async function sendClientZoneInvitation(contactId: string): Promise<{ ok: true; inviteLink: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const membership = await getMembership(user.id);
  if (!membership || membership.roleName === "Client") return { ok: false, error: "Forbidden" };
  const [contact] = await db
    .select({ id: contacts.id, email: contacts.email, tenantId: contacts.tenantId } as any)
    .from(contacts as any)
    .where(and(eq(contacts.tenantId, membership.tenantId), eq(contacts.id, contactId)) as any)
    .limit(1);
  if (!contact) return { ok: false, error: "Kontakt nenalezen" };
  if (!contact.email) return { ok: false, error: "U kontaktu chybí e-mail" };
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await db.insert(clientInvitations as any).values({
    tenantId: contact.tenantId,
    contactId: contact.id,
    email: contact.email,
    token,
    expiresAt,
  });
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteLink = `${baseUrl}/register?token=${token}`;
  return { ok: true, inviteLink };
}

/** Po registraci klienta (email + token) propojí user_id → contact_id a vytvoří membership Client. gdprConsent: uloží souhlas s GDPR u kontaktu. */
export async function acceptClientInvitation(token: string, gdprConsent?: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nejprve se přihlaste nebo zaregistrujte" };
  const [inv] = await db
    .select()
    .from(clientInvitations as any)
    .where(and(eq(clientInvitations.token, token), gt(clientInvitations.expiresAt, new Date())) as any)
    .limit(1);
  if (!inv) return { ok: false, error: "Pozvánka neexistuje nebo vypršela" };
  if (inv.acceptedAt) return { ok: false, error: "Pozvánka již byla využita" };
  const email = user.email?.toLowerCase();
  if (email !== inv.email.toLowerCase()) return { ok: false, error: "E-mail se neshoduje s pozvánkou" };
  const [clientRole] = await db
    .select({ id: roles.id } as any)
    .from(roles as any)
    .where(and(eq(roles.tenantId, inv.tenantId), eq(roles.name, "Client")) as any)
    .limit(1);
  if (!clientRole) return { ok: false, error: "Role Client v tenantu chybí" };
  await db.insert(memberships as any).values({
    tenantId: inv.tenantId,
    userId: user.id,
    roleId: clientRole.id,
  });
  await db.insert(clientContacts as any).values({
    tenantId: inv.tenantId,
    userId: user.id,
    contactId: inv.contactId,
  });
  await db
    .update(clientInvitations as any)
    .set({ acceptedAt: new Date() })
    .where(eq(clientInvitations.id, inv.id) as any);
  if (gdprConsent) {
    await db
      .update(contacts as any)
      .set({ gdprConsentAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, inv.contactId) as any);
  }
  return { ok: true };
}

/** Aktualizuje jméno přihlášeného uživatele v Supabase Auth (user_metadata.full_name) a v user_profiles. */
export async function updatePortalProfile(fullName: string, supervisorUserId?: string | null): Promise<void> {
  const auth = await requireAuthInAction();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { full_name: fullName.trim() || null },
  });
  if (error) throw new Error(error.message);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  await db
    .insert(userProfiles as any)
    .values({
      userId: auth.userId,
      fullName: fullName.trim() || null,
      email,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfiles.userId as any,
      set: { fullName: fullName.trim() || null, email, updatedAt: new Date() },
    });

  if (supervisorUserId !== undefined) {
    const selfMembership = await db
      .select({ id: memberships.id, roleName: roles.name, userId: memberships.userId })
      .from(memberships as any)
      .innerJoin(roles as any, eq(memberships.roleId, roles.id) as any)
      .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.userId, auth.userId)) as any)
      .limit(1);
    const selfRoleName = selfMembership[0]?.roleName as string | undefined;
    if (!selfRoleName) throw new Error("Membership not found.");

    let nextParent: string | null = supervisorUserId ?? null;
    if (nextParent === auth.userId) throw new Error("Nadřízený nemůže být stejný uživatel.");
    if (nextParent) {
      const supervisorRows = await db
        .select({ userId: memberships.userId, roleName: roles.name })
        .from(memberships as any)
        .innerJoin(roles as any, eq(memberships.roleId, roles.id) as any)
        .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.userId, nextParent)) as any)
        .limit(1);
      const supervisorRole = supervisorRows[0]?.roleName as string | undefined;
      if (!supervisorRole) throw new Error("Vybraný nadřízený není v organizaci.");
      const isAdvisor = selfRoleName === "Advisor";
      const isManager = selfRoleName === "Manager";
      if (isAdvisor && !["Manager", "Director", "Admin"].includes(supervisorRole)) {
        throw new Error("Poradce může mít nadřízeného pouze Manager/Director/Admin.");
      }
      if (isManager && !["Director", "Admin"].includes(supervisorRole)) {
        throw new Error("Manažer může mít nadřízeného pouze Director/Admin.");
      }
      if (selfRoleName === "Director" && supervisorRole !== "Admin") {
        throw new Error("Ředitel může mít nadřízeného pouze Admin.");
      }
    }

    await db
      .update(memberships as any)
      .set({ parentId: nextParent })
      .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.userId, auth.userId)) as any);
  }
}

export type SupervisorOption = {
  userId: string;
  roleName: string;
  displayName: string;
};

export async function listSupervisorOptions(): Promise<SupervisorOption[]> {
  const auth = await requireAuthInAction();
  const selfRows = await db
    .select({ roleName: roles.name })
    .from(memberships as any)
    .innerJoin(roles as any, eq(memberships.roleId, roles.id) as any)
    .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.userId, auth.userId)) as any)
    .limit(1);
  const selfRole = (selfRows[0]?.roleName as string | undefined) ?? "Advisor";
  const allowedRoles =
    selfRole === "Advisor"
      ? ["Manager", "Director", "Admin"]
      : selfRole === "Manager"
        ? ["Director", "Admin"]
        : selfRole === "Director"
          ? ["Admin"]
          : [];
  if (allowedRoles.length === 0) return [];

  const rows = await db
    .select({
      userId: memberships.userId,
      roleName: roles.name,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
    })
    .from(memberships as any)
    .innerJoin(roles as any, eq(memberships.roleId, roles.id) as any)
    .leftJoin(userProfiles as any, eq(userProfiles.userId, memberships.userId) as any)
    .where(
      and(
        eq(memberships.tenantId, auth.tenantId),
        inArray(roles.name as any, allowedRoles as any),
        // avoid self assignment
        sql`${memberships.userId} <> ${auth.userId}` as any
      ) as any
    );

  return rows.map((r: any) => ({
    userId: r.userId,
    roleName: r.roleName,
    displayName: r.fullName?.trim() || r.email || r.userId,
  }));
}

/** Změna hesla přihlášeného uživatele (Supabase Auth). */
export async function updatePortalPassword(newPassword: string): Promise<void> {
  await requireAuthInAction();
  const trimmed = newPassword?.trim();
  if (!trimmed || trimmed.length < 6) throw new Error("Heslo musí mít alespoň 6 znaků.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: trimmed });
  if (error) throw new Error(error.message);
}
