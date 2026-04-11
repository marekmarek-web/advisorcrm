import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  PLAN_CATALOG_BY_PUBLIC_KEY,
  getPublicPlanLabelFromTier,
  type EffectiveAccessContext,
  type PlanCapabilityKey,
} from "@/lib/billing/plan-catalog";
import {
  getUpgradePublicPlanForCapability,
  isPlanCapabilityAllowed,
} from "@/lib/billing/plan-capability-allow";
import { resolveEffectiveAccessContext } from "@/lib/billing/resolve-effective-access";
import { getEffectiveTenantSettingsForWorkspace } from "@/lib/billing/effective-workspace";
import { PlanAccessError, type PlanAccessErrorDetail } from "@/lib/billing/plan-access-errors";

export {
  CAPABILITY_PRIMARY_SETTING,
  getUpgradePublicPlanForCapability,
  isPlanCapabilityAllowed,
} from "@/lib/billing/plan-capability-allow";

function currentPlanLabel(ctx: EffectiveAccessContext): string | null {
  if (ctx.source === "internal_admin") return null;
  if (ctx.source === "trial") return PLAN_CATALOG_BY_PUBLIC_KEY.pro.publicLabel;
  if (ctx.publicPlanKey) return PLAN_CATALOG_BY_PUBLIC_KEY[ctx.publicPlanKey].publicLabel;
  if (ctx.internalTier) return getPublicPlanLabelFromTier(ctx.internalTier);
  if (ctx.source === "restricted") return "Omezený přístup";
  return null;
}

function buildPlanAccessDetail(params: {
  capability: PlanCapabilityKey;
  blockedBy: PlanAccessErrorDetail["blockedBy"];
  ctx: EffectiveAccessContext;
}): PlanAccessErrorDetail {
  const { capability, blockedBy, ctx } = params;
  const upgradeKey =
    blockedBy === "plan_tier" ? getUpgradePublicPlanForCapability(capability) : null;
  const upgradeTargetLabel =
    upgradeKey != null ? PLAN_CATALOG_BY_PUBLIC_KEY[upgradeKey].publicLabel : null;

  return {
    capability,
    blockedBy,
    source: ctx.source,
    publicPlanKey: ctx.publicPlanKey,
    upgradeTargetSuggestion: upgradeKey,
    upgradeTargetLabel,
    currentPlanLabel: currentPlanLabel(ctx),
  };
}

/**
 * Server-side guard: plan matrix × effective tenant settings (narrow-only).
 * Internal admin: always allowed (capabilities + effective settings all on).
 */
export async function assertCapability(params: {
  tenantId: string;
  userId: string;
  email: string | null | undefined;
  capability: PlanCapabilityKey;
  now?: Date;
}): Promise<EffectiveAccessContext> {
  const ctx = await resolveEffectiveAccessContext({
    tenantId: params.tenantId,
    userId: params.userId,
    email: params.email,
    now: params.now,
  });
  const settings = await getEffectiveTenantSettingsForWorkspace({
    tenantId: params.tenantId,
    accessContext: ctx,
  });

  if (isPlanCapabilityAllowed(params.capability, ctx, settings)) {
    return ctx;
  }

  const blockedBy: PlanAccessErrorDetail["blockedBy"] = !ctx.capabilities[params.capability]
    ? "plan_tier"
    : "tenant_setting";

  throw new PlanAccessError(
    buildPlanAccessDetail({ capability: params.capability, blockedBy, ctx }),
  );
}

/** Alias matching product docs naming. */
export const assertCapabilityEffective = assertCapability;

export async function getSessionEmailForUserId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return null;
  return user.email ?? null;
}

/** Integration / API routes: resolve email from current session (must match userId). */
export async function assertPlanCapabilityForIntegration(params: {
  tenantId: string;
  userId: string;
  capability: PlanCapabilityKey;
}): Promise<void> {
  const email = await getSessionEmailForUserId(params.userId);
  await assertCapability({
    tenantId: params.tenantId,
    userId: params.userId,
    email,
    capability: params.capability,
  });
}
