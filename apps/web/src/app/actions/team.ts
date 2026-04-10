"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { findAuthUserByEmail } from "@/lib/auth/client-invite-account";
import { getServerAppBaseUrl } from "@/lib/url/server-app-base-url";
import { sendEmail } from "@/lib/email/send-email";
import type { SendResult } from "@/lib/email/send-email";
import { staffTeamInviteTemplate } from "@/lib/email/templates";
import { resolveResendReplyTo } from "@/lib/email/resend-reply-to";
import { STAFF_INVITE_QUERY_PARAM } from "@/lib/auth/staff-invite-url";
import { db } from "db";
import { memberships, roles, userProfiles, staffInvitations, tenants, tenantSettings } from "db";
import { eq, asc, and, isNull, sql } from "db";
import { hasPermission, isRoleAtLeast, type RoleName } from "@/shared/rolePermissions";
import { validateCareerFieldsForWrite } from "@/lib/career/career-write-validation";
import { normalizeCareerProgramFromDb } from "@/lib/career/registry";

const STAFF_INVITE_EXPIRY_DAYS = 7;

const TENANT_TEAM_CAREER_KEY = "team_career_defaults";
const TENANT_TEAM_CAREER_DOMAIN = "team";

type TeamCareerDefaultsJson = { defaultCareerProgram: string | null };

const ROLE_LABEL_CS: Partial<Record<RoleName, string>> = {
  Admin: "Admin",
  Director: "Ředitel",
  Manager: "Manažer",
  Advisor: "Poradce",
  Viewer: "Čtenář",
  Client: "Klient",
};

export type TenantMemberRow = {
  membershipId: string;
  userId: string;
  roleName: string;
  parentId: string | null;
  joinedAt: Date;
  displayName: string | null;
  email: string | null;
  careerProgram: string | null;
  careerTrack: string | null;
  careerPositionCode: string | null;
  /** true pokud v DB zůstala legacy hodnota career_program (beplan_finance, …) */
  careerHasLegacyProgram: boolean;
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
      careerProgram: memberships.careerProgram,
      careerTrack: memberships.careerTrack,
      careerPositionCode: memberships.careerPositionCode,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, memberships.userId))
    .where(eq(memberships.tenantId, auth.tenantId))
    .orderBy(asc(memberships.joinedAt));
  return rows.map((r) => {
    const norm = normalizeCareerProgramFromDb(r.careerProgram);
    return {
      membershipId: r.membershipId,
      userId: r.userId,
      parentId: r.parentId ?? null,
      roleName: r.roleName,
      joinedAt: r.joinedAt,
      displayName: r.displayName?.trim() || null,
      email: r.email?.trim() || null,
      careerProgram: r.careerProgram ?? null,
      careerTrack: r.careerTrack ?? null,
      careerPositionCode: r.careerPositionCode ?? null,
      careerHasLegacyProgram: norm.legacyRaw != null,
    };
  });
}

export async function getTenantTeamCareerDefaults(): Promise<{ defaultCareerProgram: string | null }> {
  const auth = await requireAuthInAction();
  const [row] = await db
    .select({ value: tenantSettings.value })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, auth.tenantId), eq(tenantSettings.key, TENANT_TEAM_CAREER_KEY)))
    .limit(1);
  const raw = row?.value as TeamCareerDefaultsJson | undefined;
  const p = raw?.defaultCareerProgram ?? null;
  if (p === "beplan" || p === "premium_brokers") return { defaultCareerProgram: p };
  return { defaultCareerProgram: null };
}

export async function setTenantTeamCareerDefaultProgram(
  program: string | null
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_members:write")) {
    return { ok: false, error: "Nemáte oprávnění upravit výchozí program." };
  }
  const defaultCareerProgram = program === "beplan" || program === "premium_brokers" ? program : null;
  const value: TeamCareerDefaultsJson = { defaultCareerProgram };

  const [existing] = await db
    .select({ id: tenantSettings.id, version: tenantSettings.version })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, auth.tenantId), eq(tenantSettings.key, TENANT_TEAM_CAREER_KEY)))
    .limit(1);

  if (existing) {
    await db
      .update(tenantSettings)
      .set({
        value: value as unknown as Record<string, unknown>,
        updatedBy: auth.userId,
        updatedAt: new Date(),
        version: (existing.version ?? 0) + 1,
      })
      .where(eq(tenantSettings.id, existing.id));
  } else {
    await db.insert(tenantSettings).values({
      tenantId: auth.tenantId,
      key: TENANT_TEAM_CAREER_KEY,
      value: value as unknown as Record<string, unknown>,
      domain: TENANT_TEAM_CAREER_DOMAIN,
      updatedBy: auth.userId,
      version: 1,
    });
  }
  return { ok: true };
}

export async function updateMemberCareer(
  membershipId: string,
  input: { careerProgram: string | null; careerTrack: string | null; careerPositionCode: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_members:write")) {
    return { ok: false, error: "Nemáte oprávnění upravovat kariérní údaje." };
  }

  const [target] = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!target || target.tenantId !== auth.tenantId) {
    return { ok: false, error: "Člen nenalezen." };
  }

  const validated = validateCareerFieldsForWrite(
    input.careerProgram,
    input.careerTrack,
    input.careerPositionCode
  );
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  await db
    .update(memberships)
    .set({
      careerProgram: validated.data.careerProgram,
      careerTrack: validated.data.careerTrack,
      careerPositionCode: validated.data.careerPositionCode,
    })
    .where(eq(memberships.id, membershipId));

  return { ok: true };
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

export type SendTeamMemberInvitationResult =
  | { ok: true; inviteLink: string; emailSent: boolean; emailError?: string }
  | { ok: false; error: string };

async function revokePendingStaffInvitationsForEmail(tenantId: string, normalizedEmail: string) {
  await db
    .update(staffInvitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(staffInvitations.tenantId, tenantId),
        sql`lower(${staffInvitations.email}) = ${normalizedEmail}`,
        isNull(staffInvitations.acceptedAt),
        isNull(staffInvitations.revokedAt),
      ),
    );
}

async function getTenantEmailContext(tenantId: string) {
  const [row] = await db
    .select({ name: tenants.name, notificationEmail: tenants.notificationEmail })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row;
}

async function updateStaffInvitationEmailStatus(invitationId: string, sendResult: SendResult) {
  if (sendResult.ok) {
    await db
      .update(staffInvitations)
      .set({ emailSentAt: new Date(), lastEmailError: null })
      .where(eq(staffInvitations.id, invitationId));
    return;
  }
  await db
    .update(staffInvitations)
    .set({ lastEmailError: sendResult.error ?? "send failed" })
    .where(eq(staffInvitations.id, invitationId));
}

/** Pozvánka člena týmu: e-mail s odkazem na /prihlaseni?staff_invite=… */
export async function sendTeamMemberInvitation(
  rawEmail: string,
  roleName: string,
): Promise<SendTeamMemberInvitationResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_members:write")) {
    return { ok: false, error: "Nemáte oprávnění zvát členy týmu." };
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Zadejte platný e-mail." };
  }

  const supabaseInviter = await createClient();
  const {
    data: { user: inviterUser },
  } = await supabaseInviter.auth.getUser();
  const inviterEmail = inviterUser?.email?.trim().toLowerCase() ?? null;
  if (inviterEmail && email === inviterEmail) {
    return { ok: false, error: "Nemůžete pozvat sami sebe." };
  }

  const allowedNames: RoleName[] = ["Admin", "Director", "Manager", "Advisor", "Viewer"];
  if (!allowedNames.includes(roleName as RoleName)) {
    return { ok: false, error: "Neplatná role." };
  }
  const targetRole = roleName as RoleName;
  if (targetRole === "Client") {
    return { ok: false, error: "Klienty zvete z kontaktu, ne z týmu." };
  }

  if (!isRoleAtLeast(auth.roleName, targetRole)) {
    return { ok: false, error: "Nemůžete přidělit roli vyšší než vlastní." };
  }

  const [roleRow] = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(and(eq(roles.tenantId, auth.tenantId), eq(roles.name, roleName)))
    .limit(1);

  if (!roleRow) {
    return { ok: false, error: `Role „${roleName}“ v tomto workspace neexistuje.` };
  }

  const [existingProfile] = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(sql`lower(${userProfiles.email}) = ${email}`)
    .limit(1);

  if (existingProfile?.userId) {
    const existingMemberships = await db
      .select({ tenantId: memberships.tenantId })
      .from(memberships)
      .where(eq(memberships.userId, existingProfile.userId));

    if (existingMemberships.some((m) => m.tenantId === auth.tenantId)) {
      return { ok: false, error: "Tento uživatel už je členem vašeho týmu." };
    }
    if (existingMemberships.length > 0) {
      return {
        ok: false,
        error:
          "Tento e-mail je už zaregistrován v jiném workspace Aidvisora. Více tenantů na jeden účet zatím nepodporujeme — použijte prosím jiný e-mail.",
      };
    }
  }

  const authUser = await findAuthUserByEmail(email);
  if (authUser) {
    const mRows = await db
      .select({ tenantId: memberships.tenantId })
      .from(memberships)
      .where(eq(memberships.userId, authUser.id));
    if (mRows.some((m) => m.tenantId === auth.tenantId)) {
      return { ok: false, error: "Tento uživatel už je členem vašeho týmu." };
    }
    if (mRows.length > 0) {
      return {
        ok: false,
        error:
          "Tento e-mail je už zaregistrován v jiném workspace Aidvisora. Více tenantů na jeden účet zatím nepodporujeme — použijte prosím jiný e-mail.",
      };
    }
  }

  await revokePendingStaffInvitationsForEmail(auth.tenantId, email);

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + STAFF_INVITE_EXPIRY_DAYS);

  const [inserted] = await db
    .insert(staffInvitations)
    .values({
      tenantId: auth.tenantId,
      roleId: roleRow.id,
      email,
      token,
      expiresAt,
      invitedByUserId: auth.userId,
    })
    .returning({ id: staffInvitations.id });

  const baseUrl = getServerAppBaseUrl();
  const inviteLink = `${baseUrl}/prihlaseni?${STAFF_INVITE_QUERY_PARAM}=${encodeURIComponent(token)}`;

  const tenantRow = await getTenantEmailContext(auth.tenantId);
  const roleLabel = ROLE_LABEL_CS[targetRole] ?? roleName;

  const [inviterProfile] = await db
    .select({ fullName: userProfiles.fullName })
    .from(userProfiles)
    .where(eq(userProfiles.userId, auth.userId))
    .limit(1);
  const metaFullName =
    typeof inviterUser?.user_metadata?.full_name === "string"
      ? inviterUser.user_metadata.full_name.trim()
      : "";
  const inviterDisplayName =
    inviterProfile?.fullName?.trim() || metaFullName || inviterUser?.email?.trim() || "člen týmu";

  const { subject, html } = staffTeamInviteTemplate({
    loginUrl: inviteLink,
    inviterDisplayName,
    inviteeEmail: email,
    roleLabel,
    expiresInDays: STAFF_INVITE_EXPIRY_DAYS,
  });

  const replyTo = resolveResendReplyTo(tenantRow?.notificationEmail ?? undefined);
  const sendResult = await sendEmail({
    to: email,
    subject,
    html,
    replyTo,
  });

  if (inserted?.id) {
    try {
      await updateStaffInvitationEmailStatus(inserted.id, sendResult);
    } catch (e) {
      console.error("[sendTeamMemberInvitation] email status update failed:", e);
    }
  }

  return {
    ok: true,
    inviteLink,
    emailSent: sendResult.ok,
    emailError: sendResult.ok ? undefined : sendResult.error,
  };
}

/**
 * Po přihlášení / registraci: přidá membership podle platné staff pozvánky.
 * Volá se z /register/complete před provisionWorkspaceIfNeeded.
 */
export async function finalizePendingStaffInvitation(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = token.trim().toLowerCase();
  if (t.length !== 32) {
    return { ok: false, error: "Neplatný token pozvánky." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: "Nejste přihlášeni." };
  }

  const userEmail = user.email.trim().toLowerCase();

  const [inv] = await db
    .select({
      id: staffInvitations.id,
      tenantId: staffInvitations.tenantId,
      roleId: staffInvitations.roleId,
      email: staffInvitations.email,
      expiresAt: staffInvitations.expiresAt,
      acceptedAt: staffInvitations.acceptedAt,
      revokedAt: staffInvitations.revokedAt,
      invitedByUserId: staffInvitations.invitedByUserId,
    })
    .from(staffInvitations)
    .where(eq(staffInvitations.token, t))
    .limit(1);

  if (!inv) {
    return { ok: false, error: "Pozvánka neexistuje nebo už byla zrušena." };
  }
  if (inv.revokedAt) {
    return { ok: false, error: "Tato pozvánka byla zrušena. Požádejte o novou." };
  }
  if (inv.expiresAt <= new Date()) {
    return { ok: false, error: "Pozvánka vypršela. Požádejte o novou pozvánku." };
  }
  if (userEmail !== inv.email.trim().toLowerCase()) {
    return {
      ok: false,
      error: `Přihlaste se e-mailem ${inv.email}, na který byla pozvánka odeslána.`,
    };
  }

  const userMemberships = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userId, user.id));

  const alreadyInTarget = userMemberships.some((m) => m.tenantId === inv.tenantId);
  if (alreadyInTarget) {
    if (!inv.acceptedAt) {
      await db
        .update(staffInvitations)
        .set({ acceptedAt: new Date(), authUserId: user.id })
        .where(eq(staffInvitations.id, inv.id));
    }
    return { ok: true };
  }

  if (userMemberships.length > 0) {
    return {
      ok: false,
      error:
        "Váš účet je už propojený s jiným workspace. Pozvánku do tohoto týmu nelze použít — použijte jiný e-mail nebo kontaktujte administrátora.",
    };
  }

  await db.insert(memberships).values({
    tenantId: inv.tenantId,
    userId: user.id,
    roleId: inv.roleId,
    invitedBy: inv.invitedByUserId ?? null,
  });

  await db
    .update(staffInvitations)
    .set({ acceptedAt: new Date(), authUserId: user.id })
    .where(eq(staffInvitations.id, inv.id));

  return { ok: true };
}
