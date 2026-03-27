"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { getMembership } from "@/lib/auth/get-membership";
import { provisionWorkspaceIfNeeded } from "@/lib/auth/ensure-workspace";
import type { EnsureMembershipResult } from "@/lib/auth/ensure-workspace";
import { db } from "db";
import {
  tenants,
  roles,
  memberships,
  clientContacts,
  clientInvitations,
  contacts,
  userProfiles,
  advisorPreferences,
} from "db";
import { eq, and, ne, gt, inArray, isNull } from "db";
import { sendEmail } from "@/lib/email/send-email";
import { clientPortalInviteTemplate } from "@/lib/email/templates";
import { resolveResendReplyTo } from "@/lib/email/resend-reply-to";

/** Po prvním přihlášení (OAuth nebo signup) vytvoří workspace a uživatele jako Admin, pokud ještě nemá membership. */
export async function ensureMembership(): Promise<EnsureMembershipResult> {
  return provisionWorkspaceIfNeeded();
}

const INVITE_EXPIRY_DAYS = 7;

export type SendClientZoneInvitationResult =
  | { ok: true; inviteLink: string; emailSent: boolean; emailError?: string }
  | { ok: false; error: string };

/** Vytvoří pozvánku do Client Zone, odešle e-mail (Resend při RESEND_API_KEY) a vrátí odkaz. */
export async function sendClientZoneInvitation(contactId: string): Promise<SendClientZoneInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const membership = await getMembership(user.id);
  if (!membership || membership.roleName === "Client") return { ok: false, error: "Forbidden" };
  const [contact] = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      tenantId: contacts.tenantId,
      firstName: contacts.firstName,
    } as any)
    .from(contacts as any)
    .where(and(eq(contacts.tenantId, membership.tenantId), eq(contacts.id, contactId)) as any)
    .limit(1);
  if (!contact) return { ok: false, error: "Kontakt nenalezen" };
  if (!contact.email) return { ok: false, error: "U kontaktu chybí e-mail" };

  await db
    .update(clientInvitations as any)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(clientInvitations.tenantId, contact.tenantId),
        eq(clientInvitations.contactId, contact.id),
        isNull(clientInvitations.acceptedAt),
        isNull(clientInvitations.revokedAt),
      ) as any,
    );

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);
  const [inserted] = await db
    .insert(clientInvitations as any)
    .values({
      tenantId: contact.tenantId,
      contactId: contact.id,
      email: contact.email.trim(),
      token,
      expiresAt,
      invitedByUserId: user.id,
    })
    .returning({ id: clientInvitations.id } as any);

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const inviteLink = `${baseUrl}/register?token=${token}`;

  const [tenantRow] = await db
    .select({ name: tenants.name, notificationEmail: tenants.notificationEmail } as any)
    .from(tenants as any)
    .where(eq(tenants.id, contact.tenantId))
    .limit(1);

  const { subject, html } = clientPortalInviteTemplate({
    registerUrl: inviteLink,
    contactFirstName: contact.firstName?.trim() ?? "",
    tenantName: tenantRow?.name ?? undefined,
    expiresInDays: INVITE_EXPIRY_DAYS,
    gdprUrl: `${baseUrl}/gdpr`,
    termsUrl: `${baseUrl}/terms`,
  });

  const replyTo = resolveResendReplyTo(tenantRow?.notificationEmail ?? undefined);
  const sendResult = await sendEmail({
    to: contact.email.trim(),
    subject,
    html,
    replyTo,
  });

  if (inserted?.id) {
    if (sendResult.ok) {
      await db
        .update(clientInvitations as any)
        .set({ emailSentAt: new Date(), lastEmailError: null })
        .where(eq(clientInvitations.id, inserted.id) as any);
    } else {
      await db
        .update(clientInvitations as any)
        .set({ lastEmailError: sendResult.error ?? "send failed" })
        .where(eq(clientInvitations.id, inserted.id) as any);
    }
  }

  return {
    ok: true,
    inviteLink,
    emailSent: sendResult.ok,
    emailError: sendResult.ok ? undefined : sendResult.error,
  };
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
    .where(
      and(
        eq(clientInvitations.token, token),
        gt(clientInvitations.expiresAt, new Date()),
        isNull(clientInvitations.revokedAt),
      ) as any,
    )
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

/** Po přihlášení do klientské zóny bez pozvánky: ověří existující roli Client. */
export async function ensureClientPortalAccess(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };
  const m = await getMembership(user.id);
  if (m?.roleName === "Client") return { ok: true };
  return {
    ok: false,
    error:
      "Účet nemá přiřazený klientský přístup. Požádejte svého poradce o pozvánku do klientské zóny (e-mail s odkazem).",
  };
}

/** Aktualizuje jméno přihlášeného uživatele v Supabase Auth (user_metadata.full_name) a v user_profiles.
 *  Extra fields (phone, ico, company, bio, correspondence_address) are stored in user_metadata and advisor_preferences.
 *  `company` = název sítě/společnosti (profil); `correspondence_address` = sídlo / korespondenční adresa (osobní údaje). */
export async function updatePortalProfile(
  fullName: string,
  extra?: {
    phone?: string;
    ico?: string;
    company?: string;
    bio?: string;
    publicRole?: string;
    correspondenceAddress?: string;
  },
  supervisorUserId?: string | null,
): Promise<void> {
  const auth = await requireAuthInAction();
  const supabase = await createClient();
  const metaUpdate: Record<string, unknown> = { full_name: fullName.trim() || null };
  if (extra?.ico !== undefined) metaUpdate.ico = extra.ico.trim() || null;
  if (extra?.company !== undefined) metaUpdate.company = extra.company.trim() || null;
  if (extra?.bio !== undefined) metaUpdate.bio = extra.bio.trim() || null;
  if (extra?.publicRole !== undefined) metaUpdate.public_role = extra.publicRole.trim() || null;
  if (extra?.correspondenceAddress !== undefined) {
    metaUpdate.correspondence_address = extra.correspondenceAddress.trim() || null;
  }
  const { error } = await supabase.auth.updateUser({ data: metaUpdate });
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
  if (extra?.phone !== undefined) {
    const existing = await db
      .select({ id: advisorPreferences.id })
      .from(advisorPreferences)
      .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(advisorPreferences).set({ phone: extra.phone.trim() || null, updatedAt: new Date() }).where(eq(advisorPreferences.id, existing[0].id));
    } else {
      await db.insert(advisorPreferences).values({ userId: auth.userId, tenantId: auth.tenantId, phone: extra.phone.trim() || null });
    }
  }

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
      if (selfRoleName === "Admin" && supervisorRole !== "Admin") {
        throw new Error("Admin může mít nadřízeného pouze jiného Admina.");
      }
      if (selfRoleName === "Viewer") {
        throw new Error("Role prohlížeče nemá týmového nadřízeného.");
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
        ne(memberships.userId, auth.userId)
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
