/**
 * Types for Phase 6: AI briefing before and after meetings.
 * Pre-meeting = computed view; post-meeting = draft output with suggested actions.
 */

export type PreMeetingBrief = {
  meetingId: string | null;
  contactId: string;
  householdId: string | null;
  householdName: string | null;
  eventType: string | null;
  meetingAt: string | null;
  executiveSummary: string;
  lastMeetingSummary: string | null;
  openTasks: Array<{ id: string; title: string; dueDate: string | null }>;
  openOpportunities: Array<{
    id: string;
    title: string;
    stageName: string;
    caseType: string;
    householdId?: string | null;
  }>;
  productsSummary: string[];
  analysisStatus: "missing" | "draft" | "completed" | "exported" | "archived";
  analysisGaps: string[];
  serviceSignals: { nextServiceDue: string | null; label: string } | null;
  topAiOpportunities: Array<{ title: string; recommendation: string; priority: number }>;
  suggestedAgenda: string[];
  suggestedMainGoal: string | null;
  questionsToOpen: string[];
  warnings: string[];
  sourceSignals: Array<{ type: string; label: string }>;
  createdAt: string;
  updatedAt: string;
};

export type PostMeetingSummary = {
  meetingId: string | null;
  meetingNoteId: string | null;
  contactId: string;
  householdId: string | null;
  summaryShort: string;
  keyPoints: string[];
  agreedItems: string[];
  followUps: Array<{ title: string; dueDate?: string; kind: "task" | "event" }>;
  suggestedTasks: Array<{ title: string; dueDate?: string }>;
  suggestedNextMeeting: string | null;
  suggestedOpportunity: string | null;
  suggestedServiceReview: boolean;
  suggestedAnalysisUpdate: boolean;
  emailDraft: { subject: string; body: string };
  sourceNotes: string | null;
  confidence: "high" | "medium" | "low";
  createdAt: string;
  updatedAt: string;
};

export type SuggestedActionType = "task" | "event" | "opportunity" | "email_draft";
