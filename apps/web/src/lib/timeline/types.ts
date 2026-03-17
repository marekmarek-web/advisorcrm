/**
 * Unified client timeline event model for Phase 3: Životní timeline klienta.
 * Used for display and for future AI/servisní vrstvy.
 */

export type TimelineEventCategory =
  | "meeting"
  | "task"
  | "deal"
  | "analysis"
  | "contract"
  | "document"
  | "service";

export type TimelineSourceEntityType =
  | "event"
  | "meeting_note"
  | "task"
  | "opportunity"
  | "financial_analysis"
  | "contract"
  | "document"
  | "activity_log";

export type ClientTimelineEvent = {
  id: string;
  eventType: string;
  category: TimelineEventCategory;
  contactId: string;
  householdId: string | null;
  sourceEntityType: TimelineSourceEntityType;
  sourceEntityId: string;
  timestamp: Date;
  title: string;
  summary: string | null;
  status?: string;
  link?: { path: string; label?: string };
  isHouseholdEvent?: boolean;
};
