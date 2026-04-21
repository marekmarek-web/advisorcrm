/**
 * Unified email sending abstraction.
 *
 * Provider: by default uses a simple fetch-based approach.
 * In production, swap for Resend SDK (`@resend/node`) or similar.
 * Set RESEND_API_KEY in env to enable Resend provider.
 *
 * Delta audit A2: pokud caller předá `audit: { tenantId, template, ... }`,
 * `sendEmail` automaticky zapíše do `notification_log` — nezávisle na tom,
 * zda send uspěl. `providerMessageId` se uloží pro korelaci s bounce/complaint
 * webhookem (viz `/api/resend/webhook`).
 */

import { db, notificationLog } from "db";
import { resolveResendReplyTo } from "@/lib/email/resend-reply-to";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
  /** Reply-To (jinak env `RESEND_REPLY_TO`). */
  replyTo?: string;
  /**
   * Audit stopa pro `notification_log`. Pokud je přítomna, `sendEmail` po
   * Resend odpovědi zapíše řádek do `notification_log` s `providerMessageId`
   * pro pozdější korelaci s webhookem. Bez této stopy caller musí ručně
   * `logNotification()` (legacy code path).
   */
  audit?: {
    tenantId: string;
    contactId?: string | null;
    template?: string;
    meta?: Record<string, unknown>;
  };
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

const FROM_DEFAULT = process.env.EMAIL_FROM ?? "Aidvisora <noreply@aidvisora.cz>";

async function sendViaResend(payload: EmailPayload): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };

  try {
    const replyTo = resolveResendReplyTo(payload.replyTo);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: payload.from ?? FROM_DEFAULT,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }

    const json = await res.json();
    return { ok: true, messageId: json.id };
  } catch (err: unknown) {
    return { ok: false, error: String(err) };
  }
}

async function sendViaConsole(payload: EmailPayload): Promise<SendResult> {
  console.log("[Email] Would send:", {
    to: payload.to,
    subject: payload.subject,
    from: payload.from ?? FROM_DEFAULT,
    replyTo: resolveResendReplyTo(payload.replyTo),
    htmlLength: payload.html.length,
  });
  return { ok: true, messageId: `console-${Date.now()}` };
}

async function autoLog(payload: EmailPayload, result: SendResult): Promise<void> {
  if (!payload.audit) return;
  try {
    await db.insert(notificationLog).values({
      tenantId: payload.audit.tenantId,
      contactId: payload.audit.contactId ?? null,
      channel: "email",
      template: payload.audit.template ?? null,
      subject: payload.subject,
      recipient: payload.to,
      status: result.ok ? "sent" : "failed",
      providerMessageId: result.messageId ?? null,
      lastStatus: result.ok ? "sent" : "failed",
      lastStatusAt: new Date(),
      lastError: result.ok ? null : (result.error?.slice(0, 500) ?? null),
      meta: payload.audit.meta ?? null,
    });
  } catch {
    // logování se nesmí zlomit o samotný send
  }
}

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  // Delta A23 — remote kill-switch pro outbound email. Lazy import brání
  // circular deps při test importu tohoto modulu mimo Next runtime.
  try {
    const { getKillSwitch } = await import("@/lib/ops/kill-switch");
    if (await getKillSwitch("EMAIL_SENDING_DISABLED", false)) {
      const result: SendResult = { ok: false, error: "EMAIL_SENDING_DISABLED kill-switch active" };
      await autoLog(payload, result);
      return result;
    }
  } catch {
    // Edge Config nedostupné → pokračujeme dál.
  }

  let result: SendResult;
  if (process.env.RESEND_API_KEY) {
    result = await sendViaResend(payload);
  } else if (process.env.NODE_ENV === "development") {
    result = await sendViaConsole(payload);
  } else {
    result = { ok: false, error: "RESEND_API_KEY not set" };
  }
  await autoLog(payload, result);
  return result;
}

/**
 * Legacy standalone logger. Pro nové callery preferovat `sendEmail({ audit })`,
 * které logování provede automaticky. Tady ponechána kvůli místům, kde
 * `sendEmail` probíhá vícekanálově (SMS / push) nebo bez provider response
 * (např. Resend SDK v `app/actions/payment-pdf.ts`).
 */
export async function logNotification(params: {
  tenantId: string;
  contactId?: string;
  channel?: string;
  template?: string;
  subject: string;
  recipient: string;
  status: string;
  providerMessageId?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.insert(notificationLog).values({
      tenantId: params.tenantId,
      contactId: params.contactId || null,
      channel: params.channel || "email",
      template: params.template || null,
      subject: params.subject,
      recipient: params.recipient,
      status: params.status,
      providerMessageId: params.providerMessageId ?? null,
      lastStatus: params.status,
      lastStatusAt: new Date(),
      meta: params.meta ?? null,
    });
  } catch {
    // silently swallow – notification logging must never break the main flow
  }
}
