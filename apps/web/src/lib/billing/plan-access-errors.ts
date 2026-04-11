import type {
  EffectiveAccessSource,
  PlanCapabilityKey,
  PublicPlanKey,
} from "@/lib/billing/plan-catalog";

export type PlanAccessBlockedBy = "plan_tier" | "tenant_setting";

/**
 * Structured payload for UI (upgrade CTA, audit logs). Safe to serialize to JSON.
 */
export type PlanAccessErrorDetail = Readonly<{
  capability: PlanCapabilityKey;
  blockedBy: PlanAccessBlockedBy;
  source: EffectiveAccessSource;
  publicPlanKey: PublicPlanKey | null;
  /** Next tier to unlock this feature (null if top tier or internal admin). */
  upgradeTargetSuggestion: PublicPlanKey | null;
  /** Human-readable product name for CTA (e.g. „Pro“, „Management“). */
  upgradeTargetLabel: string | null;
  /** Current plan label when known. */
  currentPlanLabel: string | null;
}>;

export class PlanAccessError extends Error {
  readonly name = "PlanAccessError";

  readonly detail: PlanAccessErrorDetail;

  constructor(detail: PlanAccessErrorDetail, message?: string) {
    super(message ?? defaultPlanAccessMessage(detail));
    this.detail = detail;
  }

  static is(e: unknown): e is PlanAccessError {
    return e instanceof PlanAccessError;
  }
}

function defaultPlanAccessMessage(d: PlanAccessErrorDetail): string {
  if (d.blockedBy === "tenant_setting") {
    return `Feature disabled for this workspace: ${d.capability}.`;
  }
  const up = d.upgradeTargetLabel ? ` Upgrade to ${d.upgradeTargetLabel}.` : "";
  return `Plan does not include: ${d.capability}.${up}`;
}
