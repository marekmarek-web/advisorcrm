import { describe, expect, it, vi } from "vitest";

vi.mock("../draft-actions", () => ({
  buildAllDraftActions: () => [],
  pruneRedundantDraftActions: <T>(actions: T[]) => actions,
}));

import { formatExtractedValue, mapApiToExtractionDocument } from "../../ai-review/mappers";
import { buildAdvisorReviewViewModel } from "../../ai-review/advisor-review-view-model";
import type { DocumentReviewEnvelope } from "../document-review-types";

describe("formatExtractedValue", () => {
  it("stringifies nested objects instead of [object Object]", () => {
    const s = formatExtractedValue({ a: 1, b: "c" });
    expect(s).toContain("a");
    expect(s).not.toContain("[object Object]");
  });
});

describe("mapApiToExtractionDocument envelope path", () => {
  const emptyMatches = {
    matchedClients: [],
    matchedHouseholds: [],
    matchedDeals: [],
    matchedCompanies: [],
    matchedContracts: [],
    score: 0,
    reason: "no_match",
    ambiguityFlags: [] as string[],
  };

  const envelope = {
    documentClassification: {
      primaryType: "life_insurance_proposal" as const,
      subtype: "risk",
      lifecycleStatus: "proposal" as const,
      documentIntent: "illustrative_only" as const,
      confidence: 0.92,
      reasons: [],
    },
    documentMeta: { scannedVsDigital: "digital" as const },
    parties: { holder: { fullName: "Roman Koloburda", role: "policyholder" } },
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields: {
      totalMonthlyPremium: { value: "1537", status: "extracted" as const, confidence: 0.91 },
      variableSymbol: { value: "8801138366", status: "extracted" as const, confidence: 0.9 },
      advisorName: { value: "Marek Marek", status: "extracted" as const, confidence: 0.85 },
    },
    evidence: [],
    candidateMatches: emptyMatches,
    sectionSensitivity: {},
    relationshipInference: {
      policyholderVsInsured: [],
      childInsured: [],
      intermediaryVsClient: [],
      employerVsEmployee: [],
      companyVsPerson: [],
      bankOrLenderVsBorrower: [],
    },
    reviewWarnings: [],
    suggestedActions: [
      { type: "verify_health_section", label: "Ověřit zdravotní část", payload: {} },
    ],
    sensitivityProfile: "health_data" as const,
    contentFlags: {
      isFinalContract: false,
      isProposalOnly: true,
      containsPaymentInstructions: true,
      containsClientData: true,
      containsAdvisorData: true,
      containsMultipleDocumentSections: false,
    },
  } satisfies DocumentReviewEnvelope;

  it("does not surface documentClassification as a field group", () => {
    const doc = mapApiToExtractionDocument(
      {
        id: "1",
        fileName: "uniq.pdf",
        processingStatus: "extracted",
        reviewStatus: "pending",
        confidence: 0.9,
        extractedPayload: envelope as unknown as Record<string, unknown>,
        inputMode: "text_pdf",
        pipelineInsights: { textCoverageEstimate: 0.92 },
      },
      ""
    );
    const ids = doc.groups.map((g) => g.id);
    expect(ids).not.toContain("documentClassification");
    expect(ids).not.toContain("contentFlags");
    const flatFieldIds = doc.groups.flatMap((g) => g.fields.map((f) => f.id));
    expect(flatFieldIds.some((id) => id.startsWith("extractedFields."))).toBe(true);
  });

  it("buildAdvisorReviewViewModel surfaces Czech sensitivity line for health_data", () => {
    const vm = buildAdvisorReviewViewModel({
      envelope,
      detectedDocumentTypeLabel: "Návrh · životní pojištění",
    });
    expect(vm.healthSensitive.toLowerCase()).toContain("citliv");
    expect(vm.payments).toContain("1537");
    expect(vm.workActions.length).toBeGreaterThan(0);
  });

  it("mapApiToExtractionDocument maps advisorDocumentSummary trace to llmExecutiveBrief", () => {
    const doc = mapApiToExtractionDocument(
      {
        id: "1",
        fileName: "uniq.pdf",
        processingStatus: "extracted",
        reviewStatus: "pending",
        confidence: 0.9,
        extractedPayload: envelope as unknown as Record<string, unknown>,
        inputMode: "text_pdf",
        pipelineInsights: { textCoverageEstimate: 0.92 },
        extractionTrace: {
          advisorDocumentSummary: { text: "Stručné shrnutí dokumentu pro poradce." },
        },
      },
      ""
    );
    expect(doc.advisorReview?.llmExecutiveBrief).toBe("Stručné shrnutí dokumentu pro poradce.");
  });
});
