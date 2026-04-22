"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { getMembership } from "@/lib/auth/get-membership";
import { provisionWorkspaceIfNeeded } from "@/lib/auth/ensure-workspace";
import type { EnsureMembershipResult } from "@/lib/auth/ensure-workspace";
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
import {
  withTenantContext,
  withUserContext,
  type TenantContextDb,
} from "@/lib/db/with-tenant-context";
import {
  withAuthContext,
  withTenantContextFromAuth,
} from "@/lib/auth/with-auth-context";
import { sendEmail } from "@/lib/email/send-email";
import type { SendResult } from "@/lib/email/send-email";
import { clientPortalInviteTemplate, clientPortalReminderTemplate } from "@/lib/email/templates";
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
  | {
      ok: true;
      inviteLink: string;
      loginEmail: string;
      temporaryPassword: string;
      emailSent: boolean;
      emailError?: string;
      /** Odeslán připomínkový e-mail bez nového hesla a bez nové pozvánky v DB. */
      reminderOnly?: boolean;
    }
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

async function revokePendingClientInvitations(
  tx: TenantContextDb,
  tenantId: string,
  contactId: string,
) {
  try {
    await tx
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

async function insertClientInvitation(
  tx: TenantContextDb,
  params: {
    tenantId: string;
    contactId: string;
    email: string;
    authUserId: string;
    token: string;
    expiresAt: Date;
    invitedByUserId: string;
    temporaryPasswordSentAt: Date;
    passwordChangeRequiredAt: Date;
  },
) {
  try {
    const [inserted] = await tx
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
    const [inserted] = await tx
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

async function getClientInvitationByToken(
  tx: TenantContextDb,
  token: string,
): Promise<ClientInvitationRecord | null> {
  try {
    const rows = await tx
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
    const rows = await tx
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

async function updateClientInvitationState(
  tx: TenantContextDb,
  invitationId: string,
  values: Record<string, unknown>,
) {
  try {
    await tx
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
    await tx
      .update(clientInvitations as any)
      .set(fallbackValues)
      .where(eq(clientInvitations.id, invitationId) as any);
  }
}

async function findPendingClientPasswordChangeTokenByEmail(
  tx: TenantContextDb,
  email: string | null | undefined,
) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const rows = await tx
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

async function ensureClientRole(tx: TenantContextDb, tenantId: string) {
  const [clientRole] = await tx
    .select({ id: roles.id } as any)
    .from(roles as any)
    .where(and(eq(roles.tenantId, tenantId), eq(roles.name, "Client")) as any)
    .limit(1);
  return clientRole;
}

async function finalizeClientInvitationAccess(
  tx: TenantContextDb,
  invitation: ClientInvitationRecord,
  userId: string,
  gdprConsent?: boolean,
) {
  const membershipRows = await tx
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
    const clientRole = await ensureClientRole(tx, invitation.tenantId);
    if (!clientRole) return { ok: false as const, error: "Role Client v tenantu chybí" };
    await tx.insert(memberships as any).values({
      tenantId: invitation.tenantId,
      userId,
      roleId: clientRole.id,
    });
  }

  const [linkedContact] = await tx
    .select({ userId: clientContacts.userId } as any)
    .from(clientContacts as any)
    .where(and(eq(clientContacts.tenantId, invitation.tenantId), eq(clientContacts.contactId, invitation.contactId)) as any)
    .limit(1);

  if (linkedContact && linkedContact.userId !== userId) {
    return { ok: false as const, error: "Kontakt už je propojený s jiným klientským účtem." };
  }

  if (!linkedContact) {
    await tx.insert(clientContacts as any).values({
      tenantId: invitation.tenantId,
      userId,
      contactId: invitation.contactId,
    });
  }

  await updateClientInvitationState(tx, invitation.id, {
    acceptedAt: invitation.acceptedAt ?? new Date(),
    authUserId: userId,
  });

  if (gdprConsent) {
    await tx
      .update(contacts as any)
      .set({ gdprConsentAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, invitation.contactId) as any);
  }

  return { ok: true as const };
}

async function updateClientInvitationEmailStatus(
  tx: TenantContextDb,
  invitationId: string,
  sendResult: SendResult,
) {
  try {
    if (sendResult.ok) {
      await tx
        .update(clientInvitations as any)
        .set({ emailSentAt: new Date(), lastEmailError: null })
        .where(eq(clientInvitations.id, invitationId) as any);
      return;
    }
    await tx
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

async function getTenantInviteEmailContext(tx: TenantContextDb, tenantId: string) {
  try {
    const [tenantRow] = await tx
      .select({ name: tenants.name, notificationEmail: tenants.notificationEmail } as any)
      .from(tenants as any)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return tenantRow;
  } catch (err) {
    if (!isMissingTenantOptionalColumnError(err)) throw err;
    console.warn("[sendClientZoneInvitation] tenants.notification_email missing; continuing without tenant reply-to");
    const [tenantRow] = await tx
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

    // tx1: lookup kontaktu + inviterProfile pod tenant GUCs (advisor vidí vlastní contacts).
    const preContext = await withTenantContext(
      { tenantId: membership.tenantId, userId: user.id },
      async (tx) => {
        const [contact] = await tx
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
        if (!contact) return { kind: "not-found" as const };
        if (!contact.email) return { kind: "missing-email" as const };

        const [inviterProfile] = await tx
          .select({ fullName: userProfiles.fullName })
          .from(userProfiles as any)
          .where(eq(userProfiles.userId, user.id))
          .limit(1);
        return {
          kind: "ok" as const,
          contact: contact as {
            id: string;
            email: string;
            tenantId: string;
            firstName: string | null;
            lastName: string | null;
          },
          inviterProfile: inviterProfile as { fullName: string | null } | undefined,
        };
      },
    );

    if (preContext.kind === "not-found") return { ok: false, error: "Kontakt nenalezen" };
    if (preContext.kind === "missing-email") return { ok: false, error: "U kontaktu chybí e-mail" };

    const { contact, inviterProfile } = preContext;
    const metaFullName =
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    const advisorDisplayName = inviterProfile?.fullName?.trim() || metaFullName || undefined;

    // External: Supabase Auth + interní ops v provisionClientInviteAccount (vlastní DB kontext).
    const preparedAccount = await provisionClientInviteAccount({
      email: contact.email.trim(),
      fullName: `${contact.firstName?.trim() ?? ""} ${contact.lastName?.trim() ?? ""}`.trim() || null,
      tenantId: contact.tenantId,
      contactId: contact.id,
    });

    const baseUrl = getServerAppBaseUrl();
    const gdprUrl = `${baseUrl}/gdpr`;
    const termsUrl = `${baseUrl}/terms`;

    // tx2: revoke předchozích pozvánek, načti tenant context, případně založ nový invitation.
    const tx2 = await withTenantContext(
      { tenantId: membership.tenantId, userId: user.id },
      async (tx) => {
        await revokePendingClientInvitations(tx, contact.tenantId, contact.id);
        const tenantRow = await getTenantInviteEmailContext(tx, contact.tenantId);

        if (preparedAccount.alreadyOnboarded) {
          return {
            tenantRow,
            insertedId: null as string | null,
            token: null as string | null,
          };
        }

        const token = crypto.randomUUID().replace(/-/g, "");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);
        const passwordChangeRequiredAt = new Date();
        const inserted = await insertClientInvitation(tx, {
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
        return {
          tenantRow,
          insertedId: (inserted?.id as string | undefined) ?? null,
          token: token as string | null,
        };
      },
    );
    const { tenantRow, insertedId, token } = tx2;

    if (preparedAccount.alreadyOnboarded) {
      const loginUrl = `${baseUrl}/prihlaseni`;
      const { subject, html } = clientPortalReminderTemplate({
        loginUrl,
        contactFirstName: contact.firstName?.trim() ?? "",
        advisorDisplayName,
        tenantName: tenantRow?.name ?? undefined,
        loginEmail: contact.email.trim(),
        gdprUrl,
        termsUrl,
      });
      const replyTo = resolveResendReplyTo(tenantRow?.notificationEmail ?? undefined);
      // External: Resend / SMTP.
      const sendResult = await sendEmail({
        to: contact.email.trim(),
        subject,
        html,
        replyTo,
      });
      return {
        ok: true,
        inviteLink: loginUrl,
        loginEmail: contact.email.trim(),
        temporaryPassword: "",
        emailSent: sendResult.ok,
        emailError: sendResult.ok ? undefined : sendResult.error,
        reminderOnly: true,
      };
    }

    if (!token) {
      // Chráněný kodek: pokud není alreadyOnboarded, tx2 vždy vrátí token + insertedId.
      return { ok: false, error: "Nepodařilo se vytvořit pozvánku. Zkuste to znovu." };
    }

    const inviteLink = `${baseUrl}/prihlaseni?${buildClientInviteLoginSearch(token)}`;

    const { subject, html } = clientPortalInviteTemplate({
      registerUrl: inviteLink,
      contactFirstName: contact.firstName?.trim() ?? "",
      advisorDisplayName,
      tenantName: tenantRow?.name ?? undefined,
      loginEmail: contact.email.trim(),
      temporaryPassword: preparedAccount.temporaryPassword,
      reusedExistingAccount: preparedAccount.reusedExistingUser,
      expiresInDays: INVITE_EXPIRY_DAYS,
      gdprUrl,
      termsUrl,
    });

    const replyTo = resolveResendReplyTo(tenantRow?.notificationEmail ?? undefined);
    // External: Resend / SMTP.
    const sendResult = await sendEmail({
      to: contact.email.trim(),
      subject,
      html,
      replyTo,
    });

    if (insertedId) {
      try {
        await withTenantContext(
          { tenantId: membership.tenantId, userId: user.id },
          (tx) => updateClientInvitationEmailStatus(tx, insertedId, sendResult),
        );
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

  // Bootstrap lookup: tenant ještě neznáme, nastavíme jen app.user_id → RLS
  // policy `client_invitations_self_bootstrap_select` pustí self-select přes
  // `auth_user_id = NULLIF(current_setting('app.user_id',true),'')`.
  const inv = await withUserContext(user.id, (tx) => getClientInvitationByToken(tx, token));
  if (!inv) return { ok: false, error: "Pozvánka neexistuje nebo vypršela" };
  if (inv.expiresAt <= new Date() || inv.revokedAt) return { ok: false, error: "Pozvánka neexistuje nebo vypršela" };
  const email = user.email?.toLowerCase();
  if (email !== inv.email.toLowerCase()) return { ok: false, error: "E-mail se neshoduje s pozvánkou" };

  const access = await withTenantContext(
    { tenantId: inv.tenantId, userId: user.id },
    (tx) => finalizeClientInvitationAccess(tx, inv, user.id, gdprConsent),
  );
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

  // Bootstrap lookup: viz acceptClientInvitation.
  const invitation = await withUserContext(user.id, (tx) => getClientInvitationByToken(tx, token));
  if (!invitation || invitation.expiresAt <= new Date() || invitation.revokedAt) {
    return { ok: false, error: "Pozvánka neexistuje nebo vypršela" };
  }
  if (user.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase()) {
    return { ok: false, error: "Přihlaste se stejným e-mailem, na který byla pozvánka odeslána." };
  }
  if (invitation.authUserId && invitation.authUserId !== user.id) {
    return { ok: false, error: "Pozvánka je připravená pro jiný klientský účet." };
  }

  return withTenantContext(
    { tenantId: invitation.tenantId, userId: user.id },
    async (tx) => {
      await updateClientInvitationState(tx, invitation.id, { authUserId: user.id });

      if (invitation.passwordChangeRequiredAt && !invitation.passwordChangedAt) {
        return { ok: true as const, nextStep: "change_password" as const };
      }

      const access = await finalizeClientInvitationAccess(tx, invitation, user.id);
      if (!access.ok) return access;
      return { ok: true as const, nextStep: "portal" as const };
    },
  );
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

  // Bootstrap lookup: viz acceptClientInvitation.
  const invitation = await withUserContext(user.id, (tx) => getClientInvitationByToken(tx, token));
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

  // External: Supabase Auth password change.
  const { error } = await supabase.auth.updateUser({ password: trimmedPassword });
  if (error) return { ok: false, error: error.message };

  return withTenantContext(
    { tenantId: invitation.tenantId, userId: user.id },
    async (tx) => {
      const access = await finalizeClientInvitationAccess(tx, invitation, user.id, gdprConsent);
      if (!access.ok) return access;

      await updateClientInvitationState(tx, invitation.id, {
        authUserId: user.id,
        passwordChangedAt: new Date(),
        acceptedAt: invitation.acceptedAt ?? new Date(),
      });

      return { ok: true as const };
    },
  );
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
  if (m && m.roleName === "Client" && m.contactId) {
    return { ok: true };
  }
  // Bootstrap lookup (ještě bez membership / tenantu) — použijeme self-select
  // přes app.user_id GUC.
  const pendingPasswordChangeToken = await withUserContext(
    user.id,
    (tx) => findPendingClientPasswordChangeTokenByEmail(tx, user.email),
  );
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
    dic?: string;
    licenseNumber?: string;
    publicTitle?: string;
    website?: string;
    locale?: string;
    timezone?: string;
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
  // External: Supabase Auth user_metadata update.
  const { error } = await supabase.auth.updateUser({ data: metaUpdate });
  if (error) throw new Error(error.message);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;

  await withTenantContextFromAuth(auth, async (tx) => {
    await tx
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

    const prefsUpdate: Record<string, unknown> = {};
    if (extra?.phone !== undefined) prefsUpdate.phone = extra.phone.trim() || null;
    if (extra?.website !== undefined) prefsUpdate.website = extra.website.trim() || null;
    if (extra?.dic !== undefined) prefsUpdate.dic = extra.dic.trim() || null;
    if (extra?.licenseNumber !== undefined) prefsUpdate.licenseNumber = extra.licenseNumber.trim() || null;
    if (extra?.publicTitle !== undefined) prefsUpdate.publicTitle = extra.publicTitle.trim() || null;
    if (extra?.bio !== undefined) prefsUpdate.bio = extra.bio.trim().slice(0, 280) || null;
    if (extra?.locale !== undefined) {
      const v = extra.locale.trim();
      prefsUpdate.locale = ["cs", "sk", "en"].includes(v) ? v : null;
    }
    if (extra?.timezone !== undefined) prefsUpdate.timezone = extra.timezone.trim() || null;

    if (Object.keys(prefsUpdate).length > 0) {
      const existing = await tx
        .select({ id: advisorPreferences.id })
        .from(advisorPreferences)
        .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
        .limit(1);
      if (existing.length > 0) {
        await tx
          .update(advisorPreferences)
          .set({ ...prefsUpdate, updatedAt: new Date() })
          .where(eq(advisorPreferences.id, existing[0].id));
      } else {
        await tx.insert(advisorPreferences).values({
          userId: auth.userId,
          tenantId: auth.tenantId,
          ...prefsUpdate,
        });
      }
    }

    if (supervisorUserId !== undefined) {
      const selfMembership = await tx
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
        const supervisorRows = await tx
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

      await tx
        .update(memberships as any)
        .set({ parentId: nextParent })
        .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.userId, auth.userId)) as any);
    }
  });
}

export type AdvisorPersonalProfile = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  ico: string | null;
  dic: string | null;
  licenseNumber: string | null;
  publicTitle: string | null;
  website: string | null;
  bio: string | null;
  correspondenceAddress: string | null;
  company: string | null;
  locale: string | null;
  timezone: string | null;
};

export async function getAdvisorPersonalProfile(): Promise<AdvisorPersonalProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const readMeta = (k: string): string | null => {
    const raw = meta[k];
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    return t.length > 0 ? t : null;
  };

  const prefs = await withAuthContext(async (auth, tx) => {
    const row = await tx
      .select({
        phone: advisorPreferences.phone,
        website: advisorPreferences.website,
        dic: advisorPreferences.dic,
        licenseNumber: advisorPreferences.licenseNumber,
        publicTitle: advisorPreferences.publicTitle,
        bio: advisorPreferences.bio,
        locale: advisorPreferences.locale,
        timezone: advisorPreferences.timezone,
      })
      .from(advisorPreferences)
      .where(
        and(
          eq(advisorPreferences.tenantId, auth.tenantId),
          eq(advisorPreferences.userId, auth.userId)
        )
      )
      .limit(1);
    return row[0] ?? null;
  }).catch(() => null);

  return {
    fullName: readMeta("full_name") ?? user?.email ?? null,
    email: user?.email ?? null,
    phone: prefs?.phone?.trim() || null,
    ico: readMeta("ico"),
    dic: prefs?.dic?.trim() || null,
    licenseNumber: prefs?.licenseNumber?.trim() || null,
    publicTitle: prefs?.publicTitle?.trim() || readMeta("public_role"),
    website: prefs?.website?.trim() || null,
    bio: prefs?.bio?.trim() || readMeta("bio"),
    correspondenceAddress: readMeta("correspondence_address"),
    company: readMeta("company"),
    locale: prefs?.locale?.trim() || "cs",
    timezone: prefs?.timezone?.trim() || "Europe/Prague",
  };
}

export type SupervisorOption = {
  userId: string;
  roleName: string;
  displayName: string;
};

export async function listSupervisorOptions(): Promise<SupervisorOption[]> {
  return withAuthContext(async (auth, tx) => {
    const selfRows = await tx
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

    const rows = await tx
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
  });
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
  await withAuthContext(async (auth, tx) => {
    await tx
      .update(memberships)
      .set({ mfaEnabled: enabled })
      .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.userId, auth.userId)));
  });
}
