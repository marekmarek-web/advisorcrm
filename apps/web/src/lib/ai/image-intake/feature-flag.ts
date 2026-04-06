/**
 * AI Photo / Image Intake — feature flag and runtime config.
 *
 * Pattern: env-var based, consistent with existing repo flags
 * (AI_REVIEW_USE_V2_PIPELINE, NEXT_PUBLIC_DISABLE_CLIENT_PORTAL_AI, etc.)
 *
 * Safe defaults: feature is OFF unless IMAGE_INTAKE_ENABLED=true.
 */

/**
 * Returns true when image intake lane is enabled for this environment.
 * Default: false (safe — existing text flow is unaffected when disabled).
 */
export function isImageIntakeEnabled(): boolean {
  return process.env.IMAGE_INTAKE_ENABLED === "true";
}

/**
 * Returns the model routing config for the cheap classifier call.
 * Allows per-env override without changing code.
 */
export function getImageIntakeClassifierConfig(): {
  /** Explicit model override; undefined → use copilot category default. */
  model: string | undefined;
  /** Routing category for OpenAI model resolution. */
  routingCategory: "copilot";
  /** Max classifier response tokens — kept small for cost. */
  maxOutputTokens: number;
} {
  return {
    model: process.env.IMAGE_INTAKE_CLASSIFIER_MODEL?.trim() || undefined,
    routingCategory: "copilot",
    maxOutputTokens: 120,
  };
}

/**
 * Returns state string for tracing / telemetry meta.
 * Never logs sensitive env values.
 */
export function getImageIntakeFlagState(): "enabled" | "disabled" {
  return isImageIntakeEnabled() ? "enabled" : "disabled";
}
