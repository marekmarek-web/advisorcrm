/**
 * Automation recommendations (Plan 5D.1).
 * Rule-based suggestions for automated workflows. No LLM for v1.
 */

export type ExecutionMode = "manual_only" | "draft_only" | "approval_required" | "auto_disabled";

export type AutomationType =
  | "prepare_payment_apply_after_approved"
  | "followup_email_for_missing_fields"
  | "create_task_for_pending_review"
  | "notification_for_blocked_payment"
  | "highlight_correction_spike";

export type RiskLevel = "low" | "medium" | "high";

export type AutomationRecommendation = {
  automationType: AutomationType;
  trigger: string;
  recommendedAction: string;
  scope: string;
  reason: string;
  riskLevel: RiskLevel;
  executionMode: ExecutionMode;
  entityType?: string;
  entityId?: string;
};

export type AutomationDataSources = {
  approvedReviewsWithPayment: { id: string; fileName: string; applyReadiness: string }[];
  reviewsWithMissingFields: { id: string; fileName: string; missingFields: string[]; contactId?: string }[];
  longPendingReviews: { id: string; fileName: string; daysOld: number }[];
  blockedPayments: { id: string; title: string; contactId: string }[];
  correctionSpikes: { documentType: string; correctionCount: number; threshold: number }[];
};

const LONG_PENDING_THRESHOLD_DAYS = 5;

export function getAutomationRecommendations(
  data: AutomationDataSources,
): AutomationRecommendation[] {
  const recommendations: AutomationRecommendation[] = [];

  for (const r of data.approvedReviewsWithPayment) {
    if (r.applyReadiness === "ready_for_apply") {
      recommendations.push({
        automationType: "prepare_payment_apply_after_approved",
        trigger: `Review ${r.fileName} schválena, apply ready.`,
        recommendedAction: "Připravit draft platebního apply.",
        scope: "review",
        reason: "Schválený review s platebními instrukcemi je připraven k apply.",
        riskLevel: "low",
        executionMode: "draft_only",
        entityType: "review",
        entityId: r.id,
      });
    }
  }

  for (const r of data.reviewsWithMissingFields) {
    if (r.missingFields.length > 0) {
      recommendations.push({
        automationType: "followup_email_for_missing_fields",
        trigger: `Review ${r.fileName} má chybějící pole: ${r.missingFields.join(", ")}.`,
        recommendedAction: "Připravit draft emailu s žádostí o doplnění.",
        scope: "review",
        reason: "Automatizovaný follow-up pro chybějící údaje.",
        riskLevel: "low",
        executionMode: "draft_only",
        entityType: "review",
        entityId: r.id,
      });
    }
  }

  for (const r of data.longPendingReviews) {
    if (r.daysOld >= LONG_PENDING_THRESHOLD_DAYS) {
      recommendations.push({
        automationType: "create_task_for_pending_review",
        trigger: `Review ${r.fileName} čeká ${r.daysOld} dní.`,
        recommendedAction: "Vytvořit úkol pro zpracování review.",
        scope: "review",
        reason: "Review čeká příliš dlouho bez reakce.",
        riskLevel: "medium",
        executionMode: "draft_only",
        entityType: "review",
        entityId: r.id,
      });
    }
  }

  for (const p of data.blockedPayments) {
    recommendations.push({
      automationType: "notification_for_blocked_payment",
      trigger: `Platba ${p.title} blokována.`,
      recommendedAction: "Vytvořit notifikaci pro poradce.",
      scope: "payment",
      reason: "Blokovaná platba vyžaduje pozornost.",
      riskLevel: "medium",
      executionMode: "approval_required",
      entityType: "payment",
      entityId: p.id,
    });
  }

  for (const spike of data.correctionSpikes) {
    if (spike.correctionCount > spike.threshold) {
      recommendations.push({
        automationType: "highlight_correction_spike",
        trigger: `Typ ${spike.documentType}: ${spike.correctionCount} korekcí (práh ${spike.threshold}).`,
        recommendedAction: "Zvýraznit review tohoto typu pro kontrolu.",
        scope: "pipeline",
        reason: "Vyšší než obvyklý počet korekcí naznačuje problém v extrakci.",
        riskLevel: "high",
        executionMode: "manual_only",
        entityType: "pipeline",
      });
    }
  }

  return recommendations;
}
