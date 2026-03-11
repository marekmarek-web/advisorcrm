"use server";

import { sendResendEmail } from "@/lib/email/resend-client";

/**
 * Send a test "Hello World" email via Resend.
 * Useful to verify RESEND_API_KEY is set and Resend is working.
 *
 * Set RESEND_API_KEY in .env.local (e.g. from Resend dashboard).
 */
export async function sendTestEmail(to: string = "mrcreaw@gmail.com") {
  const result = await sendResendEmail({
    from: "onboarding@resend.dev",
    to,
    subject: "Hello World",
    html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
  });

  if (result.ok) {
    return { ok: true as const, message: "Email sent successfully", id: result.id };
  }
  return { ok: false as const, error: result.error };
}
