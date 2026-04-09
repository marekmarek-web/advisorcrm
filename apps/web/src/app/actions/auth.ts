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
import { eq, and, ne, gt, inArray, isNull, sql } from "db";
import { sendEmail } from "@/lib/email/send-email";
import type { SendResult } from "@/lib/email/send-email";
import { clientPortalInviteTemplate } from "@/lib/email/templates";
import { resolveResendReplyTo } from "@/lib/email/resend-reply-to";
import { getServerAppBaseUrl } from "@/lib/url/server-app-base-url";
import { provisionClientInviteAccount } from "@/lib/auth/client-invite-account";
import { CLIENT_INVITE_USER_FACING_ERROR_MESSAGES } from "@/lib/auth/client-invite-user-facing-errors";
import { buildClientInviteLoginSearch, buildClientInvitePasswordSetupSearch } from "@/lib/auth/client-invite-url";

/** Po prvním přihlášení (OAuth nebo signup) vytvoří workspace a uživatele jako Admin, pokud ještě nemá membership. */
export async function ensureMembership(): Promise<EnsureMembershipResult> {
  return provisionWorkspaceIfNeeded();
}

const INVITE_EXPIRY_DAYS = 7;

export type SendClientZoneInvitationResult =
  | { ok: true; inviteLink: string; loginEmail: string; temporaryPassword: string; emailSent: boolean; emailError?: string }
  | { ok: false; error: string; devHint?: string };

function isSupabaseAuthErrorShape(
  err: unknown,
): err is Error & { message: string; code?: string; status?: number } {
  return typeof err === "object" && err !== null && "__isAuthError" in err && "message" in err;
}

function mapSupabaseAuthFailureToUserMessage(err: { message: string; code?: string }): string | null {
  const code = (err.code ?? "").toLowerCase();
  const msg = err.message.toLowerCase();

  if (
    code === "email_exists" ||
    code === "user_already_registered" ||
    msg.includes("already been registered") ||
    msg.includes("already exists") ||
    msg.includes("user already registered")
  ) {
    return "Účet s tímto e-mailem už v systému existuje. Zkontrolujte, zda klient nepoužívá stejný e-mail jako poradce, nebo zkuste jiný postup pro existujícího klienta.";
  }
  if (msg.includes("invalid api key") || (msg.includes("jwt") && msg.includes("invalid"))) {
    return "Chyba přístupu k účtům (Supabase). Zkontrolujte SUPABASE_SERVICE_ROLE_KEY a NEXT_PUBLIC_SUPABASE_URL.";
  }
  if (code === "over_request_rate_limit" || msg.includes("rate limit")) {
    return "Příliš mnoho požadavků. Zkuste to za chvíli znovu.";
  }
  return null;
}

function resolveSendClientZoneInvitationCatchError(err: unknown): { userMessage: string; devHint?: string } {
  const generic = "Nepodařilo se odeslat pozvánku. Zkuste to znovu.";
  const isDev = process.env.NODE_ENV === "development";

  const devHintFrom = (e: unknown): string | undefined => {
    if (!isDev) return undefined;
    if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 500);
    if (typeof e === "object" && e !== null && "message" in e) {
      return String((e as { message: unknown }).message).slice(0, 500);
    }
    return String(e).slice(0, 500);
  };

  if (isSupabaseAuthErrorShape(err)) {
    const mapped = mapSupabaseAuthFailureToUserMessage(err);
    if (mapped) return { userMessage: mapped, devHint: devHintFrom(err) };
    return {
      userMessage: isDev ? `Autentizace: ${err.message}` : generic,
      devHint: devHintFrom(err),
    };
  }

  if (err instanceof Error) {
    if (CLIENT_INVITE_USER_FACING_ERROR_MESSAGES.has(err.message)) {
      return { userMessage: err.message };
    }
    if (err.message === "Supabase account provisioning returned no user.") {
      return {
        userMessage: isDev ? err.message : "Nepodařilo se připravit účet klienta. Zkuste to znovu.",
        devHint: devHintFrom(err),
      };
    }
    const low = err.message.toLowerCase();
    if (low.includes("econnrefused") || low.includes("etimedout") || low.includes("database_url")) {
      return {
        userMessage: "Nepodařilo se připojit k databázi. Zkontrolujte DATABASE_URL a dostupnost serveru.",
        devHint: devHintFrom(err),
      };
    }
  }

  return { userMessage: generic, devHint: devHintFrom(err) };
}

const CLIENT_INVITATION_OPTIONAL_COLUMNS = [
  "auth_user_id",
  "invited_by_user_id",
  "temporary_password_sent_at",
  "password_change_required_at",
  "password_changed_at",
  "email_sent_at",
  "last_email_error",
  "revoked_at",
] as const;
const TENANT_OPTIONAL_COLUMNS = ["notification_email"] as const;

type ClientInvitationRecord = {
  id: string;
  tenantId: string;
  contactId: string;
  email: string;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  authUserId: string | null;
  passwordChangeRequiredAt: Date | null;
  passwordChangedAt: Date | null;
};

function isMissingClientInvitationAuditColumnError(err: unknown): boolean {
  const message = String((err as { message?: string } | null)?.message ?? err).toLowerCase();
  return (
    message.includes("client_invitations") &&
    CLIENT_INVITATION_OPTIONAL_COLUMNS.some((column) => message.includes(column))
  );
}

function isMissingTenantOptionalColumnError(err: unknown): boolean {
  const message = String((err as { message?: string } | null)?.message ?? err).toLowerCase();
  return message.includes("tenants") && TENANT_OPTIONAL_COLUMNS.some((column) => message.includes(column));
}

async function revokePendingClientInvitations(tenantId: string, contactId: string) {
  try {
    await db
      .update(clientInvitations as any)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(clientInvitations.tenantId, tenantId),
          eq(clientInvitations.contactId, contactId),
          isNull(clientInvitations.acceptedAt),
          isNull(clientInvitations.revokedAt),
        ) as any,
      );
  } catch (err) {
    if (!isMissingClientInvitationAuditColumnError(err)) throw err;
    console.warn("[sendClientZoneInvitation] client_invitations audit columns missing; skipping revoke step");
  }
}

async function insertClientInvitation(params: {
  tenantId: string;
  contactId: string;
  email: string;
  authUserId: string;
  token: string;
  expiresAt: Date;
  invitedByUserId: string;
  temporaryPasswordSentAt: Date;
  passwordChangeRequiredAt: Date;
}) {
  try {
    const [inserted] = await db
      .insert(clientInvitations as any)
      .values({
        tenantId: params.tenantId,
        contactId: params.contactId,
        email: params.email,
        authUserId: params.authUserId,
        token: params.token,
        expiresAt: params.expiresAt,
        invitedByUserId: params.invitedByUserId,
        temporaryPasswordSentAt: params.temporaryPasswordSentAt,
        passwordChangeRequiredAt: params.passwordChangeRequiredAt,
      })
      .returning({ id: clientInvitations.id } as any);
    return inserted;
  } catch (err) {
    if (!isMissingClientInvitationAuditColumnError(err)) throw err;
    console.warn("[sendClientZoneInvitation] client_invitations audit columns missing; inserting legacy row");
    const [inserted] = await db
      .insert(clientInvitations as any)
      .values({
        tenantId: params.tenantId,
        contactId: params.contactId,
        email: params.email,
        token: params.token,
        expiresAt: params.expiresAt,
      })
      .returning({ id: clientInvitations.id } as any);
    return inserted;
  }
}

async function getClientInvitationByToken(token: string): Promise<ClientInvitationRecord | null> {
  try {
    const rows = await db
      .select({
        id: clientInvitations.id,
        tenantId: clientInvitations.tenantId,
        contactId: clientInvitations.contactId,
        email: clientInvitations.email,
        token: clientInvitations.token,
        expiresAt: clientInvitations.expiresAt,
        acceptedAt: clientInvitations.acceptedAt,
        revokedAt: clientInvitations.revokedAt,
        authUserId: clientInvitations.authUserId,
        passwordChangeRequiredAt: clientInvitations.passwordChangeRequiredAt,
        passwordChangedAt: clientInvitations.passwordChangedAt,
      } as any)
      .from(clientInvitations as any)
      .where(eq(clientInvitations.token, token) as any)
      .limit(1);
    return (rows[0] as ClientInvitationRecord | undefined) ?? null;
  } catch (err) {
    if (!isMissingClientInvitationAuditColumnError(err)) throw err;
    const rows = await db
      .select({
        id: clientInvitations.id,
        tenantId: clientInvitations.tenantId,
        contactId: clientInvitations.contactId,
        email: clientInvitations.email,
        token: clientInvitations.token,
        expiresAt: clientInvitations.expiresAt,
        acceptedAt: clientInvitations.acceptedAt,
        revokedAt: clientInvitations.revokedAt,
      } as any)
      .from(clientInvitations as any)
      .where(eq(clientInvitations.token, token) as any)
      .limit(1);
    const row = rows[0] as
      | Omit<ClientInvitationRecord, "authUserId" | "passwordChangeRequiredAt" | "passwordChangedAt">
      | undefined;
    if (!row) return null;
    return {
      ...row,
      authUserId: null,
      passwordChangeRequiredAt: null,
      passwordChangedAt: null,
    };
  }
}

async function updateClientInvitationState(invitationId: string, values: Record<string, unknown>) {
  try {
    await db
      .update(clientInvitations as any)
      .set(values)
      .where(eq(clientInvitations.id, invitationId) as any);
  } catch (err) {
    if (!isMissingClientInvitationAuditColumnError(err)) throw err;
    const fallbackValues: Record<string, unknown> = {};
    if ("acceptedAt" in values) fallbackValues.acceptedAt = values.acceptedAt;
    if ("emailSentAt" in values) fallbackValues.emailSentAt = values.emailSentAt;
    if ("lastEmailError" in values) fallbackValues.lastEmailError = values.lastEmailError;
    if ("revokedAt" in values) fallbackValues.revokedAt = values.revokedAt;
    if (Object.keys(fallbackValues).length === 0) return;
    await db
      .update(clientInvitations as any)
      .set(fallbackValues)
      .where(eq(clientInvitations.id, invitationId) as any);
  }
}

async function findPendingClientPasswordChangeTokenByEmail(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const rows = await db
      .select({ token: clientInvitations.token } as any)
      .from(clientInvitations as any)
      .where(
        and(
          sql`lower(${clientInvitations.email}) = ${normalizedEmail}`,
          gt(clientInvitations.expiresAt, new Date()),
          isNull(clientInvitations.revokedAt),
          isNull(clientInvitations.passwordChangedAt),
        ) as any,
      )
      .limit(1);
    return (rows[0]?.token as string | undefined) ?? null;
  } catch (err) {
    if (!isMissingClientInvitationAuditColumnError(err)) throw err;
    return null;
  }
}

async function ensureClientRole(tenantId: string) {
  const [clientRole] = await db
    .select({ id: roles.id } as any)
    .from(roles as any)
    .where(and(eq(roles.tenantId, tenantId), eq(roles.name, "Client")) as any)
    .limit(1);
  return clientRole;
}

async function finalizeClientInvitationAccess(invitation: ClientInvitationRecord, userId: string, gdprConsent?: boolean) {
  const membershipRows = await db
    .select({ id: memberships.id, roleName: roles.name } as any)
    .from(memberships as any)
    .innerJoin(roles as any, eq(memberships.roleId, roles.id) as any)
    .where(and(eq(memberships.tenantId, invitation.tenantId), eq(memberships.userId, userId)) as any)
    .limit(1);
  const membershipRow = membershipRows[0] as { id: string; roleName: string } | undefined;

  if (membershipRow && membershipRow.roleName !== "Client") {
    return { ok: false as const, error: "Tento účet už používá jinou roli. Pro klientský portál použijte jiný e-mail." };
  }

  if (!membershipRow) {
    const clientRole = await ensureClientRole(invitation.tenantId);
    if (!clientRole) return { ok: false as const, error: "Role Client v tenantu chybí" };
    await db.insert(memberships as any).values({
      tenantId: invitation.tenantId,
      userId,
      roleId: clientRole.id,
    });
  }

  const [linkedContact] = await db
    .select({ userId: clientContacts.userId } as any)
    .from(clientContacts as any)
    .where(and(eq(clientContacts.tenantId, invitation.tenantId), eq(clientContacts.contactId, invitation.contactId)) as any)
    .limit(1);

  if (linkedContact && linkedContact.userId !== userId) {
    return { ok: false as const, error: "Kontakt už je propojený s jiným klientským účtem." };
  }

  if (!linkedContact) {
    await db.insert(clientContacts as any).values({
      tenantId: invitation.tenantId,
      userId,
      contactId: invitation.contactId,
    });
  }

  await updateClientInvitationState(invitation.id, {
    acceptedAt: invitation.acceptedAt ?? new Date(),
    authUserId: userId,
  });

  if (gdprConsent) {
    await db
      .update(contacts as any)
      .set({ gdprConsentAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, invitation.contactId) as any);
  }

  return { ok: true as const };
}

async function updateClientInvitationEmailStatus(invitationId: string, sendResult: SendResult) {
  try {
    if (sendResult.ok) {
      await db
        .update(clientInvitations as any)
        .set({ emailSentAt: new Date(), lastEmailError: null })
        .where(eq(clientInvitations.id, invitationId) as any);
      return;
    }
    await db
      .update(clientInvitations as any)
      .set({ lastEmailError: sendResult.error ?? "send failed" })
      .where(eq(clientInvitations.id, invitationId) as any);
  } catch (err) {
    if (isMissingClientInvitationAuditColumnError(err)) {
      console.warn("[sendClientZoneInvitation] client_invitations audit columns missing; skipping email status update");
      return;
    }
    throw err;
  }
}

async function getTenantInviteEmailContext(tenantId: string) {
  try {
    const [tenantRow] = await db
      .select({ name: tenants.name, notificationEmail: tenants.notificationEmail } as any)
      .from(tenants as any)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return tenantRow;
  } catch (err) {
    if (!isMissingTenantOptionalColumnError(err)) throw err;
    console.warn("[sendClientZoneInvitation] tenants.notification_email missing; continuing without tenant reply-to");
    const [tenantRow] = await db
      .select({ name: tenants.name } as any)
      .from(tenants as any)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return tenantRow;
  }
}

/** Vytvoří pozvánku do Client Zone, odešle e-mail (Resend při RESEND_API_KEY) a vrátí odkaz. */
export async function sendClientZoneInvitation(contactId: string): Promise<SendClientZoneInvitationResult> {
  try {
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
        lastName: contacts.lastName,
      } as any)
      .from(contacts as any)
      .where(and(eq(contacts.tenantId, membership.tenantId), eq(contacts.id, contactId)) as any)
      .limit(1);
    if (!contact) return { ok: false, error: "Kontakt nenalezen" };
    if (!contact.email) return { ok: false, error: "U kontaktu chybí e-mail" };

    const preparedAccount = await provisionClientInviteAccount({
      email: contact.email.trim(),
      fullName: `${contact.firstName?.trim() ?? ""} ${contact.lastName?.trim() ?? ""}`.trim() || null,
      tenantId: contact.tenantId,
      contactId: contact.id,
    });

    await revokePendingClientInvitations(contact.tenantId, contact.id);

    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);
    const passwordChangeRequiredAt = new Date();
    const inserted = await insertClientInvitation({
      tenantId: contact.tenantId,
      contactId: contact.id,
      email: contact.email.trim().toLowerCase(),
      authUserId: preparedAccount.userId,
      token,
      expiresAt,
      invitedByUserId: user.id,
      temporaryPasswordSentAt: new Date(),
      passwordChangeRequiredAt,
    });

    const baseUrl = getServerAppBaseUrl();
    const inviteLink = `${baseUrl}/prihlaseni?${buildClientInviteLoginSearch(token)}`;

    const tenantRow = await getTenantInviteEmailContext(contact.tenantId);

    const { subject, html } = clientPortalInviteTemplate({
      registerUrl: inviteLink,
      contactFirstName: contact.firstName?.trim() ?? "",
      tenantName: tenantRow?.name ?? undefined,
      loginEmail: contact.email.trim(),
      temporaryPassword: preparedAccount.temporaryPassword,
      reusedExistingAccount: preparedAccount.reusedExistingUser,
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
      try {
        await updateClientInvitationEmailStatus(inserted.id, sendResult);
      } catch (dbErr) {
        console.error("[sendClientZoneInvitation] failed to update email status:", dbErr);
      }
    }

    return {
      ok: true,
      inviteLink,
      loginEmail: contact.email.trim(),
      temporaryPassword: preparedAccount.temporaryPassword,
      emailSent: sendResult.ok,
      emailError: sendResult.ok ? undefined : sendResult.error,
    };
  } catch (err) {
    const logPayload = isSupabaseAuthErrorShape(err)
      ? {
          name: err.name,
          message: err.message,
          stack: err.stack,
          code: err.code,
          status: err.status,
        }
      : err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : err;
    console.error("[sendClientZoneInvitation] unexpected error:", logPayload);
    const { userMessage, devHint } = resolveSendClientZoneInvitationCatchError(err);
    return { ok: false, error: userMessage, ...(devHint ? { devHint } : {}) };
  }
}

/** Po registraci klienta (email + token) propojí user_id → contact_id a vytvoří membership Client. gdprConsent: uloží souhlas s GDPR u kontaktu. */
export async function acceptClientInvitation(token: string, gdprConsent?: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nejprve se přihlaste nebo zaregistrujte" };
  const inv = await getClientInvitationByToken(token);
  if (!inv) return { ok: false, error: "Pozvánka neexistuje nebo vypršela" };
  if (inv.expiresAt <= new Date() || inv.revokedAt) return { ok: false, error: "Pozvánka neexistuje nebo vypršela" };
  const email = user.email?.toLowerCase();
  if (email !== inv.email.toLowerCase()) return { ok: false, error: "E-mail se neshoduje s pozvánkou" };
  const access = await finalizeClientInvitationAccess(inv, user.id, gdprConsent);
  return access.ok ? { ok: true } : access;
}

export async function continueClientInvitationAfterLogin(
  token: string,
): Promise<{ ok: true; nextStep: "change_password" | "portal" } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nejprve se přihlaste." };

  const invitation = await getClientInvitationByToken(token);
  if (!invitation || invitation.expiresAt <= new Date() || invitation.revokedAt) {
    return { ok: false, error: "Pozvánka neexistuje nebo vypršela" };
  }
  if (user.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase()) {
    return { ok: false, error: "Přihlaste se stejným e-mailem, na který byla pozvánka odeslána." };
  }
  if (invitation.authUserId && invitation.authUserId !== user.id) {
    return { ok: false, error: "Pozvánka je připravená pro jiný klientský účet." };
  }

  await updateClientInvitationState(invitation.id, { authUserId: user.id });

  if (invitation.passwordChangeRequiredAt && !invitation.passwordChangedAt) {
    return { ok: true, nextStep: "change_password" };
  }

  const access = await finalizeClientInvitationAccess(invitation, user.id);
  if (!access.ok) return access;
  return { ok: true, nextStep: "portal" };
}

export async function completeClientInvitationFirstLogin(
  token: string,
  newPassword: string,
  gdprConsent: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nejprve se přihlaste." };

  const invitation = await getClientInvitationByToken(token);
  if (!invitation || invitation.expiresAt <= new Date() || invitation.revokedAt) {
    return { ok: false, error: "Pozvánka neexistuje nebo vypršela" };
  }
  if (user.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase()) {
    return { ok: false, error: "Přihlaste se stejným e-mailem, na který byla pozvánka odeslána." };
  }
  const trimmedPassword = newPassword.trim();
  if (trimmedPassword.length < 8) {
    return { ok: false, error: "Nové heslo musí mít alespoň 8 znaků." };
  }
  if (!gdprConsent) {
    return { ok: false, error: "Před dokončením přístupu potvrďte zásady zpracování osobních údajů." };
  }

  const { error } = await supabase.auth.updateUser({ password: trimmedPassword });
  if (error) return { ok: false, error: error.message };

  const access = await finalizeClientInvitationAccess(invitation, user.id, gdprConsent);
  if (!access.ok) return access;

  await updateClientInvitationState(invitation.id, {
    authUserId: user.id,
    passwordChangedAt: new Date(),
    acceptedAt: invitation.acceptedAt ?? new Date(),
  });

  return { ok: true };
}

/** Po přihlášení do klientské zóny bez pozvánky: ověří existující roli Client. */
export async function ensureClientPortalAccess(): Promise<
  { ok: true; redirectTo?: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };
  const m = await getMembership(user.id);
  if (m && m.roleName !== "Client") {
    return {
      ok: false,
      error:
        "Účet nemá přiřazený klientský přístup. Požádejte svého poradce o pozvánku do klientské zóny (e-mail s odkazem).",
    };
  }
  const pendingPasswordChangeToken = await findPendingClientPasswordChangeTokenByEmail(user.email);
  if (pendingPasswordChangeToken) {
    return {
      ok: true,
      redirectTo: `/prihlaseni/nastavit-heslo?${buildClientInvitePasswordSetupSearch(pendingPasswordChangeToken)}`,
    };
  }
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

    const nextParent: string | null = supervisorUserId ?? null;
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

function mapPortalPasswordUpdateError(err: { message: string; code?: string }): string {
  const msg = err.message.toLowerCase();
  const code = (err.code ?? "").toLowerCase();
  if (msg.includes("same") || msg.includes("identical") || msg.includes("reuse")) {
    return "Nové heslo se musí lišit od předchozího.";
  }
  if (msg.includes("weak") || msg.includes("strength") || msg.includes("too short") || code.includes("weak")) {
    return "Heslo je příliš slabé. Použijte delší heslo nebo kombinaci znaků podle pravidel projektu.";
  }
  if (msg.includes("reauth") || msg.includes("recent login") || msg.includes("session")) {
    return "Z bezpečnostních důvodů se znovu přihlaste a pak změňte heslo.";
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Příliš mnoho pokusů. Zkuste to za chvíli znovu.";
  }
  return err.message;
}

/** Změna hesla přihlášeného uživatele (Supabase Auth). */
export async function updatePortalPassword(newPassword: string): Promise<void> {
  await requireAuthInAction();
  const trimmed = newPassword?.trim();
  if (!trimmed || trimmed.length < 6) throw new Error("Heslo musí mít alespoň 6 znaků.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: trimmed });
  if (error) throw new Error(mapPortalPasswordUpdateError(error));
}

/** Synchronizace příznaku 2FA v memberships (reporting / tenant) s reálným stavem v Supabase Auth. */
export async function syncMembershipMfaEnabled(enabled: boolean): Promise<void> {
  const auth = await requireAuthInAction();
  await db
    .update(memberships)
    .set({ mfaEnabled: enabled })
    .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.userId, auth.userId)));
}
