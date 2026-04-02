/**
 * Phase 2H: release gate — quality thresholds and acceptance criteria
 * for Phase 2 of the AI assistant rebuild.
 *
 * These thresholds are enforced in tests and can be wired into CI.
 */

import type { AssistantEvalRunSummary, AssistantEvalDomain } from "./assistant-eval-types";

export type ReleaseGateThresholds = {
  minEvalPassRate: number;
  minDomainPassRate: number;
  requiredDomains: AssistantEvalDomain[];
  zeroToleranceRedFlags: string[];
  minRegressionFixtureCount: number;
  minGoldenScenarioCount: number;
};

export const PHASE_2_THRESHOLDS: ReleaseGateThresholds = {
  minEvalPassRate: 0.9,
  minDomainPassRate: 0.8,
  requiredDomains: ["mortgage", "investment", "insurance", "documents", "client_portal", "safety"],
  zeroToleranceRedFlags: [
    "wrong_client_write",
    "fake_confirmation",
    "duplicate_create",
    "broken_context_lock",
    "incomplete_partial_failure",
  ],
  minRegressionFixtureCount: 10,
  minGoldenScenarioCount: 12,
};

export type GateCheckResult = {
  passed: boolean;
  checks: GateCheck[];
};

export type GateCheck = {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  blocking: boolean;
};

export function evaluateReleaseGate(
  evalSummary: AssistantEvalRunSummary,
  regressionFixtureCount: number,
  goldenScenarioCount: number,
  redFlagResults: { flag: string; allPassed: boolean }[],
  thresholds: ReleaseGateThresholds = PHASE_2_THRESHOLDS,
): GateCheckResult {
  const checks: GateCheck[] = [];

  const overallPassRate = evalSummary.totalScenarios > 0
    ? evalSummary.passed / evalSummary.totalScenarios
    : 0;
  checks.push({
    name: "eval_pass_rate",
    passed: overallPassRate >= thresholds.minEvalPassRate,
    expected: `>= ${(thresholds.minEvalPassRate * 100).toFixed(0)}%`,
    actual: `${(overallPassRate * 100).toFixed(1)}%`,
    blocking: true,
  });

  for (const domain of thresholds.requiredDomains) {
    const stats = evalSummary.byDomain[domain];
    const rate = stats && stats.total > 0 ? stats.passed / stats.total : 0;
    const covered = stats ? stats.total > 0 : false;
    checks.push({
      name: `domain_coverage_${domain}`,
      passed: covered,
      expected: `>= 1 scenario`,
      actual: `${stats?.total ?? 0} scenarios`,
      blocking: true,
    });
    if (covered) {
      checks.push({
        name: `domain_pass_rate_${domain}`,
        passed: rate >= thresholds.minDomainPassRate,
        expected: `>= ${(thresholds.minDomainPassRate * 100).toFixed(0)}%`,
        actual: `${(rate * 100).toFixed(1)}%`,
        blocking: true,
      });
    }
  }

  for (const flag of thresholds.zeroToleranceRedFlags) {
    const result = redFlagResults.find(r => r.flag === flag);
    checks.push({
      name: `red_flag_${flag}`,
      passed: result?.allPassed ?? false,
      expected: "all regression tests pass",
      actual: result ? (result.allPassed ? "all pass" : "FAILING") : "not tested",
      blocking: true,
    });
  }

  checks.push({
    name: "min_regression_fixtures",
    passed: regressionFixtureCount >= thresholds.minRegressionFixtureCount,
    expected: `>= ${thresholds.minRegressionFixtureCount}`,
    actual: `${regressionFixtureCount}`,
    blocking: false,
  });

  checks.push({
    name: "min_golden_scenarios",
    passed: goldenScenarioCount >= thresholds.minGoldenScenarioCount,
    expected: `>= ${thresholds.minGoldenScenarioCount}`,
    actual: `${goldenScenarioCount}`,
    blocking: false,
  });

  const allBlockingPassed = checks.filter(c => c.blocking).every(c => c.passed);
  const allPassed = checks.every(c => c.passed);

  return {
    passed: allBlockingPassed,
    checks,
  };
}

export function formatGateReport(result: GateCheckResult): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════");
  lines.push("  PHASE 2 RELEASE GATE REPORT");
  lines.push("═══════════════════════════════════════════");
  lines.push(`  Overall: ${result.passed ? "✅ PASS" : "❌ FAIL"}`);
  lines.push("");

  for (const c of result.checks) {
    const icon = c.passed ? "✅" : c.blocking ? "❌" : "⚠️";
    const tag = c.blocking ? "[BLOCKING]" : "[advisory]";
    lines.push(`  ${icon} ${c.name} ${tag}`);
    lines.push(`     expected: ${c.expected}`);
    lines.push(`     actual:   ${c.actual}`);
  }

  lines.push("");
  lines.push(`  Total checks: ${result.checks.length}`);
  lines.push(`  Passed: ${result.checks.filter(c => c.passed).length}`);
  lines.push(`  Failed: ${result.checks.filter(c => !c.passed).length}`);
  lines.push("═══════════════════════════════════════════");

  return lines.join("\n");
}
