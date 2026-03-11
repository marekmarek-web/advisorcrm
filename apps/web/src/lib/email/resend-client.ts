/**
 * Resend SDK client for sending emails.
 * Uses RESEND_API_KEY from env – set it in .env.local (never commit the key).
 *
 * Example:
 *   const result = await sendResendEmail({
 *     to: 'recipient@example.com',
 *     subject: 'Hello',
 *     html: '<p>Hello World!</p>',
 *   });
 */

import { Resend } from "resend";

const getResend = (): Resend | null => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
};

const defaultFrom = () =>
  process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export type SendResendOptions = {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type SendResendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Send an email via Resend API.
 * Returns { ok: true, id } on success, { ok: false, error } on failure.
 */
export async function sendResendEmail(
  options: SendResendOptions
): Promise<SendResendResult> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY is not set in environment" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: options.from ?? defaultFrom(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id ?? "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
