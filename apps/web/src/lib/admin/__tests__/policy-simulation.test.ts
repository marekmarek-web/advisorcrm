import { describe, it, expect } from "vitest";
import { simulatePolicyOutcome, simulateBatch } from "../policy-simulation";
import type { PolicyDefinition } from "../policy-engine";

describe("policy-simulation", () => {
  describe("simulatePolicyOutcome", () => {
    it("returns dry run flag", () => {
      const result = simulatePolicyOutcome("review", { extractionConfidence: 0.4 });
      expect(result.isDryRun).toBe(true);
    });

    it("returns correct outcome for review", () => {
      const result = simulatePolicyOutcome("review", { extractionConfidence: 0.3 });
      expect(result.outcome).toBe("review_required");
    });

    it("returns trace with evaluated policies", () => {
      const result = simulatePolicyOutcome("payment_apply", { ibanValid: false });
      expect(result.trace.evaluatedPolicies.length).toBeGreaterThanOrEqual(1);
    });

    it("includes matched policy in results", () => {
      const result = simulatePolicyOutcome("payment_apply", { ibanValid: false });
      expect(result.matchedPolicies.length).toBe(1);
      expect(result.matchedPolicies[0].outcome).toBe("block_apply");
    });

    it("returns no matched policies when nothing matches", () => {
      const result = simulatePolicyOutcome("classification", { someField: "value" });
      expect(result.matchedPolicies.length).toBe(0);
      expect(result.outcome).toBeNull();
    });

    it("generates warnings for block_apply", () => {
      const result = simulatePolicyOutcome("payment_apply", { ibanValid: false });
      expect(result.warnings.some((w) => w.includes("blocked"))).toBe(true);
    });

    it("generates warnings for require_approval", () => {
      const result = simulatePolicyOutcome("crm_apply", { extractionConfidence: 0.8, riskLevel: "high" });
      expect(result.warnings.some((w) => w.includes("approval"))).toBe(true);
    });

    it("warns about very low confidence", () => {
      const result = simulatePolicyOutcome("review", { extractionConfidence: 0.1 });
      expect(result.warnings.some((w) => w.includes("confidence"))).toBe(true);
    });
  });

  describe("simulatePolicyOutcome with overrides", () => {
    it("uses override policy instead of default", () => {
      const override: PolicyDefinition = {
        policyId: "sim-override-test",
        policyType: "review",
        scope: "tenant",
        conditions: [],
        outcome: "allow",
        priority: 999,
        enabled: true,
        version: 1,
      };
      const result = simulatePolicyOutcome("review", { extractionConfidence: 0.3 }, {
        overridePolicies: [override],
      });
      expect(result.outcome).toBe("allow");
    });
  });

  describe("simulateBatch", () => {
    it("returns results for all scenarios", () => {
      const contexts = [
        { ibanValid: false },
        { ibanValid: true, hasVariableSymbol: false },
        { ibanValid: true, hasVariableSymbol: true },
      ];
      const batch = simulateBatch("payment_apply", contexts);
      expect(batch.scenarios.length).toBe(3);
    });

    it("counts blocked scenarios correctly", () => {
      const contexts = [
        { ibanValid: false },
        { ibanValid: false },
        { ibanValid: true, hasVariableSymbol: true },
      ];
      const batch = simulateBatch("payment_apply", contexts);
      expect(batch.summary.blocked).toBe(2);
    });

    it("provides summary stats", () => {
      const contexts = [
        { extractionConfidence: 0.3 },
        { extractionConfidence: 0.9 },
      ];
      const batch = simulateBatch("review", contexts);
      expect(batch.summary.totalScenarios).toBe(2);
    });
  });
});
