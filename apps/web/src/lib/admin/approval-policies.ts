/**
 * Approval policies (Plan 8B.2).
 * Role-based and risk-level approval authority model.
 */

import type { RoleName } from "@/lib/auth/get-membership";

export type ApprovalDomain =
  | "review"
  | "contract_apply"
  | "payment_apply"
  | "email_send"
  | "escalation_ack"
  | "override"
  | "automation";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ApprovalRule = {
  domain: ApprovalDomain;
  riskLevel: RiskLevel;
  requiredRole: RoleName;
  requiresDualApproval: boolean;
  autoBlockUntilReviewed: boolean;
  description?: string;
};

export const APPROVAL_RULES: ApprovalRule[] = [
  // Review
  { domain: "review", riskLevel: "low", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "review", riskLevel: "medium", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "review", riskLevel: "high", requiredRole: "Manager", requiresDualApproval: false, autoBlockUntilReviewed: true },
  { domain: "review", riskLevel: "critical", requiredRole: "Director", requiresDualApproval: true, autoBlockUntilReviewed: true },

  // Contract apply
  { domain: "contract_apply", riskLevel: "low", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "contract_apply", riskLevel: "medium", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "contract_apply", riskLevel: "high", requiredRole: "Manager", requiresDualApproval: false, autoBlockUntilReviewed: true },
  { domain: "contract_apply", riskLevel: "critical", requiredRole: "Director", requiresDualApproval: true, autoBlockUntilReviewed: true },

  // Payment apply
  { domain: "payment_apply", riskLevel: "low", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "payment_apply", riskLevel: "medium", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "payment_apply", riskLevel: "high", requiredRole: "Manager", requiresDualApproval: true, autoBlockUntilReviewed: true },
  { domain: "payment_apply", riskLevel: "critical", requiredRole: "Director", requiresDualApproval: true, autoBlockUntilReviewed: true },

  // Email send
  { domain: "email_send", riskLevel: "low", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "email_send", riskLevel: "medium", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "email_send", riskLevel: "high", requiredRole: "Manager", requiresDualApproval: false, autoBlockUntilReviewed: true },
  { domain: "email_send", riskLevel: "critical", requiredRole: "Director", requiresDualApproval: true, autoBlockUntilReviewed: true },

  // Escalation ack
  { domain: "escalation_ack", riskLevel: "low", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "escalation_ack", riskLevel: "medium", requiredRole: "Manager", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "escalation_ack", riskLevel: "high", requiredRole: "Manager", requiresDualApproval: false, autoBlockUntilReviewed: true },
  { domain: "escalation_ack", riskLevel: "critical", requiredRole: "Director", requiresDualApproval: true, autoBlockUntilReviewed: true },

  // Override (administrative overrides)
  { domain: "override", riskLevel: "low", requiredRole: "Manager", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "override", riskLevel: "medium", requiredRole: "Manager", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "override", riskLevel: "high", requiredRole: "Director", requiresDualApproval: true, autoBlockUntilReviewed: true },
  { domain: "override", riskLevel: "critical", requiredRole: "Admin", requiresDualApproval: true, autoBlockUntilReviewed: true },

  // Automation
  { domain: "automation", riskLevel: "low", requiredRole: "Advisor", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "automation", riskLevel: "medium", requiredRole: "Manager", requiresDualApproval: false, autoBlockUntilReviewed: false },
  { domain: "automation", riskLevel: "high", requiredRole: "Director", requiresDualApproval: true, autoBlockUntilReviewed: true },
  { domain: "automation", riskLevel: "critical", requiredRole: "Admin", requiresDualApproval: true, autoBlockUntilReviewed: true },
];

const ROLE_AUTHORITY: Record<RoleName, number> = {
  Client: 0,
  Viewer: 1,
  Advisor: 2,
  Manager: 3,
  Director: 4,
  Admin: 5,
};

function roleHasAuthority(roleName: RoleName, requiredRole: RoleName): boolean {
  return (ROLE_AUTHORITY[roleName] ?? 0) >= (ROLE_AUTHORITY[requiredRole] ?? 999);
}

export function getApprovalRule(domain: ApprovalDomain, riskLevel: RiskLevel): ApprovalRule | undefined {
  return APPROVAL_RULES.find((r) => r.domain === domain && r.riskLevel === riskLevel);
}

export function canApprove(roleName: RoleName, domain: ApprovalDomain, riskLevel: RiskLevel): boolean {
  const rule = getApprovalRule(domain, riskLevel);
  if (!rule) return true;
  return roleHasAuthority(roleName, rule.requiredRole);
}

export type ApprovalChain = {
  domain: ApprovalDomain;
  riskLevel: RiskLevel;
  requiredRole: RoleName;
  requiresDualApproval: boolean;
  autoBlockUntilReviewed: boolean;
  steps: { role: RoleName; order: number }[];
};

export function getRequiredApprovalChain(
  domain: ApprovalDomain,
  context: { riskLevel?: RiskLevel } = {}
): ApprovalChain | null {
  const riskLevel: RiskLevel = context.riskLevel ?? "low";
  const rule = getApprovalRule(domain, riskLevel);
  if (!rule) return null;

  const steps: { role: RoleName; order: number }[] = [{ role: rule.requiredRole, order: 1 }];
  if (rule.requiresDualApproval) {
    const secondaryRole: RoleName =
      rule.requiredRole === "Advisor" ? "Manager"
        : rule.requiredRole === "Manager" ? "Director"
          : "Admin";
    steps.push({ role: secondaryRole, order: 2 });
  }

  return {
    domain,
    riskLevel,
    requiredRole: rule.requiredRole,
    requiresDualApproval: rule.requiresDualApproval,
    autoBlockUntilReviewed: rule.autoBlockUntilReviewed,
    steps,
  };
}

export function requiresManagerApproval(domain: ApprovalDomain, riskLevel: RiskLevel): boolean {
  const rule = getApprovalRule(domain, riskLevel);
  if (!rule) return false;
  return ROLE_AUTHORITY[rule.requiredRole] >= ROLE_AUTHORITY["Manager"];
}
