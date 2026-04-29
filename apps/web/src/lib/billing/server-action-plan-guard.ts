"use server";

import { getCachedSupabaseUser } from "@/lib/auth/require-auth";
import type { AuthContext } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { assertCapability } from "@/lib/billing/plan-access-guards";
import {
  getInternalAdminCapabilities,
  getInternalAdminLimits,
  type EffectiveAccessContext,
  type PlanCapabilityKey,
} from "@/lib/billing/plan-catalog";

function buildRoleBypassAccessContext(): EffectiveAccessContext {
  return {
    source: "internal_admin",
    publicPlanKey: null,
    internalTier: null,
    capabilities: getInternalAdminCapabilities(),
    limits: getInternalAdminLimits(),
    trialInfo: null,
    isBypassed: true,
    isTrial: false,
    isRestricted: false,
  };
}

/**
 * Server actions: plan guard using session user email for internal admin resolution.
 */
export async function assertCapabilityForAction(
  auth: AuthContext,
  capability: PlanCapabilityKey,
): Promise<EffectiveAccessContext> {
  if (hasPermission(auth.roleName, "admin:*")) {
    return buildRoleBypassAccessContext();
  }

  const user = await getCachedSupabaseUser();
  return assertCapability({
    tenantId: auth.tenantId,
    userId: auth.userId,
    email: user?.email ?? null,
    capability,
  });
}
