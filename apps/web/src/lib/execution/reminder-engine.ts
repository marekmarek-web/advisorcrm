/**
 * Reminder engine (Plan 6B.1).
 * Due-date policy engine with CRUD actions for reminders.
 */

export type ReminderType =
  | "pending_review" | "missing_client_data" | "blocked_payment_setup"
  | "no_followup_after_upload" | "expiring_contract" | "income_doc_refresh"
  | "overdue_task" | "apply_ready_untouched"
  | "termination_delivery_check";

export type ReminderSeverity = "low" | "medium" | "high" | "critical";

export type ReminderStatus = "pending" | "snoozed" | "done" | "dismissed" | "converted";

export type SuggestionOrigin = "ai" | "rule" | "user" | "escalation";

export type Reminder = {
  id: string;
  tenantId: string;
  reminderType: ReminderType;
  title: string;
  description: string;
  dueAt: Date;
  severity: ReminderSeverity;
  relatedEntityType: string;
  relatedEntityId: string;
  suggestionOrigin: SuggestionOrigin;
  status: ReminderStatus;
  snoozedUntil?: Date;
  resolvedAt?: Date;
  assignedTo: string;
};

type DueDatePolicy = {
  type: ReminderType;
  thresholdHours: number;
  severity: ReminderSeverity;
  titleTemplate: string;
};

export const DUE_DATE_POLICIES: DueDatePolicy[] = [
  { type: "pending_review", thresholdHours: 72, severity: "high", titleTemplate: "Čekající review > 72h" },
  { type: "missing_client_data", thresholdHours: 120, severity: "medium", titleTemplate: "Chybějící data klienta – 5 dní" },
  { type: "blocked_payment_setup", thresholdHours: 48, severity: "high", titleTemplate: "Blokovaná platba > 48h" },
  { type: "no_followup_after_upload", thresholdHours: 168, severity: "medium", titleTemplate: "Bez follow-up po uploadu > 7 dní" },
  { type: "expiring_contract", thresholdHours: 720, severity: "high", titleTemplate: "Expirace smlouvy < 30 dní" },
  { type: "overdue_task", thresholdHours: 48, severity: "high", titleTemplate: "Zpožděný úkol > 2 dny" },
  { type: "apply_ready_untouched", thresholdHours: 24, severity: "critical", titleTemplate: "Apply-ready nepotvrzeno > 24h" },
];

export function evaluateDueDatePolicy(
  type: ReminderType,
  ageHours: number,
): { shouldCreate: boolean; severity: ReminderSeverity; title: string } | null {
  const policy = DUE_DATE_POLICIES.find((p) => p.type === type);
  if (!policy) return null;
  if (ageHours < policy.thresholdHours) return null;
  return { shouldCreate: true, severity: policy.severity, title: policy.titleTemplate };
}

export function createReminder(params: {
  tenantId: string;
  reminderType: ReminderType;
  title: string;
  description: string;
  dueAt: Date;
  severity: ReminderSeverity;
  relatedEntityType: string;
  relatedEntityId: string;
  assignedTo: string;
  suggestionOrigin?: SuggestionOrigin;
}): Reminder {
  return {
    id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status: "pending",
    suggestionOrigin: params.suggestionOrigin ?? "rule",
    ...params,
  };
}

export function markDone(reminder: Reminder): Reminder {
  return { ...reminder, status: "done", resolvedAt: new Date() };
}

export function snoozeReminder(reminder: Reminder, until: Date): Reminder {
  return { ...reminder, status: "snoozed", snoozedUntil: until };
}

export function dismissReminder(reminder: Reminder): Reminder {
  return { ...reminder, status: "dismissed", resolvedAt: new Date() };
}

export function convertToTask(reminder: Reminder): {
  reminder: Reminder;
  taskPayload: { title: string; description: string; assignedTo: string; tenantId: string };
} {
  return {
    reminder: { ...reminder, status: "converted", resolvedAt: new Date() },
    taskPayload: {
      title: reminder.title,
      description: reminder.description,
      assignedTo: reminder.assignedTo,
      tenantId: reminder.tenantId,
    },
  };
}

export function reassignReminder(reminder: Reminder, newAssignee: string): Reminder {
  return { ...reminder, assignedTo: newAssignee };
}

export function deduplicateReminders(reminders: Reminder[]): Reminder[] {
  const seen = new Set<string>();
  return reminders.filter((r) => {
    const key = `${r.reminderType}:${r.relatedEntityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
