/**
 * AI Výpověď smlouvy – string unions / katalogové kódy (Drizzle: text + .$type<...>()).
 * Konzistentní pattern jako contracts.ts / documents.ts.
 */

/** Kódy z katalogu `termination_reason_catalog` (seed + FK z requestu). */
export const terminationReasonCodes = [
  "end_of_period_6_weeks",
  "fixed_date_if_contractually_allowed",
  "within_2_months_from_inception",
  "after_claim_event",
  "distance_contract_withdrawal",
  "special_reason_manual_review",
  "mutual_agreement",
] as const;
export type TerminationReasonCode = (typeof terminationReasonCodes)[number];

/**
 * Režim výpočtu / průběhu žádosti (wizard), odlišný od reason_code (strukturovaný důvod).
 */
export const terminationModes = [
  "end_of_insurance_period",
  "fixed_calendar_date",
  "within_two_months_from_inception",
  "after_claim",
  "distance_withdrawal",
  "mutual_agreement",
  "manual_review_other",
] as const;
export type TerminationMode = (typeof terminationModes)[number];

/** Stav řízené žádosti o ukončení (workflow engine). */
export const terminationRequestStatuses = [
  "draft",
  "intake",
  "rules_evaluating",
  "awaiting_data",
  "awaiting_review",
  "ready_to_generate",
  "document_draft",
  "final_review",
  "dispatch_pending",
  "dispatched",
  "completed",
  "cancelled",
  "failed",
] as const;
export type TerminationRequestStatus = (typeof terminationRequestStatuses)[number];

/** Odkud žádost vznikla (CRM, banner, AI, …). */
export const terminationRequestSources = [
  "crm_contract",
  "quick_action",
  "ai_chat",
  "manual_intake",
  "review_queue",
  "document_upload",
] as const;
export type TerminationRequestSource = (typeof terminationRequestSources)[number];

export const terminationDeliveryChannels = [
  "postal_mail",
  "email",
  "data_box",
  "insurer_portal",
  "in_person",
  "not_yet_set",
  "other",
] as const;
export type TerminationDeliveryChannel = (typeof terminationDeliveryChannels)[number];

export const terminationRequestEventTypes = [
  "created",
  "status_changed",
  "rules_result",
  "note",
  "document_linked",
  "dispatch_attempt",
  "reminder",
  "review_assignment",
] as const;
export type TerminationRequestEventType = (typeof terminationRequestEventTypes)[number];

export const terminationGeneratedDocumentKinds = [
  "draft_letter",
  "insurer_official_form",
  "cover_letter",
  "combined_pack",
  "advisor_internal",
] as const;
export type TerminationGeneratedDocumentKind = (typeof terminationGeneratedDocumentKinds)[number];

export const terminationDispatchStatuses = [
  "pending",
  "sent",
  "delivered",
  "failed",
  "bounced",
  "cancelled",
] as const;
export type TerminationDispatchStatus = (typeof terminationDispatchStatuses)[number];

export const terminationAttachmentSatisfactionStatuses = [
  "required",
  "optional",
  "satisfied",
  "waived",
  "not_applicable",
] as const;
export type TerminationAttachmentSatisfactionStatus =
  (typeof terminationAttachmentSatisfactionStatuses)[number];

/** Výchozí výpočet data účinnosti v katalogu důvodů (interpretuje rules engine). */
export const terminationDefaultDateComputations = [
  "end_of_period_notice_6w",
  "fixed_user_date",
  "two_months_from_inception",
  "after_claim_manual",
  "distance_withdrawal_legal",
  "mutual_agreement_date",
  "manual_always",
] as const;
export type TerminationDefaultDateComputation =
  (typeof terminationDefaultDateComputations)[number];
