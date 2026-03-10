"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { getMembership } from "@/lib/auth/get-membership";
import { db } from "db";
import { tenants, roles, memberships, clientContacts, clientInvitations, contacts } from "db";
import { eq, and, gt } from "db";

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
      .insert(tenants)
      .values({
        name: "Můj workspace",
        slug: slug + "-" + Math.random().toString(36).slice(2, 8),
      })
      .returning({ id: tenants.id, slug: tenants.slug });
    if (!tenant) return { ok: false, error: "Nepodařilo se vytvořit workspace." };
    const [adminRole] = await db
      .insert(roles)
      .values({ tenantId: tenant.id, name: "Admin" })
      .returning({ id: roles.id });
    await db.insert(roles).values({ tenantId: tenant.id, name: "Advisor" }).returning({ id: roles.id });
    await db.insert(roles).values({ tenantId: tenant.id, name: "Manager" }).returning({ id: roles.id });
    await db.insert(roles).values({ tenantId: tenant.id, name: "Viewer" }).returning({ id: roles.id });
    await db.insert(roles).values({ tenantId: tenant.id, name: "Client" }).returning({ id: roles.id });
    if (!adminRole) return { ok: false, error: "Nepodařilo se vytvořit roli." };
    await db.insert(memberships).values({
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
    .select({ id: contacts.id, email: contacts.email, tenantId: contacts.tenantId })
    .from(contacts)
    .where(and(eq(contacts.tenantId, membership.tenantId), eq(contacts.id, contactId)))
    .limit(1);
  if (!contact) return { ok: false, error: "Kontakt nenalezen" };
  if (!contact.email) return { ok: false, error: "U kontaktu chybí e-mail" };
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await db.insert(clientInvitations).values({
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
    .from(clientInvitations)
    .where(and(eq(clientInvitations.token, token), gt(clientInvitations.expiresAt, new Date())))
    .limit(1);
  if (!inv) return { ok: false, error: "Pozvánka neexistuje nebo vypršela" };
  if (inv.acceptedAt) return { ok: false, error: "Pozvánka již byla využita" };
  const email = user.email?.toLowerCase();
  if (email !== inv.email.toLowerCase()) return { ok: false, error: "E-mail se neshoduje s pozvánkou" };
  const [clientRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.tenantId, inv.tenantId), eq(roles.name, "Client")))
    .limit(1);
  if (!clientRole) return { ok: false, error: "Role Client v tenantu chybí" };
  await db.insert(memberships).values({
    tenantId: inv.tenantId,
    userId: user.id,
    roleId: clientRole.id,
  });
  await db.insert(clientContacts).values({
    tenantId: inv.tenantId,
    userId: user.id,
    contactId: inv.contactId,
  });
  await db
    .update(clientInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(clientInvitations.id, inv.id));
  if (gdprConsent) {
    await db
      .update(contacts)
      .set({ gdprConsentAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, inv.contactId));
  }
  return { ok: true };
}

/** Aktualizuje jméno přihlášeného uživatele v Supabase Auth (user_metadata.full_name). */
export async function updatePortalProfile(fullName: string): Promise<void> {
  await requireAuthInAction();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { full_name: fullName.trim() || null },
  });
  if (error) throw new Error(error.message);
}
