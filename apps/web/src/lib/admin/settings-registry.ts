/**
 * Settings registry (Plan 8A.1).
 * Central registry of all configurable platform settings with types, defaults, and validation.
 */

export type SettingDomain =
  | "tenant_profile"
  | "ai_behavior"
  | "review_policies"
  | "apply_policies"
  | "payment_policies"
  | "communication_policies"
  | "notification_policies"
  | "automation_policies"
  | "mobile_capture_policies"
  | "feature_flags"
  | "branding"
  | "billing"
  | "client_portal"
  | "integrations"
  | "team"
  | "reports"
  | "manager";

export type SettingType = "string" | "number" | "boolean" | "enum" | "json";

export type SettingDefinition = {
  key: string;
  domain: SettingDomain;
  type: SettingType;
  defaultValue: unknown;
  description: string;
  allowedValues?: unknown[];
  min?: number;
  max?: number;
  locked?: boolean;
};

export const SETTINGS_REGISTRY: SettingDefinition[] = [
  // Tenant profile
  { key: "tenant.timezone", domain: "tenant_profile", type: "string", defaultValue: "Europe/Prague", description: "Default timezone for the tenant" },
  { key: "tenant.locale", domain: "tenant_profile", type: "string", defaultValue: "cs-CZ", description: "Locale for date/number formatting" },
  { key: "tenant.language", domain: "tenant_profile", type: "enum", defaultValue: "cs", allowedValues: ["cs", "sk", "en"], description: "Primary language" },
  { key: "tenant.workweek_start", domain: "tenant_profile", type: "enum", defaultValue: "monday", allowedValues: ["monday", "sunday"], description: "First day of work week" },

  // AI behavior
  { key: "ai.assistant_enabled", domain: "ai_behavior", type: "boolean", defaultValue: true, description: "Enable AI assistant globally" },
  { key: "ai.assistant_basic_enabled", domain: "ai_behavior", type: "boolean", defaultValue: true, description: "Enable basic AI assistant features" },
  { key: "ai.assistant_image_intake_enabled", domain: "ai_behavior", type: "boolean", defaultValue: true, description: "Allow AI image intake / vision" },
  { key: "ai.assistant_pdf_read_enabled", domain: "ai_behavior", type: "boolean", defaultValue: false, description: "Allow AI to read PDF content" },
  { key: "ai.assistant_multi_step_enabled", domain: "ai_behavior", type: "boolean", defaultValue: false, description: "Allow multi-step AI workflows" },
  { key: "ai.review_enabled", domain: "ai_behavior", type: "boolean", defaultValue: false, description: "Enable AI contract/document review" },
  { key: "ai.review_export_pdf_enabled", domain: "ai_behavior", type: "boolean", defaultValue: false, description: "Allow exporting AI review as PDF" },
  { key: "ai.max_automation_level", domain: "ai_behavior", type: "enum", defaultValue: "draft_only", allowedValues: ["manual_only", "draft_only", "approval_required", "auto_disabled"], description: "Maximum allowed automation level" },
  { key: "ai.assistant_profile", domain: "ai_behavior", type: "enum", defaultValue: "balanced", allowedValues: ["conservative", "balanced", "proactive"], description: "AI assistant behavior profile" },
  { key: "ai.allow_low_confidence_suggestions", domain: "ai_behavior", type: "boolean", defaultValue: false, description: "Show suggestions below confidence threshold" },
  { key: "ai.allow_apply_suggestions", domain: "ai_behavior", type: "boolean", defaultValue: false, description: "Allow AI to suggest apply actions" },
  { key: "ai.summary_style", domain: "ai_behavior", type: "enum", defaultValue: "concise", allowedValues: ["concise", "detailed", "minimal"], description: "AI summary verbosity" },

  // Review policies
  { key: "review.strictness", domain: "review_policies", type: "enum", defaultValue: "medium", allowedValues: ["low", "medium", "high"], description: "Review strictness level" },
  { key: "review.sla_warning_hours", domain: "review_policies", type: "number", defaultValue: 48, min: 1, max: 720, description: "Hours before SLA warning for review" },
  { key: "review.sla_breach_hours", domain: "review_policies", type: "number", defaultValue: 96, min: 1, max: 720, description: "Hours before SLA breach for review" },
  { key: "review.require_human_for_scanned", domain: "review_policies", type: "boolean", defaultValue: false, description: "Always require human review for scanned docs" },
  { key: "review.auto_assign_to_uploader", domain: "review_policies", type: "boolean", defaultValue: true, description: "Auto-assign review to the uploader" },

  // Apply policies
  { key: "apply.require_manager_approval_threshold", domain: "apply_policies", type: "enum", defaultValue: "high_risk", allowedValues: ["never", "high_risk", "medium_risk", "always"], description: "When manager approval is required for apply" },
  { key: "apply.allow_auto_apply", domain: "apply_policies", type: "boolean", defaultValue: false, description: "Allow fully automatic apply flow" },
  { key: "apply.classification_confidence_threshold", domain: "apply_policies", type: "number", defaultValue: 0.55, min: 0, max: 1, description: "Min classification confidence for apply" },
  { key: "apply.extraction_confidence_threshold", domain: "apply_policies", type: "number", defaultValue: 0.5, min: 0, max: 1, description: "Min extraction confidence for apply" },

  // Payment policies
  { key: "payment.apply_strictness", domain: "payment_policies", type: "enum", defaultValue: "medium", allowedValues: ["low", "medium", "high", "strict"], description: "Payment apply strictness" },
  { key: "payment.require_iban_validation", domain: "payment_policies", type: "boolean", defaultValue: true, description: "Require IBAN/account validation before apply" },
  { key: "payment.allow_missing_vs", domain: "payment_policies", type: "boolean", defaultValue: false, description: "Allow apply without variable symbol" },
  { key: "payment.sla_warning_hours", domain: "payment_policies", type: "number", defaultValue: 24, min: 1, max: 720, description: "Hours before SLA warning for blocked payment" },

  // Communication policies
  { key: "communication.default_tone", domain: "communication_policies", type: "enum", defaultValue: "professional", allowedValues: ["professional", "friendly", "formal"], description: "Default communication tone" },
  { key: "communication.require_approval_for_sends", domain: "communication_policies", type: "boolean", defaultValue: true, description: "Require human approval before sending emails" },
  { key: "communication.max_draft_age_days", domain: "communication_policies", type: "number", defaultValue: 7, min: 1, max: 90, description: "Days before draft expires" },

  // Notification policies
  { key: "notification.push_enabled", domain: "notification_policies", type: "boolean", defaultValue: true, description: "Enable push notifications" },
  { key: "notification.email_digest_enabled", domain: "notification_policies", type: "boolean", defaultValue: false, description: "Enable email digest notifications" },
  { key: "notification.escalation_notify_manager", domain: "notification_policies", type: "boolean", defaultValue: true, description: "Notify manager on escalations" },

  // Automation policies
  { key: "automation.allowed_actions", domain: "automation_policies", type: "json", defaultValue: ["create_task", "create_reminder", "draft_email"], description: "List of allowed automation action types" },
  { key: "automation.require_confirmation", domain: "automation_policies", type: "boolean", defaultValue: true, description: "Require user confirmation for automated actions" },

  // Mobile capture policies
  { key: "mobile.scan_min_quality", domain: "mobile_capture_policies", type: "number", defaultValue: 0.3, min: 0, max: 1, description: "Minimum scan quality score" },
  { key: "mobile.require_ocr_fallback", domain: "mobile_capture_policies", type: "boolean", defaultValue: false, description: "Require OCR fallback for low quality scans" },
  { key: "mobile.allow_low_quality_continue", domain: "mobile_capture_policies", type: "boolean", defaultValue: true, description: "Allow continuing with low quality scan" },

  // Billing
  { key: "billing.grace_period_days", domain: "billing", type: "number", defaultValue: 7, min: 0, max: 30, description: "Days after subscription lapse before features are disabled" },
  { key: "billing.require_active_subscription", domain: "billing", type: "boolean", defaultValue: false, description: "Require active subscription for paid features" },

  // Client portal
  { key: "client_portal.enabled", domain: "client_portal", type: "boolean", defaultValue: true, description: "Enable client portal for this workspace" },
  { key: "client_portal.allow_document_upload", domain: "client_portal", type: "boolean", defaultValue: true, description: "Allow clients to upload documents" },
  { key: "client_portal.allow_messaging", domain: "client_portal", type: "boolean", defaultValue: true, description: "Allow clients to send messages" },
  { key: "client_portal.allow_service_requests", domain: "client_portal", type: "boolean", defaultValue: false, description: "Allow clients to submit service requests" },

  // Integrations
  { key: "integrations.google_calendar_enabled", domain: "integrations", type: "boolean", defaultValue: true, description: "Enable Google Calendar integration" },
  { key: "integrations.google_drive_enabled", domain: "integrations", type: "boolean", defaultValue: true, description: "Enable Google Drive integration" },
  { key: "integrations.google_gmail_enabled", domain: "integrations", type: "boolean", defaultValue: true, description: "Enable Gmail integration" },

  // Team / management (plan-gated; defaults conservative)
  { key: "team.overview_enabled", domain: "team", type: "boolean", defaultValue: false, description: "Enable team overview dashboards" },
  { key: "team.production_enabled", domain: "team", type: "boolean", defaultValue: false, description: "Enable team production insights" },
  { key: "team.goals_events_enabled", domain: "team", type: "boolean", defaultValue: false, description: "Enable team goals and events" },
  { key: "manager.summary_enabled", domain: "manager", type: "boolean", defaultValue: false, description: "Enable manager summary views" },
  { key: "reports.advanced_enabled", domain: "reports", type: "boolean", defaultValue: false, description: "Enable advanced reporting" },
];

export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return SETTINGS_REGISTRY.find((s) => s.key === key);
}

export function getSettingsForDomain(domain: SettingDomain): SettingDefinition[] {
  return SETTINGS_REGISTRY.filter((s) => s.domain === domain);
}

export function validateSettingValue(key: string, value: unknown): { valid: boolean; error?: string } {
  const def = getSettingDefinition(key);
  if (!def) return { valid: false, error: `Unknown setting key: ${key}` };

  if (def.locked) return { valid: false, error: `Setting ${key} is locked and cannot be modified` };

  if (value === null || value === undefined) return { valid: false, error: `Value for ${key} cannot be null` };

  switch (def.type) {
    case "boolean":
      if (typeof value !== "boolean") return { valid: false, error: `${key} must be a boolean` };
      break;
    case "number":
      if (typeof value !== "number" || isNaN(value)) return { valid: false, error: `${key} must be a number` };
      if (def.min !== undefined && value < def.min) return { valid: false, error: `${key} must be >= ${def.min}` };
      if (def.max !== undefined && value > def.max) return { valid: false, error: `${key} must be <= ${def.max}` };
      break;
    case "string":
      if (typeof value !== "string") return { valid: false, error: `${key} must be a string` };
      break;
    case "enum":
      if (!def.allowedValues?.includes(value)) {
        return { valid: false, error: `${key} must be one of: ${def.allowedValues?.join(", ")}` };
      }
      break;
    case "json":
      if (typeof value !== "object") return { valid: false, error: `${key} must be an object or array` };
      break;
  }

  return { valid: true };
}

export function getAllDomains(): SettingDomain[] {
  return [...new Set(SETTINGS_REGISTRY.map((s) => s.domain))];
}

export function getSettingDefault(key: string): unknown {
  return getSettingDefinition(key)?.defaultValue;
}
