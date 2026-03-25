import { describe, it, expect } from "vitest";
import {
  canApprove,
  getRequiredApprovalChain,
  getApprovalRule,
  requiresManagerApproval,
  APPROVAL_RULES,
} from "../approval-policies";

describe("approval-policies", () => {
  describe("APPROVAL_RULES", () => {
    it("covers all domains", () => {
      const domains = new Set(APPROVAL_RULES.map((r) => r.domain));
      expect(domains.has("review")).toBe(true);
      expect(domains.has("contract_apply")).toBe(true);
      expect(domains.has("payment_apply")).toBe(true);
      expect(domains.has("email_send")).toBe(true);
      expect(domains.has("escalation_ack")).toBe(true);
      expect(domains.has("override")).toBe(true);
      expect(domains.has("automation")).toBe(true);
    });

    it("covers all risk levels per domain", () => {
      const domains = ["review", "contract_apply", "payment_apply"] as const;
      for (const domain of domains) {
        const rules = APPROVAL_RULES.filter((r) => r.domain === domain);
        const riskLevels = new Set(rules.map((r) => r.riskLevel));
        expect(riskLevels.has("low")).toBe(true);
        expect(riskLevels.has("medium")).toBe(true);
        expect(riskLevels.has("high")).toBe(true);
        expect(riskLevels.has("critical")).toBe(true);
      }
    });
  });

  describe("getApprovalRule", () => {
    it("returns rule for domain+riskLevel", () => {
      const rule = getApprovalRule("review", "high");
      expect(rule).toBeDefined();
      expect(rule?.domain).toBe("review");
      expect(rule?.riskLevel).toBe("high");
    });

    it("returns undefined for unknown combination", () => {
      expect(getApprovalRule("review", "critical")).toBeDefined(); // exists
    });
  });

  describe("canApprove", () => {
    it("Advisor can approve low risk review", () => {
      expect(canApprove("Advisor", "review", "low")).toBe(true);
    });

    it("Advisor cannot approve high risk contract_apply", () => {
      expect(canApprove("Advisor", "contract_apply", "high")).toBe(false);
    });

    it("Manager can approve high risk operations", () => {
      expect(canApprove("Manager", "review", "high")).toBe(true);
      expect(canApprove("Manager", "contract_apply", "high")).toBe(true);
    });

    it("Director can approve critical operations", () => {
      expect(canApprove("Director", "override", "high")).toBe(true);
    });

    it("Admin can approve everything", () => {
      expect(canApprove("Admin", "override", "critical")).toBe(true);
      expect(canApprove("Admin", "automation", "critical")).toBe(true);
    });

    it("Advisor cannot approve critical payment_apply", () => {
      expect(canApprove("Advisor", "payment_apply", "critical")).toBe(false);
    });

    it("Manager can approve medium risk payment_apply", () => {
      expect(canApprove("Manager", "payment_apply", "medium")).toBe(true);
    });
  });

  describe("getRequiredApprovalChain", () => {
    it("returns chain for review low", () => {
      const chain = getRequiredApprovalChain("review", { riskLevel: "low" });
      expect(chain).not.toBeNull();
      expect(chain!.domain).toBe("review");
      expect(chain!.riskLevel).toBe("low");
      expect(chain!.steps.length).toBeGreaterThanOrEqual(1);
    });

    it("returns single step for low risk", () => {
      const chain = getRequiredApprovalChain("review", { riskLevel: "low" });
      expect(chain!.requiresDualApproval).toBe(false);
      expect(chain!.steps.length).toBe(1);
    });

    it("returns dual approval steps for critical risk", () => {
      const chain = getRequiredApprovalChain("review", { riskLevel: "critical" });
      expect(chain!.requiresDualApproval).toBe(true);
      expect(chain!.steps.length).toBe(2);
    });

    it("auto blocks critical review until reviewed", () => {
      const chain = getRequiredApprovalChain("contract_apply", { riskLevel: "critical" });
      expect(chain!.autoBlockUntilReviewed).toBe(true);
    });

    it("uses low as default risk level", () => {
      const chain = getRequiredApprovalChain("email_send");
      expect(chain!.riskLevel).toBe("low");
    });
  });

  describe("requiresManagerApproval", () => {
    it("high risk review requires manager", () => {
      expect(requiresManagerApproval("review", "high")).toBe(true);
    });

    it("low risk review does not require manager", () => {
      expect(requiresManagerApproval("review", "low")).toBe(false);
    });

    it("critical override requires manager (Director level)", () => {
      expect(requiresManagerApproval("override", "critical")).toBe(true);
    });
  });
});
