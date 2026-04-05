"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  db,
  contacts,
  advisorPreferences,
  userProfiles,
  notificationLog,
  eq,
  and,
  sql,
} from "db";
import { getPragueCalendarParts } from "@/lib/calendar/cz-public-holidays";
import { getEffectiveBranding, setBrandingField } from "@/lib/admin/branding-settings";
import { sendEmail, logNotification } from "@/lib/email/send-email";
import { resolveResendReplyTo } from "@/lib/email/resend-reply-to";
import { createClient } from "@/lib/supabase/server";
import { BIRTHDAY_TEMPLATE_LOG_KEY, type BirthdayEmailTheme, isBirthdayEmailTheme } from "@/lib/email/birthday/types";
import {
  resolveBirthdaySalutation,
  defaultBirthdaySubject,
  defaultBirthdayBodyPlain,
  birthdayOpeningLinePlain,
} from "@/lib/email/birthday/salutation";
import { parseBirthdayThemePreference, resolveEffectiveBirthdayTheme } from "@/lib/email/birthday/resolve-theme";
import { buildBirthdayEmailHtml } from "@/lib/email/birthday/build-email";

function isBirthdayToday(birthDate: string | null | undefined, pragueMmdd: string): boolean {
  if (!birthDate || birthDate.length < 10) return false;
  return birthDate.slice(5, 10) === pragueMmdd;
}

async function birthdaySentToday(tenantId: string, contactId: string): Promise<boolean> {
  const rows = await db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.tenantId, tenantId),
        eq(notificationLog.contactId, contactId),
        eq(notificationLog.template, BIRTHDAY_TEMPLATE_LOG_KEY),
        eq(notificationLog.status, "sent"),
        sql`((${notificationLog.sentAt} AT TIME ZONE 'Europe/Prague')::date = (NOW() AT TIME ZONE 'Europe/Prague')::date)`
      )
    )
    .limit(1);
  return rows.length > 0;
}

type AdvisorBirthdayCtx = {
  theme: BirthdayEmailTheme;
  assetForMeta: string | null;
  advisorName: string;
  advisorRoleLine: string;
  advisorPhone: string | null;
  advisorWebsite: string | null;
  replyTo: string | null;
};

async function loadAdvisorBirthdayContext(
  tenantId: string,
  userId: string
): Promise<AdvisorBirthdayCtx> {
  const branding = await getEffectiveBranding(tenantId);
  const workspaceTheme = parseBirthdayThemePreference(
    branding.birthdayEmailTheme as string | undefined,
    "premium_dark"
  );

  const [pref] = await db
    .select({
      birthdayEmailTheme: advisorPreferences.birthdayEmailTheme,
      birthdaySignatureName: advisorPreferences.birthdaySignatureName,
      birthdaySignatureRole: advisorPreferences.birthdaySignatureRole,
      birthdayReplyToEmail: advisorPreferences.birthdayReplyToEmail,
      phone: advisorPreferences.phone,
      website: advisorPreferences.website,
    })
    .from(advisorPreferences)
    .where(and(eq(advisorPreferences.tenantId, tenantId), eq(advisorPreferences.userId, userId)))
    .limit(1);

  const requested = parseBirthdayThemePreference(pref?.birthdayEmailTheme, workspaceTheme);
  const { theme, asset } = resolveEffectiveBirthdayTheme(requested);

  const [profile] = await db
    .select({ fullName: userProfiles.fullName })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const metaName = (user?.user_metadata?.full_name as string | undefined)?.trim();

  const advisorName =
    pref?.birthdaySignatureName?.trim() || profile?.fullName?.trim() || metaName || "Váš poradce";
  const advisorRoleLine = pref?.birthdaySignatureRole?.trim() || "";

  return {
    theme,
    assetForMeta: asset,
    advisorName,
    advisorRoleLine,
    advisorPhone: pref?.phone?.trim() || null,
    advisorWebsite: pref?.website?.trim() || null,
    replyTo: pref?.birthdayReplyToEmail?.trim() || null,
  };
}

export type BirthdayGreetingPreviewOk = {
  ok: true;
  contactId: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  preheader: string;
  html: string;
  bodyPlain: string;
  theme: BirthdayEmailTheme;
  asset: string | null;
  birthdayDate: string;
  alreadySentToday: boolean;
  canSend: boolean;
  blockReason: string | null;
};

export type BirthdayGreetingPreviewErr = { ok: false; message: string };

export async function getBirthdayGreetingPreview(
  contactId: string,
  draft?: { subject?: string; bodyPlain?: string } | null
): Promise<BirthdayGreetingPreviewOk | BirthdayGreetingPreviewErr> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) {
    return { ok: false, message: "Nemáte oprávnění." };
  }

  const prague = getPragueCalendarParts();

  const [row] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      birthDate: contacts.birthDate,
      doNotEmail: contacts.doNotEmail,
      birthGreetingOptOut: contacts.birthGreetingOptOut,
      preferredSalutation: contacts.preferredSalutation,
      preferredGreetingName: contacts.preferredGreetingName,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, auth.tenantId)))
    .limit(1);

  if (!row) return { ok: false, message: "Kontakt nenalezen." };
  if (!isBirthdayToday(row.birthDate, prague.mmdd)) {
    return { ok: false, message: "Kontakt dnes nemá narozeniny." };
  }

  const contactName = `${row.firstName} ${row.lastName}`.trim();
  const email = row.email?.trim() || "";
  const salutation = resolveBirthdaySalutation({
    preferredSalutation: row.preferredSalutation,
    preferredGreetingName: row.preferredGreetingName,
  });
  const openingForPlain = birthdayOpeningLinePlain({ preferredSalutation: row.preferredSalutation });

  const defaultSubject = defaultBirthdaySubject(salutation.salutationShort);
  const defaultBody = defaultBirthdayBodyPlain(openingForPlain);
  const subject = draft?.subject?.trim() ? draft.subject.trim() : defaultSubject;
  const bodyPlain = draft?.bodyPlain?.trim() ? draft.bodyPlain.trim() : defaultBody;

  const advisorCtx = await loadAdvisorBirthdayContext(auth.tenantId, auth.userId);
  const built = buildBirthdayEmailHtml({
    subject,
    bodyPlain,
    theme: advisorCtx.theme,
    assetForMeta: advisorCtx.assetForMeta,
    advisorDisplayName: advisorCtx.advisorName,
    advisorRoleLine: advisorCtx.advisorRoleLine,
    advisorPhone: advisorCtx.advisorPhone,
    advisorWebsite: advisorCtx.advisorWebsite,
  });

  const alreadySent = await birthdaySentToday(auth.tenantId, contactId);

  let blockReason: string | null = null;
  if (row.birthGreetingOptOut) blockReason = "Klient má vypnutá narozeninová přání.";
  else if (row.doNotEmail) blockReason = "U kontaktu je zapnuto „neemailovat“.";
  else if (!email) blockReason = "Kontakt nemá e-mailovou adresu.";
  const canSend = !blockReason && !alreadySent;

  return {
    ok: true,
    contactId,
    contactName,
    contactEmail: email,
    subject: built.subject,
    preheader: built.preheader,
    html: built.html,
    bodyPlain,
    theme: built.theme,
    asset: built.asset,
    birthdayDate: prague.ymd,
    alreadySentToday: alreadySent,
    canSend,
    blockReason,
  };
}

export type SendBirthdayGreetingResult =
  | { ok: true }
  | { ok: false; message: string };

export async function sendBirthdayGreeting(params: {
  contactId: string;
  subject: string;
  bodyPlain: string;
}): Promise<SendBirthdayGreetingResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { ok: false, message: "Nemáte oprávnění odeslat zprávu." };
  }

  const prague = getPragueCalendarParts();
  const subject = params.subject?.trim();
  const bodyPlain = params.bodyPlain?.trim();
  if (!subject) return { ok: false, message: "Chybí předmět." };
  if (!bodyPlain) return { ok: false, message: "Chybí text zprávy." };

  const [row] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      birthDate: contacts.birthDate,
      doNotEmail: contacts.doNotEmail,
      birthGreetingOptOut: contacts.birthGreetingOptOut,
    })
    .from(contacts)
    .where(and(eq(contacts.id, params.contactId), eq(contacts.tenantId, auth.tenantId)))
    .limit(1);

  if (!row) return { ok: false, message: "Kontakt nenalezen." };
  if (!isBirthdayToday(row.birthDate, prague.mmdd)) {
    return { ok: false, message: "Kontakt dnes nemá narozeniny." };
  }
  if (row.birthGreetingOptOut) return { ok: false, message: "Klient si nepřeje narozeninová přání." };
  if (row.doNotEmail) return { ok: false, message: "U kontaktu je zapnuto „neemailovat“." };
  const to = row.email?.trim() || "";
  if (!to) return { ok: false, message: "Kontakt nemá e-mail." };

  if (await birthdaySentToday(auth.tenantId, params.contactId)) {
    return { ok: false, message: "Blahopřání tomuto klientovi už dnes bylo odesláno." };
  }

  const contactName = `${row.firstName} ${row.lastName}`.trim();
  const advisorCtx = await loadAdvisorBirthdayContext(auth.tenantId, auth.userId);
  const built = buildBirthdayEmailHtml({
    subject,
    bodyPlain,
    theme: advisorCtx.theme,
    assetForMeta: advisorCtx.assetForMeta,
    advisorDisplayName: advisorCtx.advisorName,
    advisorRoleLine: advisorCtx.advisorRoleLine,
    advisorPhone: advisorCtx.advisorPhone,
    advisorWebsite: advisorCtx.advisorWebsite,
  });

  const result = await sendEmail({
    to,
    subject: built.subject,
    html: built.html,
    replyTo: resolveResendReplyTo(advisorCtx.replyTo),
  });

  const meta = {
    template: BIRTHDAY_TEMPLATE_LOG_KEY,
    theme: built.theme,
    contactName,
    advisorName: advisorCtx.advisorName,
    birthdayDate: prague.ymd,
    channel: "email",
    asset: built.asset,
  };

  await logNotification({
    tenantId: auth.tenantId,
    contactId: params.contactId,
    channel: "email",
    template: BIRTHDAY_TEMPLATE_LOG_KEY,
    subject: built.subject,
    recipient: to,
    status: result.ok ? "sent" : (result.error ?? "failed"),
    meta,
  });

  if (!result.ok) return { ok: false, message: result.error ?? "Odeslání se nezdařilo." };
  return { ok: true };
}

export async function getWorkspaceBirthdayEmailTheme(): Promise<BirthdayEmailTheme> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Admin") return "premium_dark";
  const branding = await getEffectiveBranding(auth.tenantId);
  return parseBirthdayThemePreference(branding.birthdayEmailTheme as string | undefined, "premium_dark");
}

export async function setWorkspaceBirthdayEmailTheme(theme: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Admin") {
    return { ok: false, message: "Pouze administrátor workspace může měnit výchozí téma." };
  }
  if (!isBirthdayEmailTheme(theme)) {
    return { ok: false, message: "Neplatná hodnota tématu." };
  }
  await setBrandingField(auth.tenantId, "birthdayEmailTheme", theme, auth.userId);
  return { ok: true };
}
