/**
 * SLA policy engine (Plan 6C.2).
 * Registry of SLA policies and breach detection.
 */

export type SLAPolicy = {
  code: string;
  entityType: string;
  description: string;
  warningThresholdHours: number;
  breachThresholdHours: number;
  escalationTarget: "advisor" | "manager" | "admin";
};

export type SLABreachItem = {
  policyCode: string;
  entityType: string;
  entityId: string;
  ageHours: number;
  level: "warning" | "breach";
  escalationTarget: string;
};

export const SLA_POLICIES: SLAPolicy[] = [
  { code: "review_resolution", entityType: "review", description: "Vyřešení review", warningThresholdHours: 48, breachThresholdHours: 96, escalationTarget: "manager" },
  { code: "blocked_payment_handling", entityType: "payment", description: "Řešení blokované platby", warningThresholdHours: 24, breachThresholdHours: 72, escalationTarget: "manager" },
  { code: "missing_data_followup", entityType: "contact", description: "Follow-up chybějících dat", warningThresholdHours: 72, breachThresholdHours: 168, escalationTarget: "advisor" },
  { code: "client_communication_response", entityType: "communication", description: "Odpověď klientovi", warningThresholdHours: 120, breachThresholdHours: 240, escalationTarget: "manager" },
  { code: "apply_completion", entityType: "apply", description: "Dokončení aplikace", warningThresholdHours: 24, breachThresholdHours: 72, escalationTarget: "advisor" },
];

export function getSLAPolicy(code: string): SLAPolicy | undefined {
  return SLA_POLICIES.find((p) => p.code === code);
}

export function evaluateSLA(
  policyCode: string,
  ageHours: number,
): { level: "ok" | "warning" | "breach" } {
  const policy = getSLAPolicy(policyCode);
  if (!policy) return { level: "ok" };
  if (ageHours >= policy.breachThresholdHours) return { level: "breach" };
  if (ageHours >= policy.warningThresholdHours) return { level: "warning" };
  return { level: "ok" };
}

export function checkSLABreaches(
  items: { entityType: string; entityId: string; ageHours: number }[],
): SLABreachItem[] {
  const breaches: SLABreachItem[] = [];

  for (const item of items) {
    const matchingPolicies = SLA_POLICIES.filter((p) => p.entityType === item.entityType);
    for (const policy of matchingPolicies) {
      const result = evaluateSLA(policy.code, item.ageHours);
      if (result.level !== "ok") {
        breaches.push({
          policyCode: policy.code,
          entityType: item.entityType,
          entityId: item.entityId,
          ageHours: item.ageHours,
          level: result.level,
          escalationTarget: policy.escalationTarget,
        });
      }
    }
  }

  return breaches;
}
