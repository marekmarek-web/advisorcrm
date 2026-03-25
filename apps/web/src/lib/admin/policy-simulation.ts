/**
 * Policy simulation (Plan 8B.3).
 * Dry-run policy evaluation for admin preview before committing changes.
 */

import {
  evaluatePolicy,
  getActivePolicies,
  type PolicyType,
  type PolicyDefinition,
  type PolicyOutcome,
  type PolicyEvaluationTrace,
} from "./policy-engine";

export type SimulationResult = {
  outcome: PolicyOutcome | null;
  matchedPolicies: PolicyDefinition[];
  trace: PolicyEvaluationTrace;
  warnings: string[];
  isDryRun: true;
};

export type SimulationOptions = {
  tenantId?: string;
  overridePolicies?: PolicyDefinition[];
};

export function simulatePolicyOutcome(
  policyType: PolicyType,
  testContext: Record<string, unknown>,
  options: SimulationOptions = {}
): SimulationResult {
  const { tenantId, overridePolicies } = options;

  let policies = getActivePolicies(policyType, tenantId);

  if (overridePolicies && overridePolicies.length > 0) {
    const overrideIds = new Set(overridePolicies.map((p) => p.policyId));
    const remaining = policies.filter((p) => !overrideIds.has(p.policyId));
    policies = [...overridePolicies, ...remaining].sort((a, b) => b.priority - a.priority);
  }

  const trace = evaluatePolicy(policyType, testContext, tenantId);

  if (overridePolicies && overridePolicies.length > 0) {
    // Re-evaluate with overrides applied in-place on trace
    trace.evaluatedPolicies = [];
    trace.matchedPolicy = null;
    trace.outcome = null;

    for (const policy of policies) {
      if (!policy.enabled) continue;
      const allMatch = policy.conditions.every((condition) => {
        const actual = testContext[condition.field];
        switch (condition.operator) {
          case "==": return actual === condition.value;
          case "!=": return actual !== condition.value;
          case "in": return Array.isArray(condition.value) && condition.value.includes(actual);
          case "not_in": return Array.isArray(condition.value) && !condition.value.includes(actual);
          case "<": return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
          case ">": return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
          case "<=": return typeof actual === "number" && typeof condition.value === "number" && actual <= condition.value;
          case ">=": return typeof actual === "number" && typeof condition.value === "number" && actual >= condition.value;
          case "contains":
            if (typeof actual === "string" && typeof condition.value === "string") return actual.includes(condition.value);
            if (Array.isArray(actual)) return actual.includes(condition.value);
            return false;
          default: return false;
        }
      }) || policy.conditions.length === 0;

      trace.evaluatedPolicies.push({ policyId: policy.policyId, matched: allMatch });

      if (allMatch && !trace.matchedPolicy) {
        trace.matchedPolicy = policy;
        trace.outcome = policy.outcome;
      }
    }
  }

  const warnings = generateWarnings(testContext, trace);

  return {
    outcome: trace.outcome,
    matchedPolicies: trace.matchedPolicy ? [trace.matchedPolicy] : [],
    trace,
    warnings,
    isDryRun: true,
  };
}

function generateWarnings(
  context: Record<string, unknown>,
  trace: PolicyEvaluationTrace
): string[] {
  const warnings: string[] = [];

  if (trace.outcome === "block_apply") {
    warnings.push("This action will be blocked. Review the conditions to understand why.");
  }

  if (trace.outcome === "require_approval") {
    warnings.push("This action requires approval from a higher authority.");
  }

  if (trace.evaluatedPolicies.length === 0) {
    warnings.push("No policies are active for this policy type. Default behavior will apply.");
  }

  if (context.extractionConfidence !== undefined && (context.extractionConfidence as number) < 0.3) {
    warnings.push("Very low extraction confidence detected. Consider manual review.");
  }

  return warnings;
}

export type BatchSimulationResult = {
  scenarios: { context: Record<string, unknown>; result: SimulationResult }[];
  summary: {
    totalScenarios: number;
    blocked: number;
    requireApproval: number;
    warnings: number;
    allowed: number;
  };
};

export function simulateBatch(
  policyType: PolicyType,
  testContexts: Record<string, unknown>[],
  options: SimulationOptions = {}
): BatchSimulationResult {
  const scenarios = testContexts.map((context) => ({
    context,
    result: simulatePolicyOutcome(policyType, context, options),
  }));

  const summary = {
    totalScenarios: scenarios.length,
    blocked: scenarios.filter((s) => s.result.outcome === "block_apply" || s.result.outcome === "deny").length,
    requireApproval: scenarios.filter((s) => s.result.outcome === "require_approval").length,
    warnings: scenarios.filter((s) => s.result.warnings.length > 0).length,
    allowed: scenarios.filter((s) => s.result.outcome === "allow" || s.result.outcome === null).length,
  };

  return { scenarios, summary };
}
