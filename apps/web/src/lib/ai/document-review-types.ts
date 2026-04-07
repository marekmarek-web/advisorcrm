import { z } from "zod";
import type {
  PacketMeta,
  ParticipantRecord,
  InsuredRiskRecord,
  HealthQuestionnaireRecord,
  InvestmentDataRecord,
  PaymentDataRecord,
  PublishHints,
} from "./document-packet-types";

export const PRIMARY_DOCUMENT_TYPES = [
  "life_insurance_final_contract",
  "life_insurance_contract",
  "life_insurance_investment_contract",
  "life_insurance_proposal",
  "life_insurance_change_request",
  "life_insurance_modelation",
  "nonlife_insurance_contract",
  "consumer_loan_contract",
  "consumer_loan_with_payment_protection",
  "mortgage_document",
  "pension_contract",
  "investment_service_agreement",
  "investment_subscription_document",
  "investment_modelation",
  "payment_instruction",
  "investment_payment_instruction",
  "payment_schedule",
  "payslip_document",
  "income_proof_document",
  "income_confirmation",
  "corporate_tax_return",
  "self_employed_tax_or_income_document",
  "financial_analysis_document",
  "insurance_policy_change_or_service_doc",
  "bank_statement",
  "liability_insurance_offer",
  "insurance_comparison",
  "precontract_information",
  "identity_document",
  "medical_questionnaire",
  "consent_or_declaration",
  "service_agreement",
  "generic_financial_document",
  "unsupported_or_unknown",
] as const;

export type PrimaryDocumentType = (typeof PRIMARY_DOCUMENT_TYPES)[number];

export const DOCUMENT_LIFECYCLE_STATUSES = [
  "final_contract",
  "proposal",
  "offer",
  "confirmation",
  "statement",
  "annex",
  "comparison",
  "onboarding_form",
  "endorsement_request",
  "policy_change_request",
  "illustration",
  "modelation",
  "non_binding_projection",
  "payroll_statement",
  "income_proof",
  "tax_return",
  "tax_or_income_proof",
  "unknown",
] as const;

export type DocumentLifecycleStatus = (typeof DOCUMENT_LIFECYCLE_STATUSES)[number];

export const EXTRACTION_FIELD_STATUSES = [
  "extracted",
  "inferred_low_confidence",
  "missing",
  "not_found",
  "not_applicable",
  "explicitly_not_selected",
] as const;

export type ExtractionFieldStatus = (typeof EXTRACTION_FIELD_STATUSES)[number];

export const SENSITIVITY_PROFILES = [
  "standard_personal_data",
  "financial_data",
  "financial_data_high",
  "health_data",
  "special_category_data",
  "identity_document_data",
  "mixed_sensitive_document",
  "high_sensitivity_scan",
] as const;

export type SensitivityProfile = (typeof SENSITIVITY_PROFILES)[number];

export const DOCUMENT_INTENTS = [
  "creates_new_product",
  "modifies_existing_product",
  "supports_underwriting_or_bonita",
  "supports_income_verification",
  "supports_financial_analysis",
  "illustrative_only",
  "reference_only",
  "manual_review_required",
] as const;

export type DocumentIntent = (typeof DOCUMENT_INTENTS)[number];

export const SECTION_SENSITIVITY_LABELS = [
  "personal_identity_section",
  "health_section",
  "income_section",
  "payment_section",
  "investment_section",
  "contract_core_section",
  "intermediary_section",
] as const;

export type SectionSensitivityLabel = (typeof SECTION_SENSITIVITY_LABELS)[number];

export const sensitivityProfileSchema = z.enum(SENSITIVITY_PROFILES);
export const extractionFieldStatusSchema = z.enum(EXTRACTION_FIELD_STATUSES);

/**
 * How the field value was obtained. Used for source priority enforcement and advisor display.
 * Values roughly map to: "Nalezeno" (explicit*), "Odvozeno" (inferred*), "Chybí" (missing).
 */
export const EVIDENCE_TIERS = [
  "explicit_labeled_field",    // value explicitly labeled in the document (e.g., "Číslo smlouvy: 12345")
  "explicit_table_field",      // value from a structured table cell
  "explicit_section_block",    // value from a clearly identified section (e.g., "Pojistník" block)
  "normalized_alias_match",    // canonical value resolved from an LLM alias/alternate key
  "local_inference",           // inferred from nearby context (e.g., split name from fullName)
  "cross_section_inference",   // inferred by combining data across sections
  "classifier_fallback",       // produced by a classifier prompt, not an extraction prompt
  "model_inference_only",      // model guess, no explicit textual evidence
  "missing",                   // not found / not applicable
] as const;

export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

/**
 * Which part of the document the field value originated from.
 * Enforces binding rules (e.g., client data must NOT come from insurer_header).
 */
export const SOURCE_KINDS = [
  "client_block",          // Klient / Pojistník / Dlužník / Zákazník / Investor block
  "policyholder_block",    // specifically a Pojistník block
  "borrower_block",        // Dlužník / Žadatel block in loan/mortgage docs
  "owner_block",           // Vlastník / Majitel block
  "investor_block",        // Investor / Účastník block
  "intermediary_block",    // Zprostředkovatel / Poradce / Makléř block
  "insurer_header",        // pojišťovna header (valid for insurer, NOT for client fields)
  "bank_header",           // banka / věřitel header (valid for lender, NOT for client fields)
  "provider_header",       // leasingová společnost / poskytovatel header
  "signature_block",       // signature area (must NOT be source of intermediary or client)
  "payment_block",         // platební tabulka / platební instrukce
  "product_block",         // produktový blok / tarif / parametry produktu
  "contract_block",        // hlavní smluvní tabulka / blok čísla smlouvy
  "health_block",          // zdravotní dotazník (must NOT override contractual facts)
  "aml_block",             // AML / FATCA příloha
  "attachment_block",      // obecná příloha
  "parties_record",        // extracted from envelope.parties by role
  "pipeline_normalized",   // set by alias normalization / pipeline post-processing
  "unknown",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * Human-friendly display label for an evidence tier (advisor-facing, no debug vocabulary).
 */
export function evidenceTierDisplayLabel(tier: EvidenceTier | undefined): "Nalezeno" | "Odvozeno" | "Chybí" {
  if (!tier || tier === "missing") return "Chybí";
  if (
    tier === "explicit_labeled_field" ||
    tier === "explicit_table_field" ||
    tier === "explicit_section_block" ||
    tier === "normalized_alias_match"
  ) return "Nalezeno";
  return "Odvozeno";
}

/**
 * Human-friendly source display for advisor panels (no debug vocabulary).
 */
export function sourceKindDisplayLabel(kind: SourceKind | undefined): string {
  if (!kind) return "";
  const MAP: Record<SourceKind, string> = {
    client_block: "z bloku Klient",
    policyholder_block: "z bloku Pojistník",
    borrower_block: "z bloku Dlužník",
    owner_block: "z bloku Vlastník",
    investor_block: "z bloku Investor",
    intermediary_block: "z bloku Zprostředkovatel",
    insurer_header: "z hlavičky pojišťovny",
    bank_header: "z hlavičky banky",
    provider_header: "z hlavičky poskytovatele",
    signature_block: "z podpisového bloku",
    payment_block: "z tabulky plateb",
    product_block: "z produktového bloku",
    contract_block: "ze smluvní tabulky",
    health_block: "ze zdravotního dotazníku",
    aml_block: "z AML přílohy",
    attachment_block: "z přílohy",
    parties_record: "ze seznamu účastníků",
    pipeline_normalized: "odvozeno z kontextu",
    unknown: "",
  };
  return MAP[kind] ?? "";
}

export const extractedFieldSchema = z.object({
  value: z.unknown().optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourcePage: z.number().int().positive().optional(),
  evidenceSnippet: z.string().max(400).optional(),
  status: extractionFieldStatusSchema,
  sensitive: z.boolean().optional(),
  /** How the field value was obtained — used for source priority and advisor display. */
  evidenceTier: z.enum(EVIDENCE_TIERS).optional(),
  /** Which part of the document the value originated from. */
  sourceKind: z.enum(SOURCE_KINDS).optional(),
  /** Human-readable label of the source section (e.g., "Pojistník", "Tabulka plateb"). */
  sourceLabel: z.string().max(120).optional(),
});

export type ExtractedField = z.infer<typeof extractedFieldSchema>;

export const documentClassificationSchema = z.object({
  primaryType: z.enum(PRIMARY_DOCUMENT_TYPES),
  subtype: z.string().min(1).max(120).optional(),
  lifecycleStatus: z.enum(DOCUMENT_LIFECYCLE_STATUSES),
  documentIntent: z.enum(DOCUMENT_INTENTS).default("reference_only"),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).default([]),
});

export type DocumentClassification = z.infer<typeof documentClassificationSchema>;

export const fieldEvidenceSchema = z.object({
  fieldKey: z.string().min(1),
  value: z.unknown().optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourcePage: z.number().int().positive().optional(),
  evidenceSnippet: z.string().max(400).optional(),
  status: extractionFieldStatusSchema,
  evidenceTier: z.enum(EVIDENCE_TIERS).optional(),
  sourceKind: z.enum(SOURCE_KINDS).optional(),
  sourceLabel: z.string().max(120).optional(),
});

export type FieldEvidence = z.infer<typeof fieldEvidenceSchema>;

export const candidateMatchSchema = z.object({
  entityId: z.string(),
  score: z.number().min(0).max(1),
  reason: z.string(),
  ambiguous: z.boolean().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export type CandidateMatch = z.infer<typeof candidateMatchSchema>;

export const candidateMatchesEnvelopeSchema = z.object({
  matchedClients: z.array(candidateMatchSchema).default([]),
  matchedHouseholds: z.array(candidateMatchSchema).default([]),
  matchedDeals: z.array(candidateMatchSchema).default([]),
  matchedCompanies: z.array(candidateMatchSchema).default([]),
  matchedContracts: z.array(candidateMatchSchema).default([]),
  score: z.number().min(0).max(1).default(0),
  reason: z.string().default("no_match"),
  ambiguityFlags: z.array(z.string()).default([]),
});

export type CandidateMatchesEnvelope = z.infer<typeof candidateMatchesEnvelopeSchema>;

export const reviewWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
});

export type ReviewWarning = z.infer<typeof reviewWarningSchema>;

export const suggestedActionSchema = z.object({
  type: z.string(),
  label: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type SuggestedAction = z.infer<typeof suggestedActionSchema>;

export const dataCompletenessSchema = z.object({
  requiredTotal: z.number().int().nonnegative(),
  requiredSatisfied: z.number().int().nonnegative(),
  optionalExtracted: z.number().int().nonnegative(),
  conditionalSatisfied: z.number().int().nonnegative().optional(),
  notApplicableCount: z.number().int().nonnegative().default(0),
  score: z.number().min(0).max(1),
});

export type DataCompleteness = z.infer<typeof dataCompletenessSchema>;

export const documentReviewEnvelopeSchema = z.object({
  documentClassification: documentClassificationSchema,
  documentMeta: z.object({
    fileName: z.string().optional(),
    pageCount: z.number().int().positive().optional(),
    issuer: z.string().optional(),
    documentDate: z.string().optional(),
    language: z.string().optional(),
    scannedVsDigital: z.enum(["scanned", "digital", "unknown"]).default("unknown"),
    overallConfidence: z.number().min(0).max(1).optional(),
    /** Pipeline branch: contract_intake | payment_instructions | supporting_document | manual_review_only */
    pipelineRoute: z.string().optional(),
    preprocessMode: z.string().optional(),
    preprocessStatus: z.string().optional(),
    normalizedPipelineClassification: z.string().optional(),
    rawPrimaryClassification: z.string().optional(),
    textCoverageEstimate: z.number().min(0).max(1).optional(),
    extractionRoute: z.string().optional(),
    /** Extraction mode used: "specialized" | "best_effort" | "partial". Set on all outputs. */
    extractionMode: z.string().optional(),
  }),
  parties: z.record(z.string(), z.unknown()).default({}),
  productsOrObligations: z.array(z.record(z.string(), z.unknown())).default([]),
  financialTerms: z.record(z.string(), z.unknown()).default({}),
  serviceTerms: z.record(z.string(), z.unknown()).default({}),
  extractedFields: z.record(z.string(), extractedFieldSchema).default({}),
  evidence: z.array(fieldEvidenceSchema).default([]),
  candidateMatches: candidateMatchesEnvelopeSchema.default({
    matchedClients: [],
    matchedHouseholds: [],
    matchedDeals: [],
    matchedCompanies: [],
    matchedContracts: [],
    score: 0,
    reason: "no_match",
    ambiguityFlags: [],
  }),
  sectionSensitivity: z.record(z.string(), z.enum(SENSITIVITY_PROFILES)).default({}),
  relationshipInference: z
    .object({
      policyholderVsInsured: z.array(z.record(z.string(), z.unknown())).default([]),
      childInsured: z.array(z.record(z.string(), z.unknown())).default([]),
      intermediaryVsClient: z.array(z.record(z.string(), z.unknown())).default([]),
      employerVsEmployee: z.array(z.record(z.string(), z.unknown())).default([]),
      companyVsPerson: z.array(z.record(z.string(), z.unknown())).default([]),
      bankOrLenderVsBorrower: z.array(z.record(z.string(), z.unknown())).default([]),
    })
    .default({
      policyholderVsInsured: [],
      childInsured: [],
      intermediaryVsClient: [],
      employerVsEmployee: [],
      companyVsPerson: [],
      bankOrLenderVsBorrower: [],
    }),
  reviewWarnings: z.array(reviewWarningSchema).default([]),
  suggestedActions: z.array(suggestedActionSchema).default([]),
  dataCompleteness: dataCompletenessSchema.optional(),
  sensitivityProfile: sensitivityProfileSchema.default("standard_personal_data"),
  contentFlags: z.object({
    isFinalContract: z.boolean().default(false),
    isProposalOnly: z.boolean().default(false),
    containsPaymentInstructions: z.boolean().default(false),
    containsClientData: z.boolean().default(false),
    containsAdvisorData: z.boolean().default(false),
    containsMultipleDocumentSections: z.boolean().default(false),
  }).default({
    isFinalContract: false,
    isProposalOnly: false,
    containsPaymentInstructions: false,
    containsClientData: false,
    containsAdvisorData: false,
    containsMultipleDocumentSections: false,
  }),
  debug: z.record(z.string(), z.unknown()).optional(),
});

export type DocumentReviewEnvelope = z.infer<typeof documentReviewEnvelopeSchema> & {
  /**
   * Extraction philosophy fields — set on all partial/stub outputs.
   *
   * ADVISOR DECISION RULE: When `requiresAdvisorDecision` is true, the advisor decides
   * whether to save as supporting document, partially apply, or ignore.
   * Auto-apply is blocked; the review layer always produces non-empty output.
   */
  requiresAdvisorDecision?: boolean;
  advisorNotes?: string[];
  /**
   * Phase 2 — Packet segmentation metadata.
   * Present when the upload was identified as a multi-document bundle.
   */
  packetMeta?: PacketMeta | null;
  /**
   * Phase 3 — Structured participant list (canonical, per-person).
   * Supplements the flat extractedFields and generic parties record.
   */
  participants?: ParticipantRecord[] | null;
  /**
   * Phase 3 — Structured insured risks per participant.
   * Supplements the flat coverages/insuredRisks extractedFields.
   */
  insuredRisks?: InsuredRiskRecord[] | null;
  /**
   * Phase 3 — Health questionnaire sections detected in the packet.
   */
  healthQuestionnaires?: HealthQuestionnaireRecord[] | null;
  /**
   * Phase 3 — Structured investment data.
   */
  investmentData?: InvestmentDataRecord | null;
  /**
   * Phase 3 — Structured payment data.
   */
  paymentData?: PaymentDataRecord | null;
  /**
   * Phase 3 — Publishing guidance derived from type, lifecycle and packet content.
   */
  publishHints?: PublishHints | null;
};

