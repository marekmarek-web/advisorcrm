/**
 * Unified email sending abstraction.
 *
 * Provider: by default uses a simple fetch-based approach.
 * In production, swap for Resend SDK (`@resend/node`) or similar.
 * Set RESEND_API_KEY in env to enable Resend provider.
 */

import { db, notificationLog } from "db";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

const FROM_DEFAULT = process.env.EMAIL_FROM ?? "WePlan <noreply@weplan.cz>";

async function sendViaResend(payload: EmailPayload): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };

  try {
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
    htmlLength: payload.html.length,
  });
  return { ok: true, messageId: `console-${Date.now()}` };
}

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(payload);
  }
  return sendViaConsole(payload);
}

export async function logNotification(params: {
  tenantId: string;
  contactId?: string;
  channel?: string;
  template?: string;
  subject: string;
  recipient: string;
  status: string;
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
    });
  } catch {
    // silently swallow – notification logging must never break the main flow
  }
}
