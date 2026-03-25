/**
 * Disaster recovery playbooks (Plan 9D).
 * Structured DR procedures mapped to incident types and providers.
 * Provides step-by-step recovery instructions and verification checklists.
 */

import type { ProviderType } from "./provider-fallbacks";

export type PlaybookTrigger =
  | "ai_service_down"
  | "storage_unavailable"
  | "database_degraded"
  | "email_delivery_failure"
  | "full_service_outage"
  | "data_loss_event"
  | "security_breach"
  | "compliance_violation"
  | "provider_migration";

export type PlaybookStep = {
  stepId: string;
  order: number;
  title: string;
  description: string;
  responsible: "on_call_engineer" | "cto" | "support" | "automated";
  automated: boolean;
  estimatedMinutes: number;
  verificationCriteria?: string;
};

export type RecoveryObjectives = {
  rpo: string; // Recovery Point Objective
  rto: string; // Recovery Time Objective
};

export type DRPlaybook = {
  playbookId: string;
  trigger: PlaybookTrigger;
  name: string;
  description: string;
  affectedProviders: ProviderType[];
  recoveryObjectives: RecoveryObjectives;
  steps: PlaybookStep[];
  escalationPath: string[];
  postRecoveryChecks: string[];
  communicationTemplate: string;
};

export const DR_PLAYBOOKS: DRPlaybook[] = [
  {
    playbookId: "pb-ai-down",
    trigger: "ai_service_down",
    name: "AI Service Outage Response",
    description: "Procedures for handling OpenAI / AI extraction service downtime",
    affectedProviders: ["ai_extraction", "ai_assistant"],
    recoveryObjectives: { rpo: "0 minutes", rto: "15 minutes" },
    steps: [
      {
        stepId: "ai-1",
        order: 1,
        title: "Detect and alert",
        description: "Health check failure triggers alert. Verify by calling provider status API.",
        responsible: "automated",
        automated: true,
        estimatedMinutes: 1,
        verificationCriteria: "Provider status = unavailable confirmed",
      },
      {
        stepId: "ai-2",
        order: 2,
        title: "Activate fallback provider",
        description: "Switch AI extraction to GPT-3.5 fallback via setProviderStatus(). Queue new uploads for retry.",
        responsible: "automated",
        automated: true,
        estimatedMinutes: 2,
        verificationCriteria: "Fallback provider status = active, no new upload failures",
      },
      {
        stepId: "ai-3",
        order: 3,
        title: "Activate degraded mode for AI assistant",
        description: "Call activateGlobalDegradedMode('ai_assistant'). UI shows 'limited mode' banner.",
        responsible: "automated",
        automated: true,
        estimatedMinutes: 1,
      },
      {
        stepId: "ai-4",
        order: 4,
        title: "Monitor fallback performance",
        description: "Track extraction accuracy and latency on fallback. Alert if >20% failure rate.",
        responsible: "on_call_engineer",
        automated: false,
        estimatedMinutes: 10,
      },
      {
        stepId: "ai-5",
        order: 5,
        title: "Restore primary provider",
        description: "When provider is healthy again: clearProviderStatusOverride() and deactivate degraded mode.",
        responsible: "on_call_engineer",
        automated: false,
        estimatedMinutes: 5,
        verificationCriteria: "10 consecutive successful extraction calls",
      },
    ],
    escalationPath: ["on_call_engineer", "cto"],
    postRecoveryChecks: [
      "Verify extraction accuracy back to baseline (>0.85 confidence)",
      "Process any queued uploads from outage window",
      "Check for corrupted partial extractions during fallback",
      "Update incident log with timeline and root cause",
    ],
    communicationTemplate:
      "AI extraction service is experiencing issues. New document uploads are queued. Existing reviews are unaffected. ETA: [ETA]",
  },
  {
    playbookId: "pb-storage-down",
    trigger: "storage_unavailable",
    name: "Document Storage Outage",
    description: "Procedures when Supabase Storage or document bucket is unavailable",
    affectedProviders: ["storage", "document_preview"],
    recoveryObjectives: { rpo: "1 minute", rto: "30 minutes" },
    steps: [
      {
        stepId: "str-1",
        order: 1,
        title: "Halt new uploads",
        description: "Return 503 on /api/documents/upload with Retry-After header. Do not accept new files.",
        responsible: "automated",
        automated: true,
        estimatedMinutes: 1,
      },
      {
        stepId: "str-2",
        order: 2,
        title: "Queue pending uploads",
        description: "Any in-flight uploads go to dead-letter queue for retry when storage recovers.",
        responsible: "automated",
        automated: true,
        estimatedMinutes: 2,
      },
      {
        stepId: "str-3",
        order: 3,
        title: "Assess scope",
        description: "Check if it's a bucket policy issue, quota, or full outage. Check Supabase status page.",
        responsible: "on_call_engineer",
        automated: false,
        estimatedMinutes: 10,
        verificationCriteria: "Root cause identified",
      },
      {
        stepId: "str-4",
        order: 4,
        title: "Restore storage",
        description: "Fix root cause (policy, quota, bucket). Verify with test upload.",
        responsible: "on_call_engineer",
        automated: false,
        estimatedMinutes: 15,
        verificationCriteria: "Test file upload + download succeeds",
      },
      {
        stepId: "str-5",
        order: 5,
        title: "Drain retry queue",
        description: "Process queued uploads from dead-letter. Monitor for partial files or corruption.",
        responsible: "automated",
        automated: true,
        estimatedMinutes: 5,
        verificationCriteria: "Dead-letter queue drained, no failed items",
      },
    ],
    escalationPath: ["on_call_engineer", "cto"],
    postRecoveryChecks: [
      "Verify all queued uploads were processed",
      "Check storage quota levels",
      "Audit signed URL generation still works",
      "Test document preview and download",
    ],
    communicationTemplate:
      "Document storage is temporarily unavailable. New uploads are queued and will be processed automatically when service restores. ETA: [ETA]",
  },
  {
    playbookId: "pb-email-fail",
    trigger: "email_delivery_failure",
    name: "Email Delivery Failure",
    description: "Procedures when primary email provider (SendGrid) fails",
    affectedProviders: ["email"],
    recoveryObjectives: { rpo: "0 minutes", rto: "5 minutes" },
    steps: [
      {
        stepId: "em-1",
        order: 1,
        title: "Switch to SMTP fallback",
        description: "setProviderStatus('sendgrid', 'unavailable'). Route to smtp_fallback provider.",
        responsible: "automated",
        automated: true,
        estimatedMinutes: 2,
        verificationCriteria: "Test email delivered via SMTP fallback",
      },
      {
        stepId: "em-2",
        order: 2,
        title: "Queue failed emails for retry",
        description: "Any emails that failed go to retry queue. SendGrid failed webhooks logged.",
        responsible: "automated",
        automated: true,
        estimatedMinutes: 1,
      },
      {
        stepId: "em-3",
        order: 3,
        title: "Monitor SMTP fallback",
        description: "Watch delivery rates on SMTP. Alert if >5% bounce rate.",
        responsible: "on_call_engineer",
        automated: false,
        estimatedMinutes: 10,
      },
      {
        stepId: "em-4",
        order: 4,
        title: "Restore primary provider",
        description: "When SendGrid recovers: clearProviderStatusOverride('sendgrid'). Drain retry queue.",
        responsible: "on_call_engineer",
        automated: false,
        estimatedMinutes: 5,
      },
    ],
    escalationPath: ["on_call_engineer"],
    postRecoveryChecks: [
      "Confirm queued emails delivered",
      "Check for duplicate sends from retry",
      "Review bounce/complaint rates",
    ],
    communicationTemplate: "Email delivery is experiencing delays. Communications are queued and will be delivered shortly.",
  },
  {
    playbookId: "pb-security-breach",
    trigger: "security_breach",
    name: "Security Breach Response",
    description: "Immediate response procedures for confirmed or suspected security breach",
    affectedProviders: ["storage", "ai_extraction"],
    recoveryObjectives: { rpo: "N/A", rto: "2 hours" },
    steps: [
      {
        stepId: "sec-1",
        order: 1,
        title: "Isolate affected systems",
        description: "Revoke API keys, disable affected user sessions, enable emergency read-only mode if needed.",
        responsible: "cto",
        automated: false,
        estimatedMinutes: 15,
        verificationCriteria: "No new unauthorized access detected",
      },
      {
        stepId: "sec-2",
        order: 2,
        title: "Create incident record",
        description: "createIncident() with severity=critical. Assign all security team members.",
        responsible: "on_call_engineer",
        automated: false,
        estimatedMinutes: 5,
      },
      {
        stepId: "sec-3",
        order: 3,
        title: "Preserve evidence",
        description: "Export audit logs for affected timeframe. Tag records under legal hold (addRetentionLock).",
        responsible: "on_call_engineer",
        automated: false,
        estimatedMinutes: 20,
        verificationCriteria: "Audit logs secured and locked",
      },
      {
        stepId: "sec-4",
        order: 4,
        title: "Assess scope of breach",
        description: "Determine what data was accessed, by whom, and timeframe.",
        responsible: "cto",
        automated: false,
        estimatedMinutes: 60,
        verificationCriteria: "Impact assessment documented",
      },
      {
        stepId: "sec-5",
        order: 5,
        title: "Notify affected parties",
        description: "Per GDPR Art. 33: notify supervisory authority within 72h if personal data affected.",
        responsible: "cto",
        automated: false,
        estimatedMinutes: 30,
      },
    ],
    escalationPath: ["on_call_engineer", "cto", "legal"],
    postRecoveryChecks: [
      "All access keys rotated",
      "Security audit log reviewed",
      "GDPR notification sent if required",
      "Penetration test scheduled",
      "Incident post-mortem scheduled within 7 days",
    ],
    communicationTemplate:
      "We have detected and are responding to a security incident. Affected users will be notified individually. We take data protection seriously and are taking immediate steps.",
  },
];

// ---- Playbook lookups ----

export function getPlaybook(playbookId: string): DRPlaybook | undefined {
  return DR_PLAYBOOKS.find((p) => p.playbookId === playbookId);
}

export function getPlaybookByTrigger(trigger: PlaybookTrigger): DRPlaybook | undefined {
  return DR_PLAYBOOKS.find((p) => p.trigger === trigger);
}

export function getPlaybooksForProvider(providerType: ProviderType): DRPlaybook[] {
  return DR_PLAYBOOKS.filter((p) => p.affectedProviders.includes(providerType));
}

export type PlaybookSummary = {
  playbookId: string;
  trigger: PlaybookTrigger;
  name: string;
  rpo: string;
  rto: string;
  stepCount: number;
  hasAutomatedSteps: boolean;
};

export function getPlaybookSummaries(): PlaybookSummary[] {
  return DR_PLAYBOOKS.map((p) => ({
    playbookId: p.playbookId,
    trigger: p.trigger,
    name: p.name,
    rpo: p.recoveryObjectives.rpo,
    rto: p.recoveryObjectives.rto,
    stepCount: p.steps.length,
    hasAutomatedSteps: p.steps.some((s) => s.automated),
  }));
}

export function getAutomatedSteps(playbook: DRPlaybook): PlaybookStep[] {
  return playbook.steps.filter((s) => s.automated).sort((a, b) => a.order - b.order);
}

export function getManualSteps(playbook: DRPlaybook): PlaybookStep[] {
  return playbook.steps.filter((s) => !s.automated).sort((a, b) => a.order - b.order);
}

export function estimateRecoveryTime(playbookId: string): number | null {
  const playbook = getPlaybook(playbookId);
  if (!playbook) return null;
  return playbook.steps.reduce((sum, step) => sum + step.estimatedMinutes, 0);
}
