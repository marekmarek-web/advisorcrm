"use server";

import { getCachedSupabaseUser } from "@/lib/auth/require-auth";
import type { AuthContext } from "@/lib/auth/require-auth";
import { assertCapability } from "@/lib/billing/plan-access-guards";
import type { EffectiveAccessContext, PlanCapabilityKey } from "@/lib/billing/plan-catalog";

/**
 * Server actions: plan guard using session user email for internal admin resolution.
 */
export async function assertCapabilityForAction(
  auth: AuthContext,
  capability: PlanCapabilityKey,
): Promise<EffectiveAccessContext> {
  const user = await getCachedSupabaseUser();
  return assertCapability({
    tenantId: auth.tenantId,
    userId: auth.userId,
    email: user?.email ?? null,
    capability,
  });
}
