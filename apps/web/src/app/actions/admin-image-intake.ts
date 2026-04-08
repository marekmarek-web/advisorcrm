"use server";

/**
 * Server actions for Image Intake admin control surface (Phase 8).
 *
 * Provides safe, audited read/write access to image-intake runtime overrides
 * and feature flags from the admin UI.
 *
 * Access control: requires settings:write permission (same as other admin actions).
 * Audit trail: uses logConfigChange for all mutations.
 * Safe defaults: validation delegates to setImageIntakeConfigOverride.
 */

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";
import { deriveAdminScope, canManageFeatureFlags } from "@/lib/admin/admin-permissions";
import { getMembership } from "@/lib/auth/get-membership";
import { logConfigChange } from "@/lib/admin/config-audit";
import {
  getImageIntakeConfig,
  getImageIntakeConfigSummary,
  setImageIntakeConfigOverride,
  clearImageIntakeConfigOverride,
  type ImageIntakeConfigKey,
} from "@/lib/ai/image-intake/image-intake-config";
import {
  getImageIntakeAdminFlags,
  setFeatureOverride,
  clearFeatureOverride,
} from "@/lib/admin/feature-flags";
import { getIntentAssistCacheStats } from "@/lib/ai/image-intake/intent-assist-cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageIntakeAdminState = {
  /** Feature flags (tenant-level admin toggles). */
  flags: {
    enabled: boolean;
    combinedMultimodal: boolean;
    intentAssist: boolean;
    handoffQueueSubmit: boolean;
    crossSessionPersistence: boolean;
  };
  /** Runtime config (env + overrides). */
  config: ReturnType<typeof getImageIntakeConfig>;
  /** Config summary with sources. */
  configSummary: ReturnType<typeof getImageIntakeConfigSummary>;
  /** Intent-assist cache stats. */
  cacheStats: ReturnType<typeof getIntentAssistCacheStats>;
};

// ---------------------------------------------------------------------------
// Permissions helper
// ---------------------------------------------------------------------------

async function requireImageIntakeAdmin() {
  const auth = await requireAuthInAction();
  if (
    !hasPermission(auth.roleName as RoleName, "admin:*") &&
    !hasPermission(auth.roleName as RoleName, "settings:write")
  ) {
    throw new Error("Nedostatečná oprávnění pro správu image intake.");
  }
  const membership = await getMembership(auth.userId);
  if (!membership) throw new Error("Membership not found.");
  return { auth, membership };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Returns current image intake admin state (flags + config + cache stats).
 * Read-only; always returns something safe.
 */
export async function getImageIntakeAdminState(): Promise<ImageIntakeAdminState> {
  const { membership } = await requireImageIntakeAdmin();
  const flags = getImageIntakeAdminFlags(membership.tenantId);
  const config = getImageIntakeConfig();
  const configSummary = getImageIntakeConfigSummary();
  const cacheStats = getIntentAssistCacheStats();
  return { flags, config, configSummary, cacheStats };
}

// ---------------------------------------------------------------------------
// Feature flag mutations
// ---------------------------------------------------------------------------

/**
 * Sets or clears a tenant image intake feature flag.
 * Only global_admin can manage feature flags.
 */
export async function setImageIntakeFeatureFlag(
  flagCode: string,
  enabled: boolean,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { auth, membership } = await requireImageIntakeAdmin();
    const scope = deriveAdminScope(auth.roleName as RoleName);
    if (!canManageFeatureFlags(scope)) {
      return { ok: false, error: "Správu feature flags může provést pouze global admin." };
    }

    const validCodes = [
      "image_intake_enabled",
      "image_intake_combined_multimodal",
      "image_intake_intent_assist",
      "image_intake_handoff_queue",
      "image_intake_cross_session_persistence",
    ];
    if (!validCodes.includes(flagCode)) {
      return { ok: false, error: `Neplatný kód příznaku: ${flagCode}` };
    }

    setFeatureOverride(flagCode, membership.tenantId, enabled);

    await logConfigChange({
      tenantId: membership.tenantId,
      userId: auth.userId,
      domain: "feature_flags",
      key: `image_intake.${flagCode}`,
      oldValue: !enabled,
      newValue: enabled,
      reason: reason ?? "image intake admin panel",
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Neznámá chyba." };
  }
}

/**
 * Clears a tenant image intake feature flag override (reverts to default).
 */
export async function clearImageIntakeFeatureFlag(
  flagCode: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { auth, membership } = await requireImageIntakeAdmin();
    const scope = deriveAdminScope(auth.roleName as RoleName);
    if (!canManageFeatureFlags(scope)) {
      return { ok: false, error: "Správu feature flags může provést pouze global admin." };
    }

    clearFeatureOverride(flagCode, membership.tenantId);

    await logConfigChange({
      tenantId: membership.tenantId,
      userId: auth.userId,
      domain: "feature_flags",
      key: `image_intake.${flagCode}`,
      oldValue: null,
      newValue: "cleared",
      reason: reason ?? "image intake admin panel",
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Neznámá chyba." };
  }
}

// ---------------------------------------------------------------------------
// Config key mutations
// ---------------------------------------------------------------------------

/**
 * Sets a runtime image intake config override.
 * Validates value via setImageIntakeConfigOverride (returns error string on invalid).
 */
export async function setImageIntakeConfigValue(
  key: ImageIntakeConfigKey,
  value: number | boolean,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { auth, membership } = await requireImageIntakeAdmin();

    const validationError = setImageIntakeConfigOverride(key, value);
    if (validationError) {
      return { ok: false, error: validationError };
    }

    await logConfigChange({
      tenantId: membership.tenantId,
      userId: auth.userId,
      domain: "ai_behavior",
      key: `image_intake_config.${key}`,
      oldValue: null,
      newValue: value,
      reason: reason ?? "image intake admin panel",
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Neznámá chyba." };
  }
}

/**
 * Clears a runtime image intake config override (reverts to env/default).
 */
export async function clearImageIntakeConfigValue(
  key: ImageIntakeConfigKey,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { auth, membership } = await requireImageIntakeAdmin();

    clearImageIntakeConfigOverride(key);

    await logConfigChange({
      tenantId: membership.tenantId,
      userId: auth.userId,
      domain: "ai_behavior",
      key: `image_intake_config.${key}`,
      oldValue: null,
      newValue: "cleared",
      reason: reason ?? "image intake admin panel",
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Neznámá chyba." };
  }
}

// ---------------------------------------------------------------------------
// Phase 10: Household ambiguity resolution flow
// ---------------------------------------------------------------------------

import { logAudit } from "@/lib/audit";
import type { HouseholdMember } from "@/lib/ai/image-intake/types";

export type HouseholdResolutionResult = {
  ok: boolean;
  resolvedClientId: string | null;
  resolvedClientLabel: string | null;
  auditRef: string | null;
  error?: string;
};

/**
 * Resolves household ambiguity by explicitly selecting a household member as the
 * primary binding target for a given image intake session/context.
 *
 * Safety rules:
 * - Requires advisor-level permission (settings:write)
 * - The resolved clientId must be a current member of the household
 * - Resolution is surfaced in audit log
 * - Does NOT auto-pick without explicit clientId — empty/null = keep ambiguity
 * - No silent write to CRM; UI must subsequently use the returned clientId for any action
 *
 * @param householdId     The household where ambiguity was detected
 * @param members         Current household members (from resolveHouseholdBinding result)
 * @param selectedClientId The clientId the advisor explicitly chose
 * @param intakeContext   Optional: intake session ID or context label for audit trail
 */
export async function resolveHouseholdAmbiguity(
  householdId: string,
  members: HouseholdMember[],
  selectedClientId: string,
  intakeContext?: string,
): Promise<HouseholdResolutionResult> {
  try {
    const { auth, membership } = await requireImageIntakeAdmin();

    // Validate that selectedClientId is actually a member of this household
    const member = members.find(
      (m) => m.clientId === selectedClientId && m.householdId === householdId,
    );
    if (!member) {
      return {
        ok: false,
        resolvedClientId: null,
        resolvedClientLabel: null,
        auditRef: null,
        error: `Klient ${selectedClientId} není členem domácnosti ${householdId}.`,
      };
    }

    const { randomUUID } = await import("crypto");
    const auditRef = randomUUID();

    await logAudit({
      tenantId: membership.tenantId,
      userId: auth.userId,
      action: "image_intake_household_ambiguity_resolved",
      entityType: "household",
      entityId: householdId,
      meta: {
        householdId,
        selectedClientId,
        selectedClientLabel: member.clientLabel,
        intakeContext: intakeContext ?? null,
        memberCount: members.length,
        auditRef,
      },
    });

    return {
      ok: true,
      resolvedClientId: selectedClientId,
      resolvedClientLabel: member.clientLabel,
      auditRef,
    };
  } catch (err) {
    return {
      ok: false,
      resolvedClientId: null,
      resolvedClientLabel: null,
      auditRef: null,
      error: err instanceof Error ? err.message : "Neznámá chyba při řešení ambiguity domácnosti.",
    };
  }
}

/**
 * Returns the household binding state for a given client — useful for admin UI to surface
 * ambiguity before initiating a resolution flow.
 *
 * Read-only; never throws.
 */
export async function getHouseholdBindingStateForAdmin(
  clientId: string,
  activeClientId?: string | null,
): Promise<{ ok: boolean; result: import("@/lib/ai/image-intake/types").HouseholdBindingResult | null; error?: string }> {
  try {
    const { membership } = await requireImageIntakeAdmin();
    const { resolveHouseholdBinding } = await import("@/lib/ai/image-intake/binding-household");
    const result = await resolveHouseholdBinding(membership.tenantId, clientId, activeClientId);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      result: null,
      error: err instanceof Error ? err.message : "Chyba při načítání stavu domácnosti.",
    };
  }
}
