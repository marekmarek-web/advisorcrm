import type { ClassificationResult } from "./document-classification";
import type { DocumentReviewEnvelope } from "./document-review-types";
import type { ExtractionRoute, PipelineNormalizedClassification } from "./pipeline-extraction-routing";

export function buildManualReviewStubEnvelope(params: {
  classification: ClassificationResult;
  inputMode: string;
  extractionMode: string;
  pageCount?: number | null;
  norm: PipelineNormalizedClassification;
  route: ExtractionRoute;
}): DocumentReviewEnvelope {
  const { classification, inputMode, extractionMode, pageCount, norm, route } = params;
  const scannedVsDigital =
    inputMode === "text_pdf"
      ? "digital"
      : inputMode === "image_document" || inputMode === "scanned_pdf" || inputMode === "mixed_pdf"
        ? "scanned"
        : "unknown";
  return {
    documentClassification: {
      primaryType: "unsupported_or_unknown",
      subtype: classification.primaryType,
      lifecycleStatus: "unknown",
      documentIntent: "manual_review_required",
      confidence: classification.confidence,
      reasons: [
        ...classification.reasons,
        `original_primary:${classification.primaryType}`,
        `normalized_pipeline:${norm}`,
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
    debug: {
      originalClassification: classification,
      inputMode,
      extractionMode,
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
