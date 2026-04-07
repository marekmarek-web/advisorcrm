/**
 * AI Photo / Image Intake — cron health external webhook (Phase 11).
 *
 * Sends a lightweight structured signal to an optional external observability endpoint
 * (e.g. Uptime Robot, Better Uptime, custom Slack webhook, healthchecks.io, etc.)
 * after each cron cleanup run.
 *
 * Design:
 * - Fully optional — disabled when IMAGE_INTAKE_CRON_WEBHOOK_URL is not set
 * - Safe on failure — never throws, never blocks the cron response
 * - Sends a minimal structured JSON payload (no sensitive data)
 * - Timeout: 5s max — cron is not blocked waiting
 * - No retry logic — fire-and-forget; observability endpoint is expected to be reliable
 *
 * Payload shape:
 * {
 *   job: "image_intake_cleanup",
 *   status: "ok" | "failed" | "skipped",
 *   durationMs: number,
 *   deletedArtifacts: number,
 *   deletedCache: number,
 *   totalDeleted: number,
 *   timestamp: string (ISO),
 *   message: string
 * }
 *
 * Cost: zero model calls, zero request-time overhead (fire-and-forget after response).
 */

export type CronWebhookSignal = {
  job: string;
  status: "ok" | "failed" | "skipped";
  durationMs: number;
  deletedArtifacts: number;
  deletedCache: number;
  totalDeleted: number;
  timestamp: string;
  message: string;
};

/**
 * Sends a cron health signal to the configured external webhook URL.
 *
 * Always resolves (never throws).
 * Should be called fire-and-forget after sending the cron response to the client.
 *
 * @param signal  Structured signal payload
 * @returns true if webhook was sent successfully, false otherwise
 */
export async function sendCronHealthWebhook(signal: CronWebhookSignal): Promise<boolean> {
  const webhookUrl = process.env.IMAGE_INTAKE_CRON_WEBHOOK_URL?.trim();
  if (!webhookUrl) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return res.ok;
  } catch {
    // Safe degradation — webhook failure never surfaces to cron caller
    return false;
  }
}

/**
 * Returns whether the cron webhook is configured (URL env var set).
 * Used for health endpoint summary.
 */
export function isCronWebhookConfigured(): boolean {
  return Boolean(process.env.IMAGE_INTAKE_CRON_WEBHOOK_URL?.trim());
}
