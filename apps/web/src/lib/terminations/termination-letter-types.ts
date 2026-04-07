/**
 * Fáze 6 – kanonický view model pro document builder (termination_letter).
 * Podklad: template draft v1 (proměnné, podmíněný render, volná forma vs. formulář).
 */

export const TERMINATION_DOCUMENT_TYPE = "termination_letter" as const;

/** Kanál v dopise / UI – zúžená sada oproti DB `TerminationDeliveryChannel`. */
export type TerminationLetterDeliveryChannel = "post" | "email" | "databox" | "portal" | "form";

/** Badge nad preview (sekce 7 draftu). */
export type TerminationLetterPreviewBadge = "free_form" | "official_form" | "review_required";

/** Stav publikovatelnosti (sekce 6 – interní guardrails). */
export type TerminationLetterPublishState = "ready_to_send" | "draft_only" | "review_required";

import type { TerminationPolicyholderKind } from "./termination-document-extras";

export interface TerminationLetterViewModel {
  documentType: typeof TERMINATION_DOCUMENT_TYPE;
  terminationModeLabel: string;
  /** Krátká fráze do věty „ukončení nastalo …“ (3.1). */
  terminationModeLabelLower: string;
  generatedAt: string;
  place: string;
  signatureRequired: boolean;

  policyholderKind: TerminationPolicyholderKind;
  /** U fyzické osoby jméno příjemce; u firmy název společnosti pro adresaci. */
  policyholderName: string;
  policyholderCompanyName: string | null;
  policyholderAuthorizedPersonName: string | null;
  policyholderAuthorizedPersonRole: string | null;
  policyholderTitleBefore: string | null;
  policyholderTitleAfter: string | null;
  policyholderBirthDate: string | null;
  policyholderPersonalId: string | null;
  policyholderAddressLine1: string;
  policyholderAddressLine2: string;
  policyholderEmail: string | null;
  policyholderPhone: string | null;

  insurerName: string;
  insurerDepartment: string | null;
  insurerAddressLine1: string;
  insurerAddressLine2: string;
  insurerAddressLine3: string;
  deliveryChannel: TerminationLetterDeliveryChannel;
  requiresOfficialForm: boolean;
  officialFormName: string | null;
  officialFormNotes: string | null;

  contractNumber: string;
  productName: string | null;
  productSegment: string | null;
  contractStartDate: string | null;
  contractAnniversaryDate: string | null;

  terminationReasonCode: string;
  terminationReasonLabel: string;
  requestedEffectiveDate: string | null;
  computedEffectiveDate: string | null;
  /** Interní / poznámka – nepovinně do patičky dokumentu. */
  legalBasisShort: string | null;
  customReasonText: string | null;
  claimEventDate: string | null;
  distanceContractWithdrawal: boolean;

  attachments: string[];
  attachmentsSummaryText: string;
  advisorNoteForReview: string | null;
  internalWarnings: string[];

  /** Zda registr a rules dovolují volný dopis (pro badge + guard). */
  freeformLetterAllowed: boolean;
}

/** Strukturovaný výstup místo volného dopisu (sekce 5). */
export interface TerminationOfficialFormOutput {
  title: string;
  body: string;
  instructionLines: string[];
  ctaHints: string[];
}

export interface TerminationLetterBuildResult {
  viewModel: TerminationLetterViewModel;
  badge: TerminationLetterPreviewBadge;
  publishState: TerminationLetterPublishState;
  /** Plný text dopisu – null pokud `official_form` nebo blokováno. */
  letterPlainText: string | null;
  officialForm: TerminationOfficialFormOutput | null;
  /** Průvodní list / cover letter při formulářovém režimu (draft §8). */
  coveringLetterPlainText: string | null;
  /** Krátká věta pod badge, pokud náhled není finální. */
  previewWatermark: string | null;
  validityReasons: string[];
  /** Escapovaný HTML náhled dopisu (null stejně jako letterPlainText). */
  letterHtml: string | null;
  /** HTML průvodního dopisu při formulářovém režimu. */
  coveringLetterHtml: string | null;
}
