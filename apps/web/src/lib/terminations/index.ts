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
