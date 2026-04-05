"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { advisorPreferences } from "db";
import { eq, and } from "db";
import { getDefaultQuickActionsConfig } from "@/lib/quick-actions";
import { loadQuickActionsConfig } from "@/lib/quick-actions/load-quick-actions-config";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveResendReplyTo } from "@/lib/email/resend-reply-to";
import { isBirthdayEmailTheme, type BirthdayEmailTheme } from "@/lib/email/birthday/types";

const AVATAR_MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const REPORT_LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export type AdvisorReportBranding = {
  authorName: string;
  footerLine: string;
  logoUrl: string | null;
  phone: string | null;
  website: string | null;
};

/** Shape of quick-actions JSON; kept as ReturnType so Turbopack never emits a stray `QuickActionsConfig` identifier from this module. */
export type QuickActionsStoredConfig = ReturnType<typeof getDefaultQuickActionsConfig>;

export async function getQuickActionsConfig(): Promise<QuickActionsStoredConfig> {
  try {
    const auth = await requireAuthInAction();
    return await loadQuickActionsConfig(auth.tenantId, auth.userId);
  } catch {
    return getDefaultQuickActionsConfig();
  }
}

export async function setQuickActionsConfig(
  order: string[],
  visible: Record<string, boolean>
): Promise<void> {
  const auth = await requireAuthInAction();
  const existing = await db
    .select({ id: advisorPreferences.id })
    .from(advisorPreferences)
    .where(
      and(
        eq(advisorPreferences.tenantId, auth.tenantId),
        eq(advisorPreferences.userId, auth.userId)
      )
    )
    .limit(1);

  const quickActions = { order, visible };
  if (existing.length > 0) {
    await db
      .update(advisorPreferences)
      .set({
        quickActions,
        updatedAt: new Date(),
      })
      .where(eq(advisorPreferences.id, existing[0].id));
  } else {
    await db.insert(advisorPreferences).values({
      userId: auth.userId,
      tenantId: auth.tenantId,
      quickActions,
    });
  }
}

export async function getAdvisorAvatarUrl(): Promise<string | null> {
  try {
    const auth = await requireAuthInAction();
    const row = await db
      .select({ avatarUrl: advisorPreferences.avatarUrl })
      .from(advisorPreferences)
      .where(
        and(
          eq(advisorPreferences.tenantId, auth.tenantId),
          eq(advisorPreferences.userId, auth.userId)
        )
      )
      .limit(1);
    return row[0]?.avatarUrl ?? null;
  } catch {
    return null;
  }
}

/** Nahraje profilovou fotku poradce do Storage a uloží URL do advisor_preferences.avatar_url. */
export async function uploadAdvisorAvatar(formData: FormData): Promise<string | null> {
  const auth = await requireAuthInAction();
  const file = formData.get("file") as File | null;
  if (!file?.size) throw new Error("Vyberte obrázek");
  if (file.size > AVATAR_MAX_SIZE) throw new Error("Soubor je příliš velký (max 3 MB)");
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("Povolené formáty: JPEG, PNG, WebP, GIF");
  const ext = file.name.replace(/^.*\./, "") || "jpg";
  const path = `${auth.tenantId}/advisor-avatars/${auth.userId}/${Date.now()}.${ext.replace(/[^a-zA-Z0-9]/g, "")}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) {
    const msg = uploadError.message?.toLowerCase().includes("bucket") || uploadError.message?.toLowerCase().includes("not found")
      ? "Úložiště není nastavené. V Supabase vytvořte bucket „documents“."
      : uploadError.message;
    throw new Error(msg);
  }
  const { data: signedData } = await admin.storage
    .from("documents")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  let url: string | null = null;
  if (signedData?.signedUrl) {
    url = signedData.signedUrl;
  } else {
    const { data: urlData } = admin.storage.from("documents").getPublicUrl(path);
    url = urlData?.publicUrl ?? null;
  }
  if (url) {
    const existing = await db
      .select({ id: advisorPreferences.id })
      .from(advisorPreferences)
      .where(
        and(
          eq(advisorPreferences.tenantId, auth.tenantId),
          eq(advisorPreferences.userId, auth.userId)
        )
      )
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(advisorPreferences)
        .set({ avatarUrl: url, updatedAt: new Date() })
        .where(eq(advisorPreferences.id, existing[0].id));
    } else {
      await db.insert(advisorPreferences).values({
        userId: auth.userId,
        tenantId: auth.tenantId,
        avatarUrl: url,
      });
    }
  }
  return url;
}

const PDF_REPORT_AUTHOR_FALLBACK = "Marek Marek";
const PDF_REPORT_FOOTER_FALLBACK = "Marek Marek - Privátní finanční plánování | www.marek-marek.cz | +420 778 511 166";

/** Vrátí branding pro PDF report: jméno z profilu, řádek zápatí (jméno | web | telefon), URL loga. */
export async function getAdvisorReportBranding(): Promise<AdvisorReportBranding> {
  try {
    const auth = await requireAuthInAction();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const authorName =
      (user?.user_metadata?.full_name as string | undefined)?.trim() || PDF_REPORT_AUTHOR_FALLBACK;

    const row = await db
      .select({
        phone: advisorPreferences.phone,
        website: advisorPreferences.website,
        reportLogoUrl: advisorPreferences.reportLogoUrl,
      })
      .from(advisorPreferences)
      .where(
        and(
          eq(advisorPreferences.tenantId, auth.tenantId),
          eq(advisorPreferences.userId, auth.userId)
        )
      )
      .limit(1);

    const phone = row[0]?.phone?.trim() || "";
    const website = row[0]?.website?.trim() || "";
    const logoUrl = row[0]?.reportLogoUrl?.trim() || null;

    const parts: string[] = [
      authorName ? `${authorName} – Privátní finanční plánování` : "",
      website,
      phone,
    ].filter(Boolean);
    const footerLine = parts.length > 0 ? parts.join(" | ") : PDF_REPORT_FOOTER_FALLBACK;

    return { authorName, footerLine, logoUrl, phone: phone || null, website: website || null };
  } catch {
    return {
      authorName: PDF_REPORT_AUTHOR_FALLBACK,
      footerLine: PDF_REPORT_FOOTER_FALLBACK,
      logoUrl: null,
      phone: null,
      website: null,
    };
  }
}

/** Vrátí pole pro záhlaví/zápatí PDF reportu (telefon, web). */
export async function getAdvisorReportFields(): Promise<{ phone: string | null; website: string | null }> {
  try {
    const auth = await requireAuthInAction();
    const row = await db
      .select({ phone: advisorPreferences.phone, website: advisorPreferences.website })
      .from(advisorPreferences)
      .where(
        and(
          eq(advisorPreferences.tenantId, auth.tenantId),
          eq(advisorPreferences.userId, auth.userId)
        )
      )
      .limit(1);
    return {
      phone: row[0]?.phone?.trim() || null,
      website: row[0]?.website?.trim() || null,
    };
  } catch {
    return { phone: null, website: null };
  }
}

/** Aktualizuje telefon a web v advisor_preferences pro report. */
export async function updateAdvisorReportBranding(update: {
  phone?: string | null;
  website?: string | null;
}): Promise<void> {
  const auth = await requireAuthInAction();
  const existing = await db
    .select({ id: advisorPreferences.id })
    .from(advisorPreferences)
    .where(
      and(
        eq(advisorPreferences.tenantId, auth.tenantId),
        eq(advisorPreferences.userId, auth.userId)
      )
    )
    .limit(1);

  const set: { phone?: string | null; website?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (Object.prototype.hasOwnProperty.call(update, "phone")) set.phone = update.phone ?? null;
  if (Object.prototype.hasOwnProperty.call(update, "website")) set.website = update.website ?? null;

  if (existing.length > 0) {
    await db.update(advisorPreferences).set(set).where(eq(advisorPreferences.id, existing[0].id));
  } else {
    await db.insert(advisorPreferences).values({
      userId: auth.userId,
      tenantId: auth.tenantId,
      phone: set.phone ?? null,
      website: set.website ?? null,
    });
  }
}

/** Nahraje logo do reportu PDF do Storage a uloží URL do advisor_preferences.report_logo_url. */
export async function uploadReportLogo(formData: FormData): Promise<string | null> {
  const auth = await requireAuthInAction();
  const file = formData.get("file") as File | null;
  if (!file?.size) throw new Error("Vyberte obrázek");
  if (file.size > REPORT_LOGO_MAX_SIZE) throw new Error("Soubor je příliš velký (max 2 MB)");
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("Povolené formáty: JPEG, PNG, WebP, GIF");
  const ext = file.name.replace(/^.*\./, "") || "jpg";
  const path = `${auth.tenantId}/advisor-report-logos/${auth.userId}/${Date.now()}.${ext.replace(/[^a-zA-Z0-9]/g, "")}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) {
    const msg =
      uploadError.message?.toLowerCase().includes("bucket") ||
      uploadError.message?.toLowerCase().includes("not found")
        ? "Úložiště není nastavené. V Supabase vytvořte bucket „documents“."
        : uploadError.message;
    throw new Error(msg);
  }
  const { data: signedData } = await admin.storage
    .from("documents")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  let url: string | null = null;
  if (signedData?.signedUrl) {
    url = signedData.signedUrl;
  } else {
    const { data: urlData } = admin.storage.from("documents").getPublicUrl(path);
    url = urlData?.publicUrl ?? null;
  }
  if (url) {
    const existing = await db
      .select({ id: advisorPreferences.id })
      .from(advisorPreferences)
      .where(
        and(
          eq(advisorPreferences.tenantId, auth.tenantId),
          eq(advisorPreferences.userId, auth.userId)
        )
      )
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(advisorPreferences)
        .set({ reportLogoUrl: url, updatedAt: new Date() })
        .where(eq(advisorPreferences.id, existing[0].id));
    } else {
      await db.insert(advisorPreferences).values({
        userId: auth.userId,
        tenantId: auth.tenantId,
        reportLogoUrl: url,
      });
    }
  }
  return url;
}

export type NotificationPrefs = Record<string, boolean>;

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const prefs = user?.user_metadata?.notification_prefs;
    if (prefs && typeof prefs === "object") return prefs as NotificationPrefs;
    return { daily: true, message: true, tasks: true, contracts: true };
  } catch {
    return { daily: true, message: true, tasks: true, contracts: true };
  }
}

export async function setNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { notification_prefs: prefs },
  });
  if (error) throw new Error(error.message);
}

export type AdvisorBirthdayEmailPrefs = {
  birthdaySignatureName: string | null;
  birthdaySignatureRole: string | null;
  birthdayReplyToEmail: string | null;
  birthdayEmailTheme: BirthdayEmailTheme | null;
};

export async function getAdvisorBirthdayEmailPrefs(): Promise<AdvisorBirthdayEmailPrefs> {
  try {
    const auth = await requireAuthInAction();
    const row = await db
      .select({
        birthdaySignatureName: advisorPreferences.birthdaySignatureName,
        birthdaySignatureRole: advisorPreferences.birthdaySignatureRole,
        birthdayReplyToEmail: advisorPreferences.birthdayReplyToEmail,
        birthdayEmailTheme: advisorPreferences.birthdayEmailTheme,
      })
      .from(advisorPreferences)
      .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
      .limit(1);
    const t = row[0]?.birthdayEmailTheme?.trim();
    return {
      birthdaySignatureName: row[0]?.birthdaySignatureName?.trim() || null,
      birthdaySignatureRole: row[0]?.birthdaySignatureRole?.trim() || null,
      birthdayReplyToEmail: row[0]?.birthdayReplyToEmail?.trim() || null,
      birthdayEmailTheme: t && isBirthdayEmailTheme(t) ? t : null,
    };
  } catch {
    return {
      birthdaySignatureName: null,
      birthdaySignatureRole: null,
      birthdayReplyToEmail: null,
      birthdayEmailTheme: null,
    };
  }
}

export async function updateAdvisorBirthdayEmailPrefs(update: {
  birthdaySignatureName?: string | null;
  birthdaySignatureRole?: string | null;
  birthdayReplyToEmail?: string | null;
  birthdayEmailTheme?: string | null;
}): Promise<void> {
  const auth = await requireAuthInAction();
  if (update.birthdayEmailTheme != null && update.birthdayEmailTheme !== "" && !isBirthdayEmailTheme(update.birthdayEmailTheme)) {
    throw new Error("Neplatné téma e-mailu.");
  }
  const existing = await db
    .select({ id: advisorPreferences.id })
    .from(advisorPreferences)
    .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
    .limit(1);

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (Object.prototype.hasOwnProperty.call(update, "birthdaySignatureName")) {
    set.birthdaySignatureName = update.birthdaySignatureName?.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(update, "birthdaySignatureRole")) {
    set.birthdaySignatureRole = update.birthdaySignatureRole?.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(update, "birthdayReplyToEmail")) {
    set.birthdayReplyToEmail = update.birthdayReplyToEmail?.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(update, "birthdayEmailTheme")) {
    const v = update.birthdayEmailTheme?.trim();
    set.birthdayEmailTheme = v && isBirthdayEmailTheme(v) ? v : null;
  }

  if (existing.length > 0) {
    await db
      .update(advisorPreferences)
      .set(set as Partial<typeof advisorPreferences.$inferInsert>)
      .where(eq(advisorPreferences.id, existing[0].id));
    return;
  }
  await db.insert(advisorPreferences).values({
    userId: auth.userId,
    tenantId: auth.tenantId,
    birthdaySignatureName:
      update.birthdaySignatureName !== undefined ? update.birthdaySignatureName?.trim() || null : null,
    birthdaySignatureRole:
      update.birthdaySignatureRole !== undefined ? update.birthdaySignatureRole?.trim() || null : null,
    birthdayReplyToEmail:
      update.birthdayReplyToEmail !== undefined ? update.birthdayReplyToEmail?.trim() || null : null,
    birthdayEmailTheme:
      update.birthdayEmailTheme !== undefined
        ? update.birthdayEmailTheme?.trim() && isBirthdayEmailTheme(update.birthdayEmailTheme.trim())
          ? update.birthdayEmailTheme.trim()
          : null
        : null,
  });
}

export async function sendNotificationEmail(
  to: string,
  subject: string,
  html: string,
  options?: { replyTo?: string; from?: string }
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendNotificationEmail] RESEND_API_KEY not set, skipping email");
    return false;
  }
  try {
    const replyTo = resolveResendReplyTo(options?.replyTo);
    const from =
      options?.from?.trim() ||
      process.env.RESEND_FROM_EMAIL ||
      "Aidvisora <noreply@aidvisora.cz>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("[sendNotificationEmail]", e);
    return false;
  }
}
