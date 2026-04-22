"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import type { TenantContextDb } from "@/lib/db/with-tenant-context";
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
import { logAuditAction } from "@/lib/audit";
import { checkRecentAuth } from "@/lib/auth/require-recent-auth";
import {
  previewOffboarding,
  executeOffboarding,
  type OffboardingResult,
} from "@/lib/team/offboarding";

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
  return withAuthContext(async (auth, tx) => {
    const rows = await tx
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
  });
}

export async function getTenantTeamCareerDefaults(): Promise<{ defaultCareerProgram: string | null }> {
  return withAuthContext(async (auth, tx) => {
    const [row] = await tx
      .select({ value: tenantSettings.value })
      .from(tenantSettings)
      .where(and(eq(tenantSettings.tenantId, auth.tenantId), eq(tenantSettings.key, TENANT_TEAM_CAREER_KEY)))
      .limit(1);
    const raw = row?.value as TeamCareerDefaultsJson | undefined;
    const p = raw?.defaultCareerProgram ?? null;
    if (p === "beplan" || p === "premium_brokers") return { defaultCareerProgram: p };
    return { defaultCareerProgram: null };
  });
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

  await withTenantContextFromAuth(auth, async (tx) => {
    const [existing] = await tx
      .select({ id: tenantSettings.id, version: tenantSettings.version })
      .from(tenantSettings)
      .where(and(eq(tenantSettings.tenantId, auth.tenantId), eq(tenantSettings.key, TENANT_TEAM_CAREER_KEY)))
      .limit(1);

    if (existing) {
      await tx
        .update(tenantSettings)
        .set({
          value: value as unknown as Record<string, unknown>,
          updatedBy: auth.userId,
          updatedAt: new Date(),
          version: (existing.version ?? 0) + 1,
        })
        .where(eq(tenantSettings.id, existing.id));
    } else {
      await tx.insert(tenantSettings).values({
        tenantId: auth.tenantId,
        key: TENANT_TEAM_CAREER_KEY,
        value: value as unknown as Record<string, unknown>,
        domain: TENANT_TEAM_CAREER_DOMAIN,
        updatedBy: auth.userId,
        version: 1,
      });
    }
  });
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

  return withTenantContextFromAuth(auth, async (tx) => {
    const [target] = await tx
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

    await tx
      .update(memberships)
      .set({
        careerProgram: validated.data.careerProgram,
        careerTrack: validated.data.careerTrack,
        careerPositionCode: validated.data.careerPositionCode,
      })
      .where(eq(memberships.id, membershipId));

    return { ok: true };
  });
}

export async function updateMemberRole(
  membershipId: string,
  newRoleName: string,
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_members:write")) {
    return { ok: false, error: "Nemáte oprávnění měnit role." };
  }
  // P1 — privilege escalation = fresh auth do 15 min. Fail-open
  // varianta: když Supabase session nemá `last_sign_in_at`, nechceme padnout,
  // ale zároveň to je známka, že někdo jede přes exotickou auth flow, tak
  // requireme re-auth stejně.
  {
    const recent = await checkRecentAuth({ action: "team.update_role", maxAgeSeconds: 900 });
    if (!recent.ok) {
      return {
        ok: false,
        code: "REAUTH_REQUIRED",
        error: "Změna role vyžaduje nedávné přihlášení. Přihlaste se prosím znovu.",
      };
    }
  }

  const result = await withTenantContextFromAuth(auth, async (tx) => {
    const [target] = await tx
      .select({ tenantId: memberships.tenantId, userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.id, membershipId))
      .limit(1);

    if (!target || target.tenantId !== auth.tenantId) {
      return { ok: false as const, error: "Člen nenalezen." };
    }

    if (target.userId === auth.userId) {
      return { ok: false as const, error: "Nemůžete změnit svou vlastní roli." };
    }

    const [roleRow] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.tenantId, auth.tenantId), eq(roles.name, newRoleName)))
      .limit(1);

    if (!roleRow) {
      return { ok: false as const, error: `Role "${newRoleName}" neexistuje.` };
    }

    if (!isRoleAtLeast(auth.roleName, newRoleName as RoleName)) {
      return { ok: false as const, error: "Nemůžete přidělit roli vyšší než vlastní." };
    }

    // Načteme původní roli pro audit log (interní, informativní — není to rozhodnutí o klientovi).
    const [previousRole] = await tx
      .select({ name: roles.name })
      .from(memberships)
      .innerJoin(roles, eq(memberships.roleId, roles.id))
      .where(eq(memberships.id, membershipId))
      .limit(1);

    await tx
      .update(memberships)
      .set({ roleId: roleRow.id })
      .where(eq(memberships.id, membershipId));

    return {
      ok: true as const,
      targetUserId: target.userId,
      previousRoleName: previousRole?.name ?? null,
    };
  });

  if (!result.ok) {
    return result;
  }

  // WS-2 Batch 2 / minimal audit coverage — role change.
  logAuditAction({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: "team.role_change",
    entityType: "membership",
    entityId: membershipId,
    meta: {
      targetUserId: result.targetUserId,
      previousRole: result.previousRoleName,
      newRole: newRoleName,
      performedByRole: auth.roleName,
    },
  });

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

  return withTenantContextFromAuth(auth, async (tx) => {
    const [target] = await tx
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

    await tx
      .update(memberships)
      .set({ parentId: parentUserId })
      .where(eq(memberships.id, membershipId));

    return { ok: true };
  });
}

/**
 * Delta A7: Preview dopadu offboardingu — kolik úkolů, eventů, oppů, integrací se převede /
 * odvolá. Voláno z klienta PŘED zobrazením confirm dialogu, aby admin viděl rozsah.
 */
export async function getMemberOffboardingPreview(
  membershipId: string,
): Promise<
  | { ok: true; counts: Awaited<ReturnType<typeof previewOffboarding>>; userId: string }
  | { ok: false; error: string }
> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_members:write")) {
    return { ok: false, error: "Nemáte oprávnění odebírat členy." };
  }
  const target = await withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx
      .select({ tenantId: memberships.tenantId, userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.id, membershipId))
      .limit(1);
    return row;
  });
  if (!target || target.tenantId !== auth.tenantId) {
    return { ok: false, error: "Člen nenalezen." };
  }
  const counts = await previewOffboarding(auth.tenantId, target.userId);
  return { ok: true, counts, userId: target.userId };
}

export async function removeMember(
  membershipId: string,
  options?: { transferToUserId?: string },
): Promise<{
  ok: boolean;
  error?: string;
  code?: string;
  offboarding?: OffboardingResult;
}> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_members:write")) {
    return { ok: false, error: "Nemáte oprávnění odebírat členy." };
  }
  // P1 — odebrání člena je reverzibilní pozvánkou, ale na 30 minut stačí
  // freshness check.
  {
    const recent = await checkRecentAuth({ action: "team.remove_member", maxAgeSeconds: 1800 });
    if (!recent.ok) {
      return {
        ok: false,
        code: "REAUTH_REQUIRED",
        error: "Odebrání člena týmu vyžaduje nedávné přihlášení. Přihlaste se prosím znovu.",
      };
    }
  }

  const target = await withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx
      .select({ tenantId: memberships.tenantId, userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.id, membershipId))
      .limit(1);
    return row;
  });

  if (!target || target.tenantId !== auth.tenantId) {
    return { ok: false, error: "Člen nenalezen." };
  }

  if (target.userId === auth.userId) {
    return { ok: false, error: "Nemůžete odebrat sami sebe." };
  }

  // Delta A7 — ownership transfer: pokud má user aktivní assignments / integrace,
  // vyžadujeme explicitní volbu nástupce (transferToUserId). Jinak by úkoly / eventy
  // zmizely z pohledu všech ostatních a Google tokeny by zůstaly platné.
  const counts = await previewOffboarding(auth.tenantId, target.userId);
  const hasAssignments =
    counts.tasksAssigned > 0 || counts.eventsAssigned > 0 || counts.opportunitiesAssigned > 0;
  const hasIntegrations =
    counts.googleDriveIntegrations > 0 ||
    counts.googleGmailIntegrations > 0 ||
    counts.googleCalendarIntegrations > 0 ||
    counts.pushDevices > 0;

  let offboardingResult: OffboardingResult | undefined;

  if (hasAssignments) {
    if (!options?.transferToUserId) {
      return {
        ok: false,
        code: "TRANSFER_REQUIRED",
        error:
          "Člen má přiřazené úkoly, události nebo příležitosti. Vyberte nástupce, na kterého se převedou.",
      };
    }
    if (options.transferToUserId === target.userId) {
      return {
        ok: false,
        error: "Nástupcem nemůže být stejný uživatel, kterého odebíráte.",
      };
    }
    offboardingResult = await executeOffboarding(
      auth.tenantId,
      target.userId,
      options.transferToUserId,
    );
  } else if (hasIntegrations) {
    // I bez assignments smažeme integrace (tokeny, devices) — bezpečnostní default.
    offboardingResult = await executeOffboarding(
      auth.tenantId,
      target.userId,
      options?.transferToUserId || auth.userId,
    );
  }

  await withTenantContextFromAuth(auth, (tx) =>
    tx.delete(memberships).where(eq(memberships.id, membershipId)),
  );

  logAuditAction({
    action: "team.remove_member",
    tenantId: auth.tenantId,
    userId: auth.userId,
    meta: {
      removedUserId: target.userId,
      transferToUserId: options?.transferToUserId ?? null,
      reassigned: offboardingResult?.reassigned ?? null,
      revoked: offboardingResult?.revoked ?? null,
    },
  });

  return { ok: true, offboarding: offboardingResult };
}

export type SendTeamMemberInvitationResult =
  | { ok: true; inviteLink: string; emailSent: boolean; emailError?: string }
  | { ok: false; error: string };

async function revokePendingStaffInvitationsForEmail(
  tx: TenantContextDb,
  tenantId: string,
  normalizedEmail: string,
) {
  await tx
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

async function getTenantEmailContext(tx: TenantContextDb, tenantId: string) {
  const [row] = await tx
    .select({ name: tenants.name, notificationEmail: tenants.notificationEmail })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row;
}

async function updateStaffInvitationEmailStatus(
  tx: TenantContextDb,
  invitationId: string,
  sendResult: SendResult,
) {
  if (sendResult.ok) {
    await tx
      .update(staffInvitations)
      .set({ emailSentAt: new Date(), lastEmailError: null })
      .where(eq(staffInvitations.id, invitationId));
    return;
  }
  await tx
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

  // Phase 1: resolve role + preflight on existing memberships (Supabase Auth lookup done separately).
  const preflight = await withTenantContextFromAuth(auth, async (tx) => {
    const [roleRow] = await tx
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(and(eq(roles.tenantId, auth.tenantId), eq(roles.name, roleName)))
      .limit(1);

    if (!roleRow) {
      return { kind: "error" as const, error: `Role „${roleName}“ v tomto workspace neexistuje.` };
    }

    const [existingProfile] = await tx
      .select({ userId: userProfiles.userId })
      .from(userProfiles)
      .where(sql`lower(${userProfiles.email}) = ${email}`)
      .limit(1);

    if (existingProfile?.userId) {
      const existingMemberships = await tx
        .select({ tenantId: memberships.tenantId })
        .from(memberships)
        .where(eq(memberships.userId, existingProfile.userId));

      if (existingMemberships.some((m) => m.tenantId === auth.tenantId)) {
        return { kind: "error" as const, error: "Tento uživatel už je členem vašeho týmu." };
      }
      if (existingMemberships.length > 0) {
        return {
          kind: "error" as const,
          error:
            "Tento e-mail je už zaregistrován v jiném workspace Aidvisora. Více tenantů na jeden účet zatím nepodporujeme — použijte prosím jiný e-mail.",
        };
      }
    }

    return { kind: "ok" as const, roleId: roleRow.id };
  });

  if (preflight.kind === "error") {
    return { ok: false, error: preflight.error };
  }

  const authUser = await findAuthUserByEmail(email);
  if (authUser) {
    const mRows = await withTenantContextFromAuth(auth, (tx) =>
      tx
        .select({ tenantId: memberships.tenantId })
        .from(memberships)
        .where(eq(memberships.userId, authUser.id)),
    );
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

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + STAFF_INVITE_EXPIRY_DAYS);

  // Phase 2: revoke previous invitations, insert new one, resolve mail context + inviter profile.
  const prep = await withTenantContextFromAuth(auth, async (tx) => {
    await revokePendingStaffInvitationsForEmail(tx, auth.tenantId, email);

    const [inserted] = await tx
      .insert(staffInvitations)
      .values({
        tenantId: auth.tenantId,
        roleId: preflight.roleId,
        email,
        token,
        expiresAt,
        invitedByUserId: auth.userId,
      })
      .returning({ id: staffInvitations.id });

    const tenantRow = await getTenantEmailContext(tx, auth.tenantId);

    const [inviterProfile] = await tx
      .select({ fullName: userProfiles.fullName })
      .from(userProfiles)
      .where(eq(userProfiles.userId, auth.userId))
      .limit(1);

    return { insertedId: inserted?.id, tenantRow, inviterProfile };
  });

  const baseUrl = getServerAppBaseUrl();
  const inviteLink = `${baseUrl}/prihlaseni?${STAFF_INVITE_QUERY_PARAM}=${encodeURIComponent(token)}`;

  const roleLabel = ROLE_LABEL_CS[targetRole] ?? roleName;
  const metaFullName =
    typeof inviterUser?.user_metadata?.full_name === "string"
      ? inviterUser.user_metadata.full_name.trim()
      : "";
  const inviterDisplayName =
    prep.inviterProfile?.fullName?.trim() || metaFullName || inviterUser?.email?.trim() || "člen týmu";

  const { subject, html } = staffTeamInviteTemplate({
    loginUrl: inviteLink,
    inviterDisplayName,
    inviteeEmail: email,
    roleLabel,
    expiresInDays: STAFF_INVITE_EXPIRY_DAYS,
  });

  const replyTo = resolveResendReplyTo(prep.tenantRow?.notificationEmail ?? undefined);
  const sendResult = await sendEmail({
    to: email,
    subject,
    html,
    replyTo,
  });

  if (prep.insertedId) {
    try {
      await withTenantContextFromAuth(auth, (tx) =>
        updateStaffInvitationEmailStatus(tx, prep.insertedId!, sendResult),
      );
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
 *
 * Bootstrap pre-tenant flow: uživatel je přihlášený v Supabase (máme `auth.uid()`),
 * ale ještě nemá membership ⇒ neznáme `tenantId` pro GUC. Runtime pod `aidvisora_app`
 * (NOBYPASSRLS, FORCE RLS) by raw `db.*` volání proti `staff_invitations` /
 * `memberships` nepovolil. Používáme proto SECURITY DEFINER funkci
 * `public.accept_staff_invitation_v1` (rls-m9-bootstrap-sd-functions), která
 * uvnitř ownerské identity ověří token + expiraci + revoke + email match
 * a atomicky vloží membership + stampne invitation.
 *
 * Nepoužívá `withAuthContext`, protože `requireAuthInAction` redirectuje uživatele
 * bez membership na /register/complete (dokud neproběhne tato funkce).
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

  type AcceptRow = {
    ok: boolean;
    error_code: string | null;
    tenant_id: string | null;
    already_member: boolean;
  };

  const rows = (await db.execute(
    sql`select ok, error_code, tenant_id, already_member
        from public.accept_staff_invitation_v1(${t}::text, ${user.id}::text, ${userEmail}::text)`,
  )) as unknown as AcceptRow[];
  const row = rows[0];
  if (!row) {
    return { ok: false, error: "Pozvánku nelze zpracovat." };
  }
  if (row.ok) {
    return { ok: true };
  }
  const code = row.error_code ?? "unknown";
  switch (code) {
    case "not_authenticated":
      return { ok: false, error: "Nejste přihlášeni." };
    case "missing_email":
      return { ok: false, error: "Váš účet nemá nastavený e-mail." };
    case "invalid_token":
      return { ok: false, error: "Neplatný token pozvánky." };
    case "not_found":
      return { ok: false, error: "Pozvánka neexistuje nebo už byla zrušena." };
    case "revoked":
      return { ok: false, error: "Tato pozvánka byla zrušena. Požádejte o novou." };
    case "expired":
      return { ok: false, error: "Pozvánka vypršela. Požádejte o novou pozvánku." };
    case "email_mismatch":
      return {
        ok: false,
        error: "Přihlaste se e-mailem, na který byla pozvánka odeslána.",
      };
    case "already_in_other_workspace":
      return {
        ok: false,
        error:
          "Váš účet je už propojený s jiným workspace. Pozvánku do tohoto týmu nelze použít — použijte jiný e-mail nebo kontaktujte administrátora.",
      };
    default:
      return { ok: false, error: "Pozvánku nelze zpracovat." };
  }
}
