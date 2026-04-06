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
 * Returns true when the multimodal vision pass is enabled.
 * Requires IMAGE_INTAKE_ENABLED=true AND IMAGE_INTAKE_MULTIMODAL_ENABLED=true.
 * Default: false (safe — v1 text classifier is used instead).
 *
 * This flag allows enabling image intake without paying for vision calls in early rollout.
 */
export function isImageIntakeMultimodalEnabled(): boolean {
  return isImageIntakeEnabled() && process.env.IMAGE_INTAKE_MULTIMODAL_ENABLED === "true";
}

/**
 * Returns state string for tracing / telemetry meta.
 * Never logs sensitive env values.
 */
export function getImageIntakeFlagState(): "enabled" | "disabled" {
  return isImageIntakeEnabled() ? "enabled" : "disabled";
}

export function getImageIntakeMultimodalFlagState(): "enabled" | "disabled" {
  return isImageIntakeMultimodalEnabled() ? "enabled" : "disabled";
}

/**
 * Returns the model routing config for the multimodal combined pass.
 * Uses copilot category (same as classifier) for consistent model routing.
 */
export function getImageIntakeMultimodalConfig(): {
  model: string | undefined;
  routingCategory: "copilot";
} {
  return {
    model: process.env.IMAGE_INTAKE_MULTIMODAL_MODEL?.trim() || undefined,
    routingCategory: "copilot",
  };
}
