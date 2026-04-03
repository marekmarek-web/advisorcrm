/**
 * Phase 2E: eval harness types for assistant golden scenarios.
 * Domain-specific conversation evals that verify intent extraction,
 * entity resolution, plan building, and execution outcomes.
 */

import type { CanonicalIntentType, ProductDomain, WriteActionType, ExecutionStepStatus } from "./assistant-domain-model";

export type AssistantEvalDomain =
  | "mortgage"
  | "investment"
  | "insurance"
  | "documents"
  | "client_portal"
  | "safety"
  | "write_workflows";

export type GoldenConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ExpectedIntentAssertion = {
  intentType: CanonicalIntentType;
  productDomain?: ProductDomain | null;
  targetClientRef?: string;
  switchClient?: boolean;
  requiresConfirmation?: boolean;
};

export type ExpectedPlanAssertion = {
  minSteps: number;
  maxSteps: number;
  expectedActions: WriteActionType[];
  forbiddenActions?: WriteActionType[];
  expectedContactIdPresent?: boolean;
  expectedStatus?: "awaiting_confirmation" | "draft" | "completed";
};

export type ExpectedSafetyAssertion = {
  mustBlock?: boolean;
  mustWarnCrossClient?: boolean;
  mustWarnAmbiguous?: boolean;
  mustNotWriteWithoutClient?: boolean;
};

export type GoldenScenario = {
  id: string;
  domain: AssistantEvalDomain;
  name: string;
  description: string;
  turns: GoldenConversationTurn[];
  expectedIntent: ExpectedIntentAssertion;
  expectedPlan?: ExpectedPlanAssertion;
  expectedSafety?: ExpectedSafetyAssertion;
  tags: string[];
};

export type EvalStepResult = {
  stepName: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  message: string;
};

export type ScenarioEvalResult = {
  scenarioId: string;
  domain: AssistantEvalDomain;
  name: string;
  passed: boolean;
  steps: EvalStepResult[];
  durationMs: number;
};

export type AssistantEvalRunSummary = {
  runId: string;
  runAt: string;
  totalScenarios: number;
  passed: number;
  failed: number;
  byDomain: Record<AssistantEvalDomain, { total: number; passed: number; failed: number }>;
  results: ScenarioEvalResult[];
};

export function emptyDomainStats(): Record<AssistantEvalDomain, { total: number; passed: number; failed: number }> {
  const domains: AssistantEvalDomain[] = ["mortgage", "investment", "insurance", "documents", "client_portal", "safety", "write_workflows"];
  const stats = {} as Record<AssistantEvalDomain, { total: number; passed: number; failed: number }>;
  for (const d of domains) stats[d] = { total: 0, passed: 0, failed: 0 };
  return stats;
}
