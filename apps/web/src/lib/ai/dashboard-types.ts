/**
 * Types for AI dashboard assistant (Phase 5).
 */

export type UrgentItemSeverity = "high" | "medium" | "low";

export interface UrgentItem {
  type: string;
  entityId: string;
  score: number;
  severity: UrgentItemSeverity;
  title: string;
  description: string;
  recommendedAction?: string;
  source?: string;
  blockedReason?: string;
}

export interface BlockedItem {
  type: "review" | "payment";
  entityId: string;
  title: string;
  blockedReasons: string[];
  source: string;
}

export type SuggestedActionType =
  | "open_review"
  | "open_portal_path"
  | "view_client"
  | "create_task"
  | "draft_email"
  | "open_task";

export interface SuggestedAction {
  type: SuggestedActionType;
  label: string;
  payload: Record<string, unknown>;
}

export interface ContractWaitingForReview {
  id: string;
  fileName: string;
  createdAt: string;
  confidence: number | null;
  processingStatus: string;
}

export interface TaskDueItem {
  id: string;
  title: string;
  dueDate: string;
  contactName: string | null;
}

export interface ClientNeedingAttention {
  id: string;
  name: string;
  reason: string;
  detail?: string;
}

export interface MissingDataWarning {
  source: string;
  entityId: string;
  message: string;
}

export interface DashboardMetric {
  key: "overdue" | "today" | "review" | "blocked";
  label: string;
  value: number;
  tone: "danger" | "warning" | "info" | "neutral";
}

export interface DashboardPrioritySummary {
  headline: string;
  primaryFocus: string;
  primaryActionLabel: string;
  metrics: DashboardMetric[];
}

export interface DashboardSummary {
  urgentItems: UrgentItem[];
  contractsWaitingForReview: ContractWaitingForReview[];
  tasksDueToday: TaskDueItem[];
  overdueTasks: TaskDueItem[];
  clientsNeedingAttention: ClientNeedingAttention[];
  missingDataWarnings: MissingDataWarning[];
  suggestedActions: SuggestedAction[];
  assistantSummaryText: string;
  blockedItems?: BlockedItem[];
  paymentsBlockedForPortal?: BlockedItem[];
  communicationSuggestions?: string[];
  prioritySummary?: DashboardPrioritySummary;
}
