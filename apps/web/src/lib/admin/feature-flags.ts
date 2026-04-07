/**
 * Feature flags (Plan 8C.2).
 * System for managing feature rollouts with various scopes and per-tenant overrides.
 */

export type RolloutScope = "global" | "tenant" | "team" | "user" | "internal";

export type FeatureFlag = {
  code: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  rolloutScope: RolloutScope;
};

export const FEATURE_FLAGS: FeatureFlag[] = [
  {
    code: "adobe_preprocess_v2",
    label: "Adobe Preprocess v2",
    description: "New Adobe document preprocessing pipeline with improved quality detection",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "new_classifier",
    label: "New Document Classifier",
    description: "Updated ML-based document classification model with higher accuracy",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "payment_extraction_v2",
    label: "Payment Extraction v2",
    description: "Improved payment instruction extraction with CZK/SEPA account parsing",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "mobile_capture_v2",
    label: "Mobile Capture v2",
    description: "Enhanced mobile document scanning with real-time quality feedback",
    defaultEnabled: true,
    rolloutScope: "global",
  },
  {
    code: "automation_suggestions",
    label: "Automation Suggestions",
    description: "AI-powered suggestions for automating repetitive workflows",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "manager_dashboards",
    label: "Manager Dashboards",
    description: "Advanced team management analytics and dashboards for managers",
    defaultEnabled: true,
    rolloutScope: "tenant",
  },
  {
    code: "portal_payments_module",
    label: "Portal Payments Module",
    description: "Client portal payments section with payment setup management",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "assistant_apply_suggest",
    label: "Assistant Apply Suggestions",
    description: "AI assistant can propose apply actions for reviewed documents",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "analytics_snapshots",
    label: "Analytics Snapshots",
    description: "Daily analytics snapshot cron for historical tracking",
    defaultEnabled: true,
    rolloutScope: "global",
  },
  {
    code: "policy_engine",
    label: "Policy Engine",
    description: "Configurable policy engine for workflow decisions",
    defaultEnabled: false,
    rolloutScope: "internal",
  },
  // --- Image Intake Phase 7 flags ---
  {
    code: "image_intake_enabled",
    label: "Image Intake",
    description: "AI Photo / Image Intake capability in assistant chat",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "image_intake_combined_multimodal",
    label: "Image Intake: Combined Multi-Image Pass",
    description: "Send multiple related images in one vision call for grouped thread understanding",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "image_intake_intent_assist",
    label: "Image Intake: Intent Change Model Assist",
    description: "Optional model-assisted disambiguation of ambiguous intent changes",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "image_intake_handoff_queue",
    label: "Image Intake: AI Review Handoff Queue Submit",
    description: "Submit AI Review handoff payload to review processing queue after advisor confirm",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
  {
    code: "image_intake_cross_session_persistence",
    label: "Image Intake: Cross-Session Persistence",
    description: "Persist thread artifacts to DB for cross-session reconstruction after server restarts",
    defaultEnabled: false,
    rolloutScope: "tenant",
  },
];

const tenantOverrides = new Map<string, Map<string, boolean>>();
const globalOverrides = new Map<string, boolean>();

// ---------------------------------------------------------------------------
// Image Intake admin controls (Phase 7 — runtime control surface)
// ---------------------------------------------------------------------------

/** Returns image-intake admin flag states for a given tenant. Defined after isFeatureEnabled. */
export function getImageIntakeAdminFlags(tenantId: string): {
  enabled: boolean;
  combinedMultimodal: boolean;
  intentAssist: boolean;
  handoffQueueSubmit: boolean;
  crossSessionPersistence: boolean;
} {
  return {
    enabled: isFeatureEnabled("image_intake_enabled", tenantId),
    combinedMultimodal: isFeatureEnabled("image_intake_combined_multimodal", tenantId),
    intentAssist: isFeatureEnabled("image_intake_intent_assist", tenantId),
    handoffQueueSubmit: isFeatureEnabled("image_intake_handoff_queue", tenantId),
    crossSessionPersistence: isFeatureEnabled("image_intake_cross_session_persistence", tenantId),
  };
}

export function getFlagDefinition(flagCode: string): FeatureFlag | undefined {
  return FEATURE_FLAGS.find((f) => f.code === flagCode);
}

export function isFeatureEnabled(
  flagCode: string,
  tenantId?: string,
  _userId?: string
): boolean {
  const flag = getFlagDefinition(flagCode);
  if (!flag) return false;

  // Internal flags are only for internal use - disable for tenants by default
  if (flag.rolloutScope === "internal") {
    if (tenantId) {
      const tenantOv = tenantOverrides.get(tenantId)?.get(flagCode);
      return tenantOv ?? false;
    }
    return false;
  }

  // Check global override first
  if (globalOverrides.has(flagCode)) {
    return globalOverrides.get(flagCode)!;
  }

  // Check tenant-level override
  if (tenantId && tenantOverrides.has(tenantId)) {
    const tenantOv = tenantOverrides.get(tenantId)?.get(flagCode);
    if (tenantOv !== undefined) return tenantOv;
  }

  // Global scope flags use the default value regardless of tenant
  if (flag.rolloutScope === "global") {
    return flag.defaultEnabled;
  }

  return flag.defaultEnabled;
}

export function setFeatureOverride(
  flagCode: string,
  tenantId: string | null,
  enabled: boolean
): void {
  if (tenantId === null) {
    globalOverrides.set(flagCode, enabled);
    return;
  }
  if (!tenantOverrides.has(tenantId)) {
    tenantOverrides.set(tenantId, new Map());
  }
  tenantOverrides.get(tenantId)!.set(flagCode, enabled);
}

export function clearFeatureOverride(flagCode: string, tenantId: string | null): void {
  if (tenantId === null) {
    globalOverrides.delete(flagCode);
    return;
  }
  tenantOverrides.get(tenantId)?.delete(flagCode);
}

export type FlagState = {
  code: string;
  label: string;
  enabled: boolean;
  source: "global_override" | "tenant_override" | "default";
  rolloutScope: RolloutScope;
};

export function getAllFlagStates(tenantId?: string): FlagState[] {
  return FEATURE_FLAGS.map((flag) => {
    let source: FlagState["source"] = "default";
    let enabled = flag.defaultEnabled;

    if (globalOverrides.has(flag.code)) {
      enabled = globalOverrides.get(flag.code)!;
      source = "global_override";
    } else if (tenantId && tenantOverrides.get(tenantId)?.has(flag.code)) {
      enabled = tenantOverrides.get(tenantId)!.get(flag.code)!;
      source = "tenant_override";
    }

    if (flag.rolloutScope === "internal" && source === "default") {
      enabled = false;
    }

    return {
      code: flag.code,
      label: flag.label,
      enabled,
      source,
      rolloutScope: flag.rolloutScope,
    };
  });
}
