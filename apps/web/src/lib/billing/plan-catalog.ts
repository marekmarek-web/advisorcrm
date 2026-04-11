/**
 * Central source of truth for public product plans vs internal billing tiers (Phase 0–1).
 * Internal Stripe/DB tiers remain starter | pro | team; public names are Start | Pro | Management.
 */

import type { PlanTier } from "@/lib/stripe/billing-types";

// ─── Public vs internal identity ─────────────────────────────────────────────

export const PUBLIC_PLAN_KEYS = ["start", "pro", "management"] as const;
export type PublicPlanKey = (typeof PUBLIC_PLAN_KEYS)[number];

/** Ordered low → high for comparison (maps to internal tiers 1:1). */
export const PUBLIC_PLAN_ORDER: readonly PublicPlanKey[] = ["start", "pro", "management"] as const;

// ─── Capability matrix (granular; Phase 2+ enforcement) ───────────────────────

export const PLAN_CAPABILITY_KEYS = [
  "crm_core",
  "google_calendar",
  "google_gmail",
  "google_drive",
  "client_portal_documents",
  "client_portal_messaging",
  "client_portal_service_requests",
  "ai_assistant_basic",
  "ai_assistant_image_intake",
  "ai_assistant_pdf_read",
  "ai_assistant_multi_step",
  "ai_review",
  "ai_review_export_pdf",
  "team_overview",
  "team_production",
  "team_goals_events",
  "manager_summary",
  "reports_advanced",
] as const;

export type PlanCapabilityKey = (typeof PLAN_CAPABILITY_KEYS)[number];

export type PlanCapabilities = Readonly<Record<PlanCapabilityKey, boolean>>;

// ─── Limits (config-only until Phase 2 quota layer) ──────────────────────────

export type PlanLimits = Readonly<{
  aiActionsPerMonth: number;
  aiImageIntakesPerMonth: number;
  aiReviewPagesPerMonth: number;
  internalTokenBudgetPerMonth: number;
}>;

/** Runtime limits: either plan numeric caps or bypass (internal admin). */
export type EffectiveLimits =
  | Readonly<{ bypass: true }>
  | Readonly<{ bypass: false; limits: PlanLimits }>;

// ─── Special access modes (not public pricing tiers) ─────────────────────────

export const SPECIAL_ACCESS_MODES = ["internal_admin", "trial", "restricted"] as const;
export type SpecialAccessMode = (typeof SPECIAL_ACCESS_MODES)[number];

/**
 * Effective access source after resolution precedence.
 * - `subscription` — paid (or Stripe trialing) subscription row drives tier.
 * - `trial` — workspace 14d trial (PRO-level); no public tier id.
 * - `internal_admin` — env allowlist bypass.
 * - `restricted` — no active subscription and no active workspace trial (Phase 2 paywall).
 */
export type EffectiveAccessSource = "internal_admin" | "subscription" | "trial" | "restricted";

export type TrialInfo = Readonly<{
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialPlanKey: string | null;
  /** Calendar days left in workspace trial window; 0 when expired. */
  daysRemaining: number | null;
  isActive: boolean;
}>;

export type EffectiveAccessContext = Readonly<{
  source: EffectiveAccessSource;
  /** Public product key when tied to a paid tier; null for internal_admin / some restricted states. */
  publicPlanKey: PublicPlanKey | null;
  /** Internal Stripe tier when subscription drives access; null for internal_admin / trial-only. */
  internalTier: PlanTier | null;
  capabilities: PlanCapabilities;
  limits: EffectiveLimits;
  trialInfo: TrialInfo | null;
  isBypassed: boolean;
  isTrial: boolean;
  isRestricted: boolean;
}>;

/** Workspace trial: same duration as Stripe marketing default; independent access mode. */
export const TRIAL_DURATION_DAYS = 14 as const;

/**
 * Internal tier key for default trial entitlements (maps to PRO public plan / capabilities).
 * @see getPlanDefinitionByInternalTier("pro")
 */
export const DEFAULT_TRIAL_PLAN = "pro" as const;

export function getTrialDurationDays(): number {
  return TRIAL_DURATION_DAYS;
}

export function getTrialPlanDefinition(): PlanDefinition {
  return PLAN_CATALOG_BY_PUBLIC_KEY.pro;
}

function makeAllCapabilitiesEnabled(): PlanCapabilities {
  return Object.fromEntries(PLAN_CAPABILITY_KEYS.map((k) => [k, true])) as PlanCapabilities;
}

/** Internal admin: every catalog capability on; enforcement must bypass numeric limits. */
export function getInternalAdminCapabilities(): PlanCapabilities {
  return makeAllCapabilitiesEnabled();
}

export function getInternalAdminLimits(): EffectiveLimits {
  return { bypass: true };
}

/** Phase 2: tighten which capabilities stay on in restricted / upgrade-required state. */
export const RESTRICTED_CAPABILITIES: PlanCapabilities = {
  crm_core: true,
  google_calendar: false,
  google_gmail: false,
  google_drive: false,
  client_portal_documents: false,
  client_portal_messaging: false,
  client_portal_service_requests: false,
  ai_assistant_basic: false,
  ai_assistant_image_intake: false,
  ai_assistant_pdf_read: false,
  ai_assistant_multi_step: false,
  ai_review: false,
  ai_review_export_pdf: false,
  team_overview: false,
  team_production: false,
  team_goals_events: false,
  manager_summary: false,
  reports_advanced: false,
};

const RESTRICTED_LIMITS: PlanLimits = {
  aiActionsPerMonth: 0,
  aiImageIntakesPerMonth: 0,
  aiReviewPagesPerMonth: 0,
  internalTokenBudgetPerMonth: 0,
};

export function getRestrictedCapabilities(): PlanCapabilities {
  return RESTRICTED_CAPABILITIES;
}

export function getRestrictedLimits(): EffectiveLimits {
  return { bypass: false, limits: RESTRICTED_LIMITS };
}

export function shouldBypassPlanLimits(limits: EffectiveLimits): boolean {
  return limits.bypass === true;
}

export function isTrialActive(params: {
  trialEndsAt: Date | null | undefined;
  trialConvertedAt: Date | null | undefined;
  now: Date;
}): boolean {
  const { trialEndsAt, trialConvertedAt, now } = params;
  if (trialConvertedAt) return false;
  if (!trialEndsAt) return false;
  return now.getTime() < trialEndsAt.getTime();
}

export function getTrialEndsAt(trialEndsAt: Date | null | undefined): Date | null {
  return trialEndsAt ?? null;
}

export function getDaysRemainingInTrial(trialEndsAt: Date | null | undefined, now: Date): number | null {
  if (!trialEndsAt) return null;
  const ms = trialEndsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/** User-facing badge labels (not pricing tiers). Trial = úroveň Pro — viz workspace trial v dokumentaci. */
export const ACCESS_MODE_UI_LABEL = {
  trial: "14denní trial aktivní",
  trialPlanNote: "úroveň Pro",
  internalAdmin: "Admin access",
} as const;

export function getTrialBadgeLabel(): string {
  return ACCESS_MODE_UI_LABEL.trial;
}

export function getInternalAdminBadgeLabel(): string {
  return ACCESS_MODE_UI_LABEL.internalAdmin;
}

// ─── Tenant settings synced from plan defaults (SETTINGS_REGISTRY + Phase 2 keys) ─

/** Keys provisioned / synced by {@link syncPlanDefaultsToTenantSettings}. */
export const ALL_PLAN_SYNCED_SETTING_KEYS = [
  "client_portal.enabled",
  "client_portal.allow_document_upload",
  "client_portal.allow_messaging",
  "client_portal.allow_service_requests",
  "ai.assistant_enabled",
  "ai.assistant_basic_enabled",
  "ai.assistant_image_intake_enabled",
  "ai.assistant_pdf_read_enabled",
  "ai.assistant_multi_step_enabled",
  "ai.review_enabled",
  "ai.review_export_pdf_enabled",
  "integrations.google_calendar_enabled",
  "integrations.google_gmail_enabled",
  "integrations.google_drive_enabled",
  "team.overview_enabled",
  "team.production_enabled",
  "team.goals_events_enabled",
  "manager.summary_enabled",
  "reports.advanced_enabled",
] as const;

export type PlanSyncedTenantSettingKey = (typeof ALL_PLAN_SYNCED_SETTING_KEYS)[number];

export type PlanDefaultTenantSettings = Readonly<Record<PlanSyncedTenantSettingKey, boolean>>;

export type PlanDefinition = Readonly<{
  publicPlanKey: PublicPlanKey;
  publicLabel: string;
  internalTier: PlanTier;
  descriptionShort: string;
  capabilities: PlanCapabilities;
  limits: PlanLimits;
  defaultTenantSettings: PlanDefaultTenantSettings;
}>;

const CAP_START: PlanCapabilities = {
  crm_core: true,
  google_calendar: true,
  google_gmail: false,
  google_drive: false,
  client_portal_documents: true,
  client_portal_messaging: false,
  client_portal_service_requests: false,
  ai_assistant_basic: true,
  ai_assistant_image_intake: true,
  ai_assistant_pdf_read: false,
  ai_assistant_multi_step: false,
  ai_review: false,
  ai_review_export_pdf: false,
  team_overview: false,
  team_production: false,
  team_goals_events: false,
  manager_summary: false,
  reports_advanced: false,
};

const CAP_PRO: PlanCapabilities = {
  ...CAP_START,
  google_gmail: true,
  google_drive: true,
  client_portal_messaging: true,
  client_portal_service_requests: true,
  ai_assistant_pdf_read: true,
  ai_assistant_multi_step: true,
  ai_review: true,
  ai_review_export_pdf: true,
};

const CAP_MANAGEMENT: PlanCapabilities = {
  ...CAP_PRO,
  team_overview: true,
  team_production: true,
  team_goals_events: true,
  manager_summary: true,
  reports_advanced: true,
};

const LIMITS_START: PlanLimits = {
  aiActionsPerMonth: 150,
  aiImageIntakesPerMonth: 20,
  aiReviewPagesPerMonth: 0,
  internalTokenBudgetPerMonth: 500_000,
};

const LIMITS_PRO: PlanLimits = {
  aiActionsPerMonth: 700,
  aiImageIntakesPerMonth: 100,
  aiReviewPagesPerMonth: 300,
  internalTokenBudgetPerMonth: 2_500_000,
};

const LIMITS_MANAGEMENT: PlanLimits = {
  aiActionsPerMonth: 2500,
  aiImageIntakesPerMonth: 300,
  aiReviewPagesPerMonth: 1200,
  internalTokenBudgetPerMonth: 8_000_000,
};

/** Full defaults per plan (capability matrix + registry; used for sync + effective resolution). */
const SETTINGS_START: PlanDefaultTenantSettings = {
  "client_portal.enabled": true,
  "client_portal.allow_document_upload": true,
  "client_portal.allow_messaging": false,
  "client_portal.allow_service_requests": false,
  "ai.assistant_enabled": true,
  "ai.assistant_basic_enabled": true,
  "ai.assistant_image_intake_enabled": true,
  "ai.assistant_pdf_read_enabled": false,
  "ai.assistant_multi_step_enabled": false,
  "ai.review_enabled": false,
  "ai.review_export_pdf_enabled": false,
  "integrations.google_calendar_enabled": true,
  "integrations.google_gmail_enabled": false,
  "integrations.google_drive_enabled": false,
  "team.overview_enabled": false,
  "team.production_enabled": false,
  "team.goals_events_enabled": false,
  "manager.summary_enabled": false,
  "reports.advanced_enabled": false,
};

const SETTINGS_PRO: PlanDefaultTenantSettings = {
  ...SETTINGS_START,
  "client_portal.allow_messaging": true,
  "client_portal.allow_service_requests": true,
  "ai.assistant_pdf_read_enabled": true,
  "ai.assistant_multi_step_enabled": true,
  "ai.review_enabled": true,
  "ai.review_export_pdf_enabled": true,
  "integrations.google_gmail_enabled": true,
  "integrations.google_drive_enabled": true,
};

const SETTINGS_MANAGEMENT: PlanDefaultTenantSettings = {
  ...SETTINGS_PRO,
  "team.overview_enabled": true,
  "team.production_enabled": true,
  "team.goals_events_enabled": true,
  "manager.summary_enabled": true,
  "reports.advanced_enabled": true,
};

export const PLAN_CATALOG_BY_PUBLIC_KEY: Readonly<Record<PublicPlanKey, PlanDefinition>> = {
  start: {
    publicPlanKey: "start",
    publicLabel: "Start",
    internalTier: "starter",
    descriptionShort:
      "CRM, pipeline, kalendář, úkoly, Google Calendar, klientská zóna pro dokumenty, základní AI a image intake. Bez klientského chatu, požadavků z portálu a AI review PDF.",
    capabilities: CAP_START,
    limits: LIMITS_START,
    defaultTenantSettings: SETTINGS_START,
  },
  pro: {
    publicPlanKey: "pro",
    publicLabel: "Pro",
    internalTier: "pro",
    descriptionShort:
      "Vše ze Startu plus Gmail, Drive, klientský chat, požadavky z portálu, AI review PDF a pokročilý asistent; finanční analýzy a kalkulačky dle modulů v aplikaci.",
    capabilities: CAP_PRO,
    limits: LIMITS_PRO,
    defaultTenantSettings: SETTINGS_PRO,
  },
  management: {
    publicPlanKey: "management",
    publicLabel: "Management",
    internalTier: "team",
    descriptionShort:
      "Vše z Pro plus týmové přehledy, produkce, KPI, manažerské a pokročilé reporty, řízení rolí a sdílené pohledy v rámci workspace.",
    capabilities: CAP_MANAGEMENT,
    limits: LIMITS_MANAGEMENT,
    defaultTenantSettings: SETTINGS_MANAGEMENT,
  },
} as const;

export const PLAN_CATALOG_BY_INTERNAL_TIER: Readonly<Record<PlanTier, PlanDefinition>> = {
  starter: PLAN_CATALOG_BY_PUBLIC_KEY.start,
  pro: PLAN_CATALOG_BY_PUBLIC_KEY.pro,
  team: PLAN_CATALOG_BY_PUBLIC_KEY.management,
};

/** Short label shown in pricing/checkout UI per internal tier (Stripe metadata stays tier ids). */
export const PUBLIC_DISPLAY_TITLE_BY_TIER: Readonly<Record<PlanTier, string>> = {
  starter: PLAN_CATALOG_BY_PUBLIC_KEY.start.publicLabel,
  pro: PLAN_CATALOG_BY_PUBLIC_KEY.pro.publicLabel,
  team: PLAN_CATALOG_BY_PUBLIC_KEY.management.publicLabel,
} as const;

// ─── Helpers (pure, no side effects) ─────────────────────────────────────────

export function getPlanDefinitionByPublicKey(key: PublicPlanKey): PlanDefinition {
  return PLAN_CATALOG_BY_PUBLIC_KEY[key];
}

export function getPlanDefinitionByInternalTier(tier: PlanTier): PlanDefinition {
  return PLAN_CATALOG_BY_INTERNAL_TIER[tier];
}

export function getPublicPlanKeyFromTier(tier: PlanTier): PublicPlanKey {
  return getPlanDefinitionByInternalTier(tier).publicPlanKey;
}

export function getPublicPlanLabelFromTier(tier: PlanTier): string {
  return PUBLIC_DISPLAY_TITLE_BY_TIER[tier];
}

/**
 * Resolves defaults by internal tier or public key. Note: `"pro"` is both a {@link PlanTier}
 * and a {@link PublicPlanKey} and refers to the same product row.
 */
function resolvePlanDefinition(publicOrTier: PublicPlanKey | PlanTier): PlanDefinition {
  if (publicOrTier === "starter" || publicOrTier === "pro" || publicOrTier === "team") {
    return getPlanDefinitionByInternalTier(publicOrTier);
  }
  return getPlanDefinitionByPublicKey(publicOrTier);
}

export function getDefaultPlanCapabilities(publicOrTier: PublicPlanKey | PlanTier): PlanCapabilities {
  return resolvePlanDefinition(publicOrTier).capabilities;
}

export function getDefaultPlanLimits(publicOrTier: PublicPlanKey | PlanTier): PlanLimits {
  return resolvePlanDefinition(publicOrTier).limits;
}

export function getDefaultTenantSettingsForPlan(publicOrTier: PublicPlanKey | PlanTier): PlanDefaultTenantSettings {
  return resolvePlanDefinition(publicOrTier).defaultTenantSettings;
}

/** Settings sync contract for provisioning / Phase 2 tenant bootstrap (returns a shallow copy). */
export function getTenantSettingsDefaultsForPlan(publicOrTier: PublicPlanKey | PlanTier): PlanDefaultTenantSettings {
  return { ...getDefaultTenantSettingsForPlan(publicOrTier) };
}

export function getRestrictedDefaultTenantSettings(): Record<PlanSyncedTenantSettingKey, boolean> {
  return Object.fromEntries(ALL_PLAN_SYNCED_SETTING_KEYS.map((k) => [k, false])) as Record<
    PlanSyncedTenantSettingKey,
    boolean
  >;
}

export function getInternalAdminDefaultTenantSettings(): Record<PlanSyncedTenantSettingKey, boolean> {
  return Object.fromEntries(ALL_PLAN_SYNCED_SETTING_KEYS.map((k) => [k, true])) as Record<
    PlanSyncedTenantSettingKey,
    boolean
  >;
}

/**
 * Plan-only defaults for the resolved access context (no tenant overrides).
 * Used by sync and as input to capability-gated effective settings.
 */
export function getPlanDefaultTenantSettingsFromAccessContext(
  ctx: EffectiveAccessContext,
): Record<PlanSyncedTenantSettingKey, boolean> {
  if (ctx.source === "internal_admin") {
    return { ...getInternalAdminDefaultTenantSettings() };
  }
  if (ctx.source === "restricted") {
    return { ...getRestrictedDefaultTenantSettings() };
  }
  if (ctx.source === "trial") {
    return { ...getTrialPlanDefinition().defaultTenantSettings };
  }
  if (ctx.source === "subscription") {
    if (ctx.publicPlanKey) {
      return { ...PLAN_CATALOG_BY_PUBLIC_KEY[ctx.publicPlanKey].defaultTenantSettings };
    }
    if (ctx.internalTier) {
      return { ...getPlanDefinitionByInternalTier(ctx.internalTier).defaultTenantSettings };
    }
  }
  return { ...getRestrictedDefaultTenantSettings() };
}

const TIER_RANK: Record<PlanTier, number> = {
  starter: 0,
  pro: 1,
  team: 2,
};

export function isHigherPlanOrEqual(a: PlanTier, b: PlanTier): boolean {
  return TIER_RANK[a] >= TIER_RANK[b];
}

export function publicPlanKeyOrderIndex(key: PublicPlanKey): number {
  return PUBLIC_PLAN_ORDER.indexOf(key);
}

export function isHigherPublicPlanOrEqual(a: PublicPlanKey, b: PublicPlanKey): boolean {
  return publicPlanKeyOrderIndex(a) >= publicPlanKeyOrderIndex(b);
}

// ─── Stored subscription label display (DB / Stripe metadata) ─────────────────

const LEGACY_FIRST_TOKEN_TO_TIER = {
  starter: "starter",
  start: "starter",
  pro: "pro",
  team: "team",
  management: "team",
} as const satisfies Record<string, PlanTier>;

/**
 * Best-effort parse of internal tier from `subscriptions.plan` / Stripe display string.
 * Handles legacy Czech labels and new public names.
 */
export function tryParseInternalTierFromStoredPlan(plan: string | null | undefined): PlanTier | null {
  if (plan == null || !String(plan).trim()) return null;
  const head = String(plan).trim().split(/\s*\(/)[0]?.trim().toLowerCase() ?? "";
  if (head in LEGACY_FIRST_TOKEN_TO_TIER) {
    return LEGACY_FIRST_TOKEN_TO_TIER[head as keyof typeof LEGACY_FIRST_TOKEN_TO_TIER];
  }
  // price id / nickname fallback: substring match (last resort)
  const lower = plan.toLowerCase();
  if (/\bstarter\b|\bstart\b/.test(lower) && !/\bstarting\b/.test(lower)) return "starter";
  if (/\bteam\b/.test(lower) && !/\bteam_events\b/.test(lower)) return "team";
  if (/\bpro\b/.test(lower)) return "pro";
  return null;
}

/**
 * User-facing plan line for workspace billing (keeps interval text, swaps tier names).
 */
export function formatStoredSubscriptionPlanLabel(plan: string | null | undefined): string | null {
  if (plan == null || !String(plan).trim()) return null;
  let s = String(plan);
  s = s.replace(/\bStarter\b/gi, "Start");
  s = s.replace(/\bTeam\b/gi, "Management");
  return s;
}
