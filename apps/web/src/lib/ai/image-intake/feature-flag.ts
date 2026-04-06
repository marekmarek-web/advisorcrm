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
 * Returns true when multi-image session stitching is enabled (Phase 4).
 * Requires IMAGE_INTAKE_ENABLED=true AND IMAGE_INTAKE_STITCHING_ENABLED=true.
 * Default: false — each asset is processed independently when disabled.
 */
export function isImageIntakeStitchingEnabled(): boolean {
  return isImageIntakeEnabled() && process.env.IMAGE_INTAKE_STITCHING_ENABLED === "true";
}

/**
 * Returns true when AI Review handoff recommendation is enabled (Phase 4).
 * Requires IMAGE_INTAKE_ENABLED=true AND IMAGE_INTAKE_REVIEW_HANDOFF_ENABLED=true.
 * Default: false — review-like docs stay in image intake with archive-only outcome.
 */
export function isImageIntakeReviewHandoffEnabled(): boolean {
  return isImageIntakeEnabled() && process.env.IMAGE_INTAKE_REVIEW_HANDOFF_ENABLED === "true";
}

export function getImageIntakeStitchingFlagState(): "enabled" | "disabled" {
  return isImageIntakeStitchingEnabled() ? "enabled" : "disabled";
}

export function getImageIntakeReviewHandoffFlagState(): "enabled" | "disabled" {
  return isImageIntakeReviewHandoffEnabled() ? "enabled" : "disabled";
}

/**
 * Returns all flag states as a single trace-safe object.
 * Used for structured audit logging. Never logs env values.
 */
export function getImageIntakeFlagSummary(): Record<string, "enabled" | "disabled"> {
  return {
    base: getImageIntakeFlagState(),
    multimodal: getImageIntakeMultimodalFlagState(),
    stitching: getImageIntakeStitchingFlagState(),
    review_handoff: getImageIntakeReviewHandoffFlagState(),
  };
}

// ---------------------------------------------------------------------------
// Phase 5: Per-user / allowlist rollout v1
//
// Pattern: comma-separated user ID allowlist in env var.
// No enterprise platform — minimal, auditable, safe-default.
//
// IMAGE_INTAKE_ALLOWED_USER_IDS=user-abc123,user-def456,...
//   → only listed users get image intake capability
//   → when empty/unset: allow all users (if base flag is ON)
//
// Per-feature overrides (same pattern):
// IMAGE_INTAKE_MULTIMODAL_ALLOWED_USER_IDS=...
// IMAGE_INTAKE_THREAD_RECONSTRUCTION_ALLOWED_USER_IDS=...
// IMAGE_INTAKE_REVIEW_HANDOFF_ALLOWED_USER_IDS=...
// IMAGE_INTAKE_CASE_SIGNAL_ALLOWED_USER_IDS=...
// ---------------------------------------------------------------------------

function parseAllowlist(envVar: string): Set<string> | null {
  const raw = process.env[envVar]?.trim();
  if (!raw) return null; // null = allow all
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

function isUserAllowed(userId: string, allowlistEnvVar: string): boolean {
  const allowlist = parseAllowlist(allowlistEnvVar);
  if (!allowlist) return true; // no allowlist → allow all
  return allowlist.has(userId);
}

/**
 * Phase 5: Returns true when image intake is enabled for a specific user.
 * Checks base flag + optional per-user allowlist.
 */
export function isImageIntakeEnabledForUser(userId: string): boolean {
  return isImageIntakeEnabled() && isUserAllowed(userId, "IMAGE_INTAKE_ALLOWED_USER_IDS");
}

/**
 * Returns true when multimodal pass is enabled for a specific user.
 */
export function isImageIntakeMultimodalEnabledForUser(userId: string): boolean {
  return isImageIntakeMultimodalEnabled() &&
    isUserAllowed(userId, "IMAGE_INTAKE_MULTIMODAL_ALLOWED_USER_IDS");
}

/**
 * Returns true when thread reconstruction is enabled for a specific user.
 * Requires base + stitching flag ON.
 */
export function isImageIntakeThreadReconstructionEnabledForUser(userId: string): boolean {
  return isImageIntakeStitchingEnabled() &&
    process.env.IMAGE_INTAKE_THREAD_RECONSTRUCTION_ENABLED === "true" &&
    isUserAllowed(userId, "IMAGE_INTAKE_THREAD_RECONSTRUCTION_ALLOWED_USER_IDS");
}

/**
 * Returns true when AI Review handoff is enabled for a specific user.
 */
export function isImageIntakeReviewHandoffEnabledForUser(userId: string): boolean {
  return isImageIntakeReviewHandoffEnabled() &&
    isUserAllowed(userId, "IMAGE_INTAKE_REVIEW_HANDOFF_ALLOWED_USER_IDS");
}

/**
 * Returns true when advanced case signal extraction is enabled for a specific user.
 */
export function isImageIntakeCaseSignalEnabledForUser(userId: string): boolean {
  return isImageIntakeEnabled() &&
    process.env.IMAGE_INTAKE_CASE_SIGNAL_ENABLED === "true" &&
    isUserAllowed(userId, "IMAGE_INTAKE_CASE_SIGNAL_ALLOWED_USER_IDS");
}

/**
 * Returns Phase 5 rollout summary for a specific user (trace-safe).
 */
export function getImageIntakeUserRolloutSummary(userId: string): {
  base: boolean;
  multimodal: boolean;
  threadReconstruction: boolean;
  reviewHandoff: boolean;
  caseSignal: boolean;
  reason: string;
} {
  const base = isImageIntakeEnabledForUser(userId);
  return {
    base,
    multimodal: base && isImageIntakeMultimodalEnabledForUser(userId),
    threadReconstruction: base && isImageIntakeThreadReconstructionEnabledForUser(userId),
    reviewHandoff: base && isImageIntakeReviewHandoffEnabledForUser(userId),
    caseSignal: base && isImageIntakeCaseSignalEnabledForUser(userId),
    reason: base
      ? "user is allowed by base flag and optional per-feature allowlists"
      : "image intake disabled (base flag or user allowlist exclusion)",
  };
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
