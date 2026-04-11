import "server-only";

import { checkEntitlement, type EntitlementKey } from "@/lib/entitlements";
import { requireAuth, getCachedSupabaseUser, type AuthContext } from "./require-auth";

/**
 * Guard: resolves auth + checks that the tenant has a specific entitlement.
 * Throws if entitlement is not satisfied (caller should catch and show appropriate UI).
 */
export async function requireEntitlement(
  key: EntitlementKey,
  auth?: AuthContext,
): Promise<AuthContext> {
  const ctx = auth ?? await requireAuth();
  const user = await getCachedSupabaseUser();
  const allowed = await checkEntitlement(ctx.tenantId, key, {
    userId: ctx.userId,
    email: user?.email ?? null,
  });
  if (!allowed) {
    throw new Error(`Entitlement "${key}" is not available for this workspace.`);
  }
  return ctx;
}
