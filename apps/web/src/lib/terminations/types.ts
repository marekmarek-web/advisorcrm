/**
 * AI Výpověď smlouvy – veřejné typy pro lib/terminations.
 * Vše je čistě TypeScript, bez závislostí na Drizzle nebo Next.js.
 */

import type {
  TerminationMode,
  TerminationReasonCode,
  TerminationRequestStatus,
  TerminationRequestSource,
  TerminationDeliveryChannel,
  TerminationDefaultDateComputation,
} from "../db/schema-for-client";

// Re-export pro pohodlí konzumentů modulu
export type {
  TerminationMode,
  TerminationReasonCode,
  TerminationRequestStatus,
  TerminationRequestSource,
  TerminationDeliveryChannel,
  TerminationDefaultDateComputation,
};

// ---------------------------------------------------------------------------
// Vstup pro rules engine
// ---------------------------------------------------------------------------

/** Data z CRM (existující smlouva). */
export interface TerminationCrmInput {
  source: "crm_contract";
  contractId: string;
  contactId: string;
  advisorId: string;
  contractNumber: string;
  productSegment: string;
  insurerName: string;
  contractStartDate: string | null;
  contractAnniversaryDate: string | null;
  /** Datum požadovaný poradcem / klientem; může být null při prvotním spuštění. */
  requestedEffectiveDate: string | null;
  terminationMode: TerminationMode;
  terminationReasonCode: TerminationReasonCode;
  /** Volitelný odkaz na zdroj – dokument, konverzace. */
  sourceDocumentId?: string | null;
  sourceConversationId?: string | null;
}

/** Data z externího / manuálního intaku (bez CRM smlouvy). */
export interface TerminationManualInput {
  source: "manual_intake" | "quick_action" | "ai_chat";
  /** Může být null, když klient ještě není v CRM. */
  contactId: string | null;
  advisorId: string;
  contractNumber: string | null;
  productSegment: string | null;
  insurerName: string;
  contractStartDate: string | null;
  contractAnniversaryDate: string | null;
  requestedEffectiveDate: string | null;
  terminationMode: TerminationMode;
  terminationReasonCode: TerminationReasonCode;
  sourceDocumentId?: string | null;
  sourceConversationId?: string | null;
}

export type TerminationRulesInput = TerminationCrmInput | TerminationManualInput;

// ---------------------------------------------------------------------------
// Katalogové záznamy (vrací catalog.ts; neobsahují Drizzle inference types)
// ---------------------------------------------------------------------------

export interface InsurerRegistryRow {
  id: string;
  catalogKey: string;
  insurerName: string;
  aliases: string[];
  supportedSegments: string[];
  mailingAddress: Record<string, unknown> | null;
  email: string | null;
  dataBox: string | null;
  webFormUrl: string | null;
  clientPortalUrl: string | null;
  freeformLetterAllowed: boolean;
  requiresOfficialForm: boolean;
  officialFormName: string | null;
  officialFormStoragePath: string | null;
  officialFormNotes: string | null;
  allowedChannels: string[];
  ruleOverrides: Record<string, unknown>;
  attachmentRules: Record<string, unknown>;
  registryNeedsVerification: boolean;
}

export interface ReasonCatalogRow {
  id: string;
  reasonCode: string;
  labelCs: string;
  supportedSegments: string[];
  defaultDateComputation: TerminationDefaultDateComputation;
  requiredFields: string[];
  attachmentRequired: boolean;
  alwaysReview: boolean;
  instructions: string | null;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Výstup rules engine
// ---------------------------------------------------------------------------

/** Jedno chybějící / problémové pole, které wizard musí doplnit. */
export interface TerminationMissingField {
  field: string;
  labelCs: string;
}

/** Požadavek na přílohu vyhodnocený rules enginem. */
export interface TerminationAttachmentRequirement {
  requirementCode: string;
  label: string;
  required: boolean;
}

/** Stav výstupu rules engine – 3 hladiny. */
export type TerminationRulesOutcome =
  | "ready"           // vše OK, lze generovat dokument
  | "awaiting_data"   // chybí vstupní data, wizard je musí vyžádat
  | "review_required" // data jsou, ale lidské posouzení je nutné
  | "hard_fail";      // technicky nelze pokračovat (např. datum již uplynulo)

export interface TerminationRulesResult {
  outcome: TerminationRulesOutcome;

  /** Null pokud outcome = hard_fail. */
  computedEffectiveDate: string | null;

  freeformLetterAllowed: boolean;
  requiresOfficialForm: boolean;
  requiredAttachments: TerminationAttachmentRequirement[];

  /** Výchozí kanál doručení dle registru pojišťovny. */
  defaultDeliveryChannel: TerminationDeliveryChannel;

  /** Mapovaný insurer registry záznam (null = pojistitel neznámý). */
  insurerRegistryId: string | null;
  insurerRegistryNeedsVerification: boolean;

  /** Mapovaný reason catalog ID. */
  reasonCatalogId: string | null;

  missingFields: TerminationMissingField[];
  reviewRequiredReason: string | null;

  /** 0–1 jistota automatického výsledku; null pokud nelze určit. */
  confidence: number | null;

  /** Diagnostické zápisky (neposílat do UI). */
  _debug?: string[];
}
