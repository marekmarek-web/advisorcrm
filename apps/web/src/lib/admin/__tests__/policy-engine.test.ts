import { describe, it, expect } from "vitest";
import {
  evaluatePolicy,
  evaluatePolicyOutcome,
  getDefaultPolicies,
  getActivePolicies,
  registerTenantPolicies,
  type PolicyDefinition,
} from "../policy-engine";

describe("policy-engine", () => {
  describe("getDefaultPolicies", () => {
    it("returns all default policies", () => {
      const policies = getDefaultPolicies();
      expect(policies.length).toBeGreaterThanOrEqual(5);
    });

    it("filters by policy type", () => {
      const reviewPolicies = getDefaultPolicies("review");
      expect(reviewPolicies.length).toBeGreaterThanOrEqual(1);
      for (const p of reviewPolicies) {
        expect(p.policyType).toBe("review");
      }
    });
  });

  describe("evaluatePolicy - review", () => {
    it("returns review_required for low confidence", () => {
      const trace = evaluatePolicy("review", { extractionConfidence: 0.3 });
      expect(trace.outcome).toBe("review_required");
      expect(trace.matchedPolicy).not.toBeNull();
    });

    it("does NOT require review for high confidence", () => {
      const trace = evaluatePolicy("review", { extractionConfidence: 0.9 });
      // No matching review policy for high confidence in defaults
      expect(trace.outcome).not.toBe("review_required");
    });

    it("requires review for scanned doc with low OCR", () => {
      const trace = evaluatePolicy("review", { isScanned: true, ocrConfidence: 0.5 });
      expect(trace.outcome).toBe("review_required");
    });

    it("does NOT require review for scanned doc with high OCR", () => {
      const trace = evaluatePolicy("review", { isScanned: true, ocrConfidence: 0.95 });
      expect(trace.outcome).not.toBe("review_required");
    });
  });

  describe("evaluatePolicy - payment_apply", () => {
    it("blocks apply when IBAN is invalid", () => {
      const trace = evaluatePolicy("payment_apply", { ibanValid: false });
      expect(trace.outcome).toBe("block_apply");
    });

    it("shows warning when variable symbol is missing", () => {
      const trace = evaluatePolicy("payment_apply", { ibanValid: true, hasVariableSymbol: false });
      expect(trace.outcome).toBe("show_warning");
    });

    it("allows apply when IBAN valid and VS present", () => {
      const trace = evaluatePolicy("payment_apply", { ibanValid: true, hasVariableSymbol: true });
      // No blocking conditions match
      expect(trace.outcome).not.toBe("block_apply");
    });
  });

  describe("evaluatePolicy - crm_apply", () => {
    it("blocks apply for very low confidence", () => {
      const trace = evaluatePolicy("crm_apply", { extractionConfidence: 0.1 });
      expect(trace.outcome).toBe("block_apply");
    });

    it("requires approval for high risk", () => {
      const trace = evaluatePolicy("crm_apply", { extractionConfidence: 0.8, riskLevel: "high" });
      expect(trace.outcome).toBe("require_approval");
    });
  });

  describe("evaluatePolicy - automation", () => {
    it("returns allow_draft_only by default", () => {
      const trace = evaluatePolicy("automation", {});
      expect(trace.outcome).toBe("allow_draft_only");
    });
  });

  describe("evaluatePolicy trace", () => {
    it("includes timestamp", () => {
      const trace = evaluatePolicy("review", { extractionConfidence: 0.4 });
      expect(trace.timestamp).toBeTruthy();
    });

    it("includes input context", () => {
      const ctx = { extractionConfidence: 0.4 };
      const trace = evaluatePolicy("review", ctx);
      expect(trace.inputContext).toEqual(ctx);
    });

    it("lists all evaluated policies", () => {
      const trace = evaluatePolicy("review", { extractionConfidence: 0.4 });
      expect(trace.evaluatedPolicies.length).toBeGreaterThanOrEqual(1);
    });

    it("records matched policy", () => {
      const trace = evaluatePolicy("review", { extractionConfidence: 0.3 });
      expect(trace.matchedPolicy).not.toBeNull();
      expect(trace.matchedPolicy?.policyId).toBeTruthy();
    });
  });

  describe("tenant policy overrides", () => {
    it("tenant policy takes priority over default", () => {
      const tenantId = "tenant-policy-test";
      const customPolicy: PolicyDefinition = {
        policyId: "custom-review-tenant",
        policyType: "review",
        scope: "tenant",
        conditions: [{ field: "extractionConfidence", operator: "<", value: 0.8 }],
        outcome: "require_approval",
        priority: 500,
        enabled: true,
        version: 1,
      };

      registerTenantPolicies(tenantId, [customPolicy]);

      const trace = evaluatePolicy("review", { extractionConfidence: 0.7 }, tenantId);
      expect(trace.outcome).toBe("require_approval");
      expect(trace.matchedPolicy?.policyId).toBe("custom-review-tenant");
    });
  });

  describe("evaluatePolicyOutcome", () => {
    it("returns outcome directly", () => {
      const outcome = evaluatePolicyOutcome("payment_apply", { ibanValid: false });
      expect(outcome).toBe("block_apply");
    });

    it("returns null when no policies match", () => {
      const outcome = evaluatePolicyOutcome("classification", {});
      expect(outcome).toBeNull();
    });
  });

  describe("condition operators", () => {
    const tenantId = "op-test-tenant";

    it("handles 'in' operator", () => {
      const p: PolicyDefinition = {
        policyId: "in-op-test",
        policyType: "escalation",
        scope: "tenant",
        conditions: [{ field: "status", operator: "in", value: ["pending", "overdue"] }],
        outcome: "escalate",
        priority: 100,
        enabled: true,
        version: 1,
      };
      registerTenantPolicies(tenantId + "-in", [p]);
      const trace = evaluatePolicy("escalation", { status: "overdue" }, tenantId + "-in");
      expect(trace.outcome).toBe("escalate");
    });

    it("handles 'not_in' operator", () => {
      const p: PolicyDefinition = {
        policyId: "not-in-op-test",
        policyType: "escalation",
        scope: "tenant",
        conditions: [{ field: "status", operator: "not_in", value: ["completed", "cancelled"] }],
        outcome: "escalate",
        priority: 100,
        enabled: true,
        version: 1,
      };
      registerTenantPolicies(tenantId + "-not-in", [p]);
      const trace = evaluatePolicy("escalation", { status: "pending" }, tenantId + "-not-in");
      expect(trace.outcome).toBe("escalate");
    });

    it("handles 'contains' operator for string", () => {
      const p: PolicyDefinition = {
        policyId: "contains-test",
        policyType: "escalation",
        scope: "tenant",
        conditions: [{ field: "message", operator: "contains", value: "urgent" }],
        outcome: "escalate",
        priority: 100,
        enabled: true,
        version: 1,
      };
      registerTenantPolicies(tenantId + "-contains", [p]);
      const trace = evaluatePolicy("escalation", { message: "this is urgent!" }, tenantId + "-contains");
      expect(trace.outcome).toBe("escalate");
    });
  });
});
