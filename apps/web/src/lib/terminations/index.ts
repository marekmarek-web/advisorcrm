/**
 * AI Výpověď smlouvy – veřejné API modulu lib/terminations.
 *
 * Scope fází 2 + 3:
 *   - typy (TerminationRulesInput, TerminationRulesResult, katalogové záznamy, enumy)
 *   - catalog helpers (getAllInsurers, findInsurerByName, findReasonByCode, …)
 *   - rules engine (evaluateTerminationRules)
 *
 * Server actions a UI průvodce: `apps/web/src/app/actions/terminations.ts`, `/portal/terminations/new`.
 */

// --- Typy ---
export type {
  TerminationMode,
  TerminationReasonCode,
  TerminationRequestStatus,
  TerminationRequestSource,
  TerminationDeliveryChannel,
  TerminationDefaultDateComputation,
  TerminationCrmInput,
  TerminationManualInput,
  TerminationRulesInput,
  InsurerRegistryRow,
  ReasonCatalogRow,
  TerminationMissingField,
  TerminationAttachmentRequirement,
  TerminationRulesOutcome,
  TerminationRulesResult,
} from "./types";

// --- Catalog helpers ---
export {
  getAllInsurers,
  findInsurerByCatalogKey,
  findInsurerByName,
  getReasonsForSegment,
  findReasonByCode,
} from "./catalog";

// --- Rules engine ---
export { evaluateTerminationRules } from "./rules-engine";

export { modeToReasonCode } from "./mode-to-reason-code";
export {
  terminationDeliveryChannelLabel,
  terminationDispatchStatusLabel,
} from "./termination-delivery-labels";
export { formatTerminationRegistryMailingOneLine } from "./termination-registry-mail";

// --- Segment classifier + termination mode matrix ---
export { classifyInsuranceSegment } from "./segment-classifier";
export type { SegmentClassification } from "./segment-classifier";
export {
  getAllowedTerminationModes,
  isTerminationModeAllowedForSegment,
  getDefaultTerminationMode,
  ALL_TERMINATION_MODES,
} from "./segment-termination-matrix";

// --- Fáze 6: document builder (termination_letter) ---
export type {
  TerminationLetterViewModel,
  TerminationLetterBuildResult,
  TerminationLetterPreviewBadge,
  TerminationLetterPublishState,
  TerminationLetterDeliveryChannel,
  TerminationOfficialFormOutput,
} from "./termination-letter-types";
export { TERMINATION_DOCUMENT_TYPE } from "./termination-letter-types";
export {
  buildTerminationLetterResult,
  mapDbDeliveryToLetterChannel,
  terminationModeToLabels,
  legalBasisShortForReason,
  type TerminationLetterBuildInput,
  type TerminationRequestRowLike,
  type ContactRowLike,
  type ContractRowLike,
  type InsurerRegistryRowLike,
} from "./termination-letter-builder";
