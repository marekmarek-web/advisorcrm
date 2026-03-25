/**
 * Policy engine (Plan 8B.1).
 * Evaluates rule-based policies for workflow decisions.
 */

export type PolicyType =
  | "classification"
  | "review"
  | "payment_apply"
  | "crm_apply"
  | "communication_send"
  | "escalation"
  | "automation"
  | "assistant"
  | "approval";

export type PolicyOutcome =
  | "review_required"
  | "block_apply"
  | "require_approval"
  | "allow_draft_only"
  | "allow_send"
  | "disable_automation"
  | "escalate"
  | "show_warning"
  | "allow"
  | "deny";

export type ConditionOperator = "==" | "!=" | "in" | "not_in" | "<" | ">" | "<=" | ">=" | "contains";

export type PolicyCondition = {
  field: string;
  operator: ConditionOperator;
  value: unknown;
};

export type PolicyScope = "global" | "tenant" | "team" | "user";

export type PolicyDefinition = {
  policyId: string;
  policyType: PolicyType;
  scope: PolicyScope;
  conditions: PolicyCondition[];
  outcome: PolicyOutcome;
  priority: number;
  enabled: boolean;
  version: number;
  description?: string;
};

export type PolicyEvaluationTrace = {
  evaluatedPolicies: { policyId: string; matched: boolean; reason?: string }[];
  matchedPolicy: PolicyDefinition | null;
  outcome: PolicyOutcome | null;
  inputContext: Record<string, unknown>;
  timestamp: string;
};

function evaluateCondition(condition: PolicyCondition, context: Record<string, unknown>): boolean {
  const actual = context[condition.field];
  const expected = condition.value;

  switch (condition.operator) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case "<":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case ">":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "<=":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case ">=":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.includes(expected);
      }
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      return false;
    default:
      return false;
  }
}

function evaluatePolicyConditions(policy: PolicyDefinition, context: Record<string, unknown>): { matched: boolean; reason?: string } {
  if (policy.conditions.length === 0) {
    return { matched: true, reason: "no conditions (catch-all)" };
  }

  for (const condition of policy.conditions) {
    if (!evaluateCondition(condition, context)) {
      return {
        matched: false,
        reason: `condition failed: ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)} (actual: ${JSON.stringify(context[condition.field])})`,
      };
    }
  }

  return { matched: true };
}

const DEFAULT_POLICIES: PolicyDefinition[] = [
  // Review policies
  {
    policyId: "default-review-low-confidence",
    policyType: "review",
    scope: "global",
    conditions: [{ field: "extractionConfidence", operator: "<", value: 0.5 }],
    outcome: "review_required",
    priority: 100,
    enabled: true,
    version: 1,
    description: "Require review for low-confidence extractions",
  },
  {
    policyId: "default-review-scanned",
    policyType: "review",
    scope: "global",
    conditions: [{ field: "isScanned", operator: "==", value: true }, { field: "ocrConfidence", operator: "<", value: 0.7 }],
    outcome: "review_required",
    priority: 90,
    enabled: true,
    version: 1,
    description: "Require review for low-quality OCR scans",
  },

  // Apply policies
  {
    policyId: "default-apply-block-very-low-confidence",
    policyType: "crm_apply",
    scope: "global",
    conditions: [{ field: "extractionConfidence", operator: "<", value: 0.3 }],
    outcome: "block_apply",
    priority: 200,
    enabled: true,
    version: 1,
    description: "Block apply for very low confidence extractions",
  },
  {
    policyId: "default-apply-require-approval-high-risk",
    policyType: "crm_apply",
    scope: "global",
    conditions: [{ field: "riskLevel", operator: "==", value: "high" }],
    outcome: "require_approval",
    priority: 150,
    enabled: true,
    version: 1,
    description: "Require approval for high risk apply operations",
  },

  // Payment apply policies
  {
    policyId: "default-payment-block-missing-iban",
    policyType: "payment_apply",
    scope: "global",
    conditions: [{ field: "ibanValid", operator: "==", value: false }],
    outcome: "block_apply",
    priority: 200,
    enabled: true,
    version: 1,
    description: "Block payment apply when IBAN is invalid",
  },
  {
    policyId: "default-payment-warn-missing-vs",
    policyType: "payment_apply",
    scope: "global",
    conditions: [{ field: "hasVariableSymbol", operator: "==", value: false }],
    outcome: "show_warning",
    priority: 50,
    enabled: true,
    version: 1,
    description: "Show warning when variable symbol is missing",
  },

  // Communication send policies
  {
    policyId: "default-comm-require-approval",
    policyType: "communication_send",
    scope: "global",
    conditions: [],
    outcome: "require_approval",
    priority: 10,
    enabled: true,
    version: 1,
    description: "Always require approval before sending communications",
  },

  // Automation policies
  {
    policyId: "default-automation-allow-draft-only",
    policyType: "automation",
    scope: "global",
    conditions: [],
    outcome: "allow_draft_only",
    priority: 10,
    enabled: true,
    version: 1,
    description: "Default: automation can create drafts only",
  },
];

const tenantPoliciesCache = new Map<string, PolicyDefinition[]>();

export function getDefaultPolicies(policyType?: PolicyType): PolicyDefinition[] {
  if (!policyType) return [...DEFAULT_POLICIES];
  return DEFAULT_POLICIES.filter((p) => p.policyType === policyType);
}

export function registerTenantPolicies(tenantId: string, policies: PolicyDefinition[]): void {
  tenantPoliciesCache.set(tenantId, policies);
}

export function getActivePolicies(policyType: PolicyType, tenantId?: string): PolicyDefinition[] {
  const base = DEFAULT_POLICIES.filter((p) => p.policyType === policyType && p.enabled);
  if (!tenantId) return [...base].sort((a, b) => b.priority - a.priority);

  const tenantPolicies = (tenantPoliciesCache.get(tenantId) ?? [])
    .filter((p) => p.policyType === policyType && p.enabled);

  return [...tenantPolicies, ...base].sort((a, b) => b.priority - a.priority);
}

export function evaluatePolicy(
  policyType: PolicyType,
  context: Record<string, unknown>,
  tenantId?: string
): PolicyEvaluationTrace {
  const policies = getActivePolicies(policyType, tenantId);
  const trace: PolicyEvaluationTrace = {
    evaluatedPolicies: [],
    matchedPolicy: null,
    outcome: null,
    inputContext: context,
    timestamp: new Date().toISOString(),
  };

  for (const policy of policies) {
    const result = evaluatePolicyConditions(policy, context);
    trace.evaluatedPolicies.push({
      policyId: policy.policyId,
      matched: result.matched,
      reason: result.reason,
    });

    if (result.matched && trace.matchedPolicy === null) {
      trace.matchedPolicy = policy;
      trace.outcome = policy.outcome;
    }
  }

  return trace;
}

export function evaluatePolicyOutcome(
  policyType: PolicyType,
  context: Record<string, unknown>,
  tenantId?: string
): PolicyOutcome | null {
  const trace = evaluatePolicy(policyType, context, tenantId);
  return trace.outcome;
}
