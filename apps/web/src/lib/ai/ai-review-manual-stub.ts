import type { ClassificationResult } from "./document-classification";
import type { ContractDocumentType, DocumentReviewEnvelope } from "./document-review-types";
import type { ExtractionRoute, PipelineNormalizedClassification } from "./pipeline-extraction-routing";

/**
 * Builds a manual-review stub envelope that ALWAYS preserves the detected document type
 * and includes advisor notes so the review layer is never empty.
 *
 * EXTRACTION PHILOSOPHY:
 * - This stub is used when auto-extraction is not feasible (low confidence, unsupported input, etc.)
 * - It is NOT used to hide data — it preserves classification + metadata for the advisor
 * - `requiresAdvisorDecision: true` signals that the advisor must decide next steps
 * - `extractionMode: "best_effort"` is set so the UI shows this as partial, not failed
 * - auto-apply is blocked via processingStatus="review_required", NOT by hiding the stub
 */
export function buildManualReviewStubEnvelope(params: {
  classification: ClassificationResult;
  inputMode: string;
  extractionMode: string;
  pageCount?: number | null;
  norm: PipelineNormalizedClassification;
  route: ExtractionRoute;
  /** Optional advisor-facing note about why this path was taken. */
  advisorNote?: string;
}): DocumentReviewEnvelope {
  const { classification, inputMode, extractionMode, pageCount, norm, route, advisorNote } = params;
  const scannedVsDigital =
    inputMode === "text_pdf"
      ? "digital"
      : inputMode === "image_document" || inputMode === "scanned_pdf" || inputMode === "mixed_pdf"
        ? "scanned"
        : "unknown";

  // Preserve the detected primary type when it is known — do not downgrade to unsupported_or_unknown
  // unless the classifier truly returned unknown. This ensures advisors see useful classification data.
  const effectivePrimaryType: ContractDocumentType =
    classification.primaryType && classification.primaryType !== "unsupported_or_unknown"
      ? classification.primaryType
      : "unsupported_or_unknown";

  const defaultAdvisorNote =
    "Dokument je nestandardního nebo nerozpoznaného typu. Výstup extrakce je orientační — finální rozhodnutí o zápisu do systému je na poradci.";

  return {
    documentClassification: {
      primaryType: effectivePrimaryType,
      subtype: classification.subtype ?? classification.primaryType,
      lifecycleStatus: classification.lifecycleStatus ?? "unknown",
      documentIntent: classification.documentIntent ?? "manual_review_required",
      confidence: classification.confidence,
      reasons: [
        ...classification.reasons,
        `original_primary:${classification.primaryType}`,
        `normalized_pipeline:${norm}`,
        "requires_advisor_decision",
      ],
    },
    documentMeta: {
      pageCount: pageCount ?? undefined,
      scannedVsDigital,
      overallConfidence: Math.max(0.12, Math.min(1, classification.confidence * 0.55)),
      pipelineRoute: route,
      normalizedPipelineClassification: norm,
      rawPrimaryClassification: classification.primaryType,
      extractionRoute: route,
      // Signal to UI that this is a best-effort partial output, not a full extraction failure
      extractionMode: "best_effort",
    },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields: {},
    evidence: [],
    candidateMatches: {
      matchedClients: [],
      matchedHouseholds: [],
      matchedDeals: [],
      matchedCompanies: [],
      matchedContracts: [],
      score: 0,
      reason: "no_match",
      ambiguityFlags: [],
    },
    sectionSensitivity: {},
    relationshipInference: {
      policyholderVsInsured: [],
      childInsured: [],
      intermediaryVsClient: [],
      employerVsEmployee: [],
      companyVsPerson: [],
      bankOrLenderVsBorrower: [],
    },
    reviewWarnings: [
      {
        code: "manual_review_only",
        message:
          "Typ dokumentu není spolehlivě podporován pro automatickou extrakci. Ověřte obsah a doplňte údaje ručně.",
        severity: "warning",
      },
      {
        code: "requires_advisor_decision",
        message: advisorNote ?? defaultAdvisorNote,
        severity: "info",
      },
    ],
    suggestedActions: [],
    sensitivityProfile: "standard_personal_data",
    contentFlags: {
      isFinalContract: false,
      isProposalOnly: false,
      containsPaymentInstructions: false,
      containsClientData: false,
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    },
    // Advisor decision fields — consumed by UI and apply-policy
    requiresAdvisorDecision: true,
    advisorNotes: [advisorNote ?? defaultAdvisorNote],
    debug: {
      originalClassification: classification,
      inputMode,
      extractionMode,
      extractionPhilosophy: "best_effort_stub",
    },
  };
}

/** Scan/OCR did not yield enough usable text — skip LLM contract extraction; file kept for preview. */
export function buildScanOcrUnusableStubEnvelope(params: {
  classification: ClassificationResult;
  inputMode: string;
  extractionMode: string;
  pageCount?: number | null;
  norm: PipelineNormalizedClassification;
  route: ExtractionRoute;
}): DocumentReviewEnvelope {
  const base = buildManualReviewStubEnvelope(params);
  base.reviewWarnings = [
    {
      code: "scan_or_ocr_unusable",
      message:
        "Sken nebo OCR neposkytl dostatek spolehlivého textu pro automatickou extrakci. Dokument je uložen — zkontrolujte náhled a doplňte údaje ručně nebo nahrajte kvalitnější sken.",
      severity: "warning",
    },
  ];
  return base;
}
