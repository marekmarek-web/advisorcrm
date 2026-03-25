/**
 * AI assistant governance (Plan 8C.1).
 * Tenant-level controls on AI assistant capabilities layered on top of role-based permissions.
 */

export type AssistantCapability =
  | "dashboard_summary"
  | "chat"
  | "email_drafting"
  | "task_drafting"
  | "payment_explanation"
  | "review_explanation"
  | "suggested_actions"
  | "automation_recommendations";

export type MaxActionSeverity = "none" | "read_only" | "draft_only" | "full";

export type AssistantProfile = {
  profileId: string;
  name: string;
  capabilities: AssistantCapability[];
  maxActionSeverity: MaxActionSeverity;
  canProposeApply: boolean;
  canCreateDraftsAuto: boolean;
  canSurfaceLowConfidence: boolean;
  description: string;
};

export const DEFAULT_PROFILES: Record<string, AssistantProfile> = {
  conservative: {
    profileId: "conservative",
    name: "Conservative",
    capabilities: ["dashboard_summary", "review_explanation", "payment_explanation"],
    maxActionSeverity: "read_only",
    canProposeApply: false,
    canCreateDraftsAuto: false,
    canSurfaceLowConfidence: false,
    description: "Minimal AI assistance, human-driven workflow",
  },
  balanced: {
    profileId: "balanced",
    name: "Balanced",
    capabilities: [
      "dashboard_summary",
      "chat",
      "email_drafting",
      "task_drafting",
      "review_explanation",
      "payment_explanation",
      "suggested_actions",
    ],
    maxActionSeverity: "draft_only",
    canProposeApply: false,
    canCreateDraftsAuto: true,
    canSurfaceLowConfidence: false,
    description: "Standard AI assistance with draft creation, human approval required",
  },
  proactive: {
    profileId: "proactive",
    name: "Proactive",
    capabilities: [
      "dashboard_summary",
      "chat",
      "email_drafting",
      "task_drafting",
      "review_explanation",
      "payment_explanation",
      "suggested_actions",
      "automation_recommendations",
    ],
    maxActionSeverity: "full",
    canProposeApply: true,
    canCreateDraftsAuto: true,
    canSurfaceLowConfidence: true,
    description: "Full AI assistance including proactive suggestions and apply proposals",
  },
};

const tenantProfileCache = new Map<string, string>();
const tenantCapabilityOverrides = new Map<string, Map<AssistantCapability, boolean>>();

export function setTenantAssistantProfile(tenantId: string, profileId: string): void {
  tenantProfileCache.set(tenantId, profileId);
}

export function setCapabilityOverride(
  tenantId: string,
  capability: AssistantCapability,
  enabled: boolean
): void {
  if (!tenantCapabilityOverrides.has(tenantId)) {
    tenantCapabilityOverrides.set(tenantId, new Map());
  }
  tenantCapabilityOverrides.get(tenantId)!.set(capability, enabled);
}

export function clearCapabilityOverride(tenantId: string, capability: AssistantCapability): void {
  tenantCapabilityOverrides.get(tenantId)?.delete(capability);
}

export function getEffectiveAssistantProfile(tenantId?: string): AssistantProfile {
  if (!tenantId) return DEFAULT_PROFILES["balanced"]!;

  const profileId = tenantProfileCache.get(tenantId) ?? "balanced";
  return DEFAULT_PROFILES[profileId] ?? DEFAULT_PROFILES["balanced"]!;
}

export function isCapabilityEnabled(
  tenantId: string | undefined,
  capability: AssistantCapability
): boolean {
  const profile = getEffectiveAssistantProfile(tenantId);

  if (tenantId) {
    const overrides = tenantCapabilityOverrides.get(tenantId);
    if (overrides?.has(capability)) {
      return overrides.get(capability)!;
    }
  }

  return profile.capabilities.includes(capability);
}

export function getEnabledCapabilities(tenantId: string | undefined): AssistantCapability[] {
  const profile = getEffectiveAssistantProfile(tenantId);
  const allCapabilities: AssistantCapability[] = [
    "dashboard_summary",
    "chat",
    "email_drafting",
    "task_drafting",
    "payment_explanation",
    "review_explanation",
    "suggested_actions",
    "automation_recommendations",
  ];

  return allCapabilities.filter((cap) => isCapabilityEnabled(tenantId, cap));
}

export type DeterministicSummary = {
  type: "deterministic";
  message: string;
  details: string[];
};

export function buildDeterministicSummary(context: {
  reviewCount?: number;
  blockedCount?: number;
  taskCount?: number;
}): DeterministicSummary {
  const details: string[] = [];

  if (context.reviewCount !== undefined) {
    details.push(`${context.reviewCount} review(s) pending`);
  }
  if (context.blockedCount !== undefined) {
    details.push(`${context.blockedCount} item(s) blocked`);
  }
  if (context.taskCount !== undefined) {
    details.push(`${context.taskCount} task(s) outstanding`);
  }

  return {
    type: "deterministic",
    message: details.length > 0 ? details.join(", ") : "No outstanding items",
    details,
  };
}
