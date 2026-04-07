/**
 * AI Photo / Image Intake — centralized configuration (Phase 7).
 *
 * Replaces all hardcoded limits with validated, configurable values.
 * Config is read from environment variables with safe defaults and validation.
 *
 * Config sources (priority order):
 * 1. Runtime override (set via admin/runtime controls — in-process Map)
 * 2. Environment variable
 * 3. Safe default
 *
 * No DB reads on the hot path — all config is resolved at request time from
 * env vars or in-process overrides, no per-request DB queries.
 */

// ---------------------------------------------------------------------------
// Config definitions
// ---------------------------------------------------------------------------

export type ImageIntakeConfigKey =
  | "cross_session_ttl_hours"
  | "cross_session_max_artifacts"
  | "combined_pass_max_images"
  | "intent_assist_confidence_threshold"
  | "intent_assist_enabled"
  | "intent_assist_cache_ttl_hours"
  | "cross_session_persistence_enabled"
  | "handoff_queue_submit_enabled"
  | "rollout_percentage_combined"
  | "rollout_percentage_cross_session"
  | "rollout_percentage_handoff_submit"
  /** Phase 11: interval (hours) for the dedicated cache cleanup cron. Default 2h. */
  | "cache_cleanup_interval_hours";

type ConfigDefinition = {
  envVar: string;
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  type: "number" | "boolean" | "string";
};

const CONFIG_DEFINITIONS: Record<ImageIntakeConfigKey, ConfigDefinition> = {
  cross_session_ttl_hours: {
    envVar: "IMAGE_INTAKE_CROSS_SESSION_TTL_HOURS",
    defaultValue: 72,
    min: 1,
    max: 168, // max 7 days
    type: "number",
  },
  cross_session_max_artifacts: {
    envVar: "IMAGE_INTAKE_CROSS_SESSION_MAX_ARTIFACTS",
    defaultValue: 20,
    min: 1,
    max: 100,
    type: "number",
  },
  combined_pass_max_images: {
    envVar: "IMAGE_INTAKE_COMBINED_PASS_MAX_IMAGES",
    defaultValue: 3,
    min: 2,
    max: 5,
    type: "number",
  },
  intent_assist_confidence_threshold: {
    envVar: "IMAGE_INTAKE_INTENT_ASSIST_THRESHOLD",
    defaultValue: 0.45,
    min: 0.1,
    max: 0.9,
    type: "number",
  },
  intent_assist_enabled: {
    envVar: "IMAGE_INTAKE_INTENT_ASSIST_ENABLED",
    defaultValue: false,
    type: "boolean",
  },
  intent_assist_cache_ttl_hours: {
    envVar: "IMAGE_INTAKE_INTENT_ASSIST_CACHE_TTL_HOURS",
    defaultValue: 0.5, // 30 minutes — matches in-process cache TTL
    min: 0.1,
    max: 24,
    type: "number",
  },
  cross_session_persistence_enabled: {
    envVar: "IMAGE_INTAKE_CROSS_SESSION_PERSISTENCE_ENABLED",
    defaultValue: false,
    type: "boolean",
  },
  handoff_queue_submit_enabled: {
    envVar: "IMAGE_INTAKE_HANDOFF_QUEUE_SUBMIT_ENABLED",
    defaultValue: false,
    type: "boolean",
  },
  rollout_percentage_combined: {
    envVar: "IMAGE_INTAKE_COMBINED_MULTIMODAL_PERCENTAGE",
    defaultValue: 100,
    min: 0,
    max: 100,
    type: "number",
  },
  rollout_percentage_cross_session: {
    envVar: "IMAGE_INTAKE_CROSS_SESSION_PERCENTAGE",
    defaultValue: 100,
    min: 0,
    max: 100,
    type: "number",
  },
  rollout_percentage_handoff_submit: {
    envVar: "IMAGE_INTAKE_HANDOFF_SUBMIT_PERCENTAGE",
    defaultValue: 100,
    min: 0,
    max: 100,
    type: "number",
  },
  cache_cleanup_interval_hours: {
    envVar: "IMAGE_INTAKE_CACHE_CLEANUP_INTERVAL_HOURS",
    defaultValue: 2,
    min: 0.5,
    max: 24,
    type: "number",
  },
};

// ---------------------------------------------------------------------------
// In-process runtime overrides (set via admin controls)
// ---------------------------------------------------------------------------

const runtimeOverrides = new Map<ImageIntakeConfigKey, number | boolean | string>();

/**
 * Set a runtime override (e.g., from admin UI). Validates against definition.
 * Returns validation error string or null on success.
 */
export function setImageIntakeConfigOverride(
  key: ImageIntakeConfigKey,
  value: number | boolean | string,
): string | null {
  const def = CONFIG_DEFINITIONS[key];
  if (!def) return `Unknown config key: ${key}`;

  if (def.type === "number" && typeof value === "number") {
    if (def.min !== undefined && value < def.min) return `${key}: value ${value} < min ${def.min}`;
    if (def.max !== undefined && value > def.max) return `${key}: value ${value} > max ${def.max}`;
  } else if (def.type === "boolean" && typeof value !== "boolean") {
    return `${key}: expected boolean, got ${typeof value}`;
  }

  runtimeOverrides.set(key, value);
  return null;
}

/**
 * Clear a runtime override (revert to env/default).
 */
export function clearImageIntakeConfigOverride(key: ImageIntakeConfigKey): void {
  runtimeOverrides.delete(key);
}

/**
 * Clear all runtime overrides (e.g., after reset).
 */
export function clearAllImageIntakeConfigOverrides(): void {
  runtimeOverrides.clear();
}

// ---------------------------------------------------------------------------
// Config resolver
// ---------------------------------------------------------------------------

function resolveValue(key: ImageIntakeConfigKey): number | boolean | string {
  const def = CONFIG_DEFINITIONS[key];

  // Priority 1: runtime override
  if (runtimeOverrides.has(key)) {
    return runtimeOverrides.get(key)!;
  }

  // Priority 2: env var
  const raw = process.env[def.envVar];
  if (raw !== undefined && raw.trim() !== "") {
    if (def.type === "boolean") {
      return raw.trim() === "true";
    }
    if (def.type === "number") {
      const n = parseFloat(raw.trim());
      if (!isNaN(n)) {
        if (def.min !== undefined && n < def.min) return def.defaultValue;
        if (def.max !== undefined && n > def.max) return def.defaultValue;
        return n;
      }
      return def.defaultValue; // invalid → safe default
    }
    return raw.trim();
  }

  // Priority 3: default
  return def.defaultValue;
}

// ---------------------------------------------------------------------------
// Typed accessors
// ---------------------------------------------------------------------------

/**
 * Resolved runtime config for image intake (explicit exported shape).
 * Cron routes and admin UI depend on this — keep in sync with getImageIntakeConfig().
 */
export type ImageIntakeResolvedConfig = {
  crossSessionTtlMs: number;
  crossSessionMaxArtifacts: number;
  combinedPassMaxImages: number;
  intentAssistThreshold: number;
  intentAssistEnabled: boolean;
  /** Phase 10: separate TTL for intent-assist cache cleanup (default 30 min). */
  intentAssistCacheTtlMs: number;
  crossSessionPersistenceEnabled: boolean;
  handoffQueueSubmitEnabled: boolean;
  /**
   * Phase 11: interval (hours) for the dedicated intent-assist cache cleanup cron.
   * Default 2h — informational; vercel.json holds the actual schedule.
   */
  cacheCleanupIntervalHours: number;
};

export function getImageIntakeConfig(): ImageIntakeResolvedConfig {
  return {
    crossSessionTtlMs: (resolveValue("cross_session_ttl_hours") as number) * 60 * 60 * 1000,
    crossSessionMaxArtifacts: resolveValue("cross_session_max_artifacts") as number,
    combinedPassMaxImages: resolveValue("combined_pass_max_images") as number,
    intentAssistThreshold: resolveValue("intent_assist_confidence_threshold") as number,
    intentAssistEnabled: resolveValue("intent_assist_enabled") as boolean,
    intentAssistCacheTtlMs: (resolveValue("intent_assist_cache_ttl_hours") as number) * 60 * 60 * 1000,
    crossSessionPersistenceEnabled: resolveValue("cross_session_persistence_enabled") as boolean,
    handoffQueueSubmitEnabled: resolveValue("handoff_queue_submit_enabled") as boolean,
    cacheCleanupIntervalHours: resolveValue("cache_cleanup_interval_hours") as number,
  };
}

/**
 * Returns all config values with source (override | env | default) for audit/debug.
 */
export function getImageIntakeConfigSummary(): Array<{
  key: ImageIntakeConfigKey;
  value: number | boolean | string;
  source: "override" | "env" | "default";
}> {
  return (Object.keys(CONFIG_DEFINITIONS) as ImageIntakeConfigKey[]).map((key) => {
    const def = CONFIG_DEFINITIONS[key];
    let source: "override" | "env" | "default";
    if (runtimeOverrides.has(key)) {
      source = "override";
    } else if (process.env[def.envVar] !== undefined) {
      source = "env";
    } else {
      source = "default";
    }
    return { key, value: resolveValue(key), source };
  });
}
