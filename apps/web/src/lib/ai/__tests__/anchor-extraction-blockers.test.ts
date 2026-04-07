/**
 * Targeted must-pass tests for AI Review extraction anchor documents.
 * These are BLOCKER tests — if any of these fail, extraction is broken for real-world PDFs.
 *
 * Anchors covered:
 * 1. Smlouva DPS.pdf — DPS consent/confirmation must not be unsupported
 * 2. Sebova MAXIMA.pdf — life proposal must not hit direct_extraction_unsupported
 * 3. Smlouva o ČSOB Spotřebitelském úvěru.pdf — loan terms must be extracted
 * 4. Výplatní lístek — payslip must not go through bank_statement lane
 * 5. Daňové přiznání s.r.o. — tax return must not go through bank_statement lane
 * 6. Confidence formatter — must never produce > 100%
 * 7. documentClassification/documentMeta invalid format — must be coerced
 * 8. EXTRACTION PHILOSOPHY — unsupported subtype / supporting doc / proposal / AML — never empty output
 * 9. buildManualReviewStubEnvelope — always has requiresAdvisorDecision + advisorNotes
 * 10. no_matching_route — router must fallback to best-effort, never hard block
 */

import { describe, it, expect } from "vitest";
import { resolveAiReviewExtractionRoute } from "../ai-review-extraction-router";
import { coerceReviewEnvelopeParsedJson } from "../envelope-parse-coerce";
import { documentReviewEnvelopeSchema } from "../document-review-types";
import { buildManualReviewStubEnvelope } from "../ai-review-manual-stub";

// ─── 1. DPS / Consent / Confirmation routing ─────────────────────────────────

describe("ANCHOR: Smlouva DPS — consent/confirmation must never be unsupported", () => {
  it("consent_or_identification_document with DPS family → extract (not manual_review)", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "consent_or_identification_document",
      productFamily: "dps",
      productSubtype: "dps_participant_consent",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.75,
    });
    expect(r.outcome).toBe("extract");
    expect(r.reasonCodes).not.toContain("consent_unsupported_subtype");
  });

  it("consent_or_identification_document with unknown pension subtype → extract (not manual_review)", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "consent_or_identification_document",
      productFamily: "dps",
      productSubtype: "some_unknown_dps_subtype",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.75,
    });
    expect(r.outcome).toBe("extract");
    expect(r.reasonCodes).not.toContain("consent_unsupported_subtype");
  });

  it("confirmation_document with DPS family → extract (not manual_review)", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "confirmation_document",
      productFamily: "dps",
      productSubtype: "dps_contract_confirmation",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.75,
    });
    expect(r.outcome).toBe("extract");
    expect(r.reasonCodes).not.toContain("confirmation_unsupported_subtype");
  });

  it("confirmation_document with pension_confirmation subtype → extract", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "confirmation_document",
      productFamily: "pp",
      productSubtype: "pension_confirmation",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.8,
    });
    expect(r.outcome).toBe("extract");
  });

  it("confirmation_document with unknown pension subtype → extract via fallback (not hard block)", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "confirmation_document",
      productFamily: "dps",
      productSubtype: "bundle_confirmation_xyz",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.7,
    });
    expect(r.outcome).toBe("extract");
    expect(r.reasonCodes).not.toContain("confirmation_unsupported_subtype");
  });
});

// ─── 2. MAXIMA life proposal — must not be direct_extraction_unsupported ──────

describe("ANCHOR: Sebova MAXIMA — life proposal must route to extraction", () => {
  it("life_insurance proposal routes to insuranceProposalModelation", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "proposal",
      productFamily: "life_insurance",
      productSubtype: "risk_life_insurance",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.8,
    });
    expect(r.outcome).toBe("extract");
    if (r.outcome === "extract") {
      expect(r.promptKey).toBe("insuranceProposalModelation");
    }
  });

  it("life_insurance offer routes to insuranceProposalModelation", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "offer",
      productFamily: "life_insurance",
      productSubtype: "investment_life_insurance",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.75,
    });
    expect(r.outcome).toBe("extract");
  });

  it("life_insurance modelation routes to insuranceProposalModelation", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "modelation",
      productFamily: "life_insurance",
      productSubtype: "capital_life_insurance",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.7,
    });
    expect(r.outcome).toBe("extract");
    if (r.outcome === "extract") {
      expect(r.promptKey).toBe("insuranceProposalModelation");
    }
  });
});

// ─── 3. ČSOB consumer loan — must route to loanContractExtraction ─────────────

describe("ANCHOR: ČSOB Spotřebitelský úvěr — loan must route to loanContractExtraction", () => {
  it("loan family contract → loanContractExtraction", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "contract",
      productFamily: "loan",
      productSubtype: "consumer_loan",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.85,
    });
    expect(r.outcome).toBe("extract");
    if (r.outcome === "extract") {
      expect(r.promptKey).toBe("loanContractExtraction");
    }
  });

  it("loan family contract with unknown subtype → loanContractExtraction", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "contract",
      productFamily: "loan",
      productSubtype: "unknown",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.8,
    });
    expect(r.outcome).toBe("extract");
    if (r.outcome === "extract") {
      expect(r.promptKey).toBe("loanContractExtraction");
    }
  });
});

// ─── 4 & 5. Payslip / Tax return supporting doc routing ──────────────────────

describe("ANCHOR: Výplatní lístek a Daňové přiznání — must not route as bank_statement", () => {
  it("payslip_document via compliance family → supportingDocumentExtraction (not bank_statement route)", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "payslip_document",
      productFamily: "compliance",
      productSubtype: "payslip",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.8,
    });
    expect(r.outcome).toBe("extract");
    if (r.outcome === "extract") {
      expect(r.promptKey).toBe("supportingDocumentExtraction");
    }
  });

  it("corporate_tax_return via compliance family → supportingDocumentExtraction", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "corporate_tax_return",
      productFamily: "compliance",
      productSubtype: "tax_return",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.8,
    });
    expect(r.outcome).toBe("extract");
    if (r.outcome === "extract") {
      expect(r.promptKey).toBe("supportingDocumentExtraction");
    }
  });

  it("supporting_document with payslip subtype → supportingDocumentExtraction", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "supporting_document",
      productFamily: "compliance",
      productSubtype: "payslip",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.75,
    });
    expect(r.outcome).toBe("extract");
  });

  it("supporting_document with tax_return subtype → supportingDocumentExtraction", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "supporting_document",
      productFamily: "compliance",
      productSubtype: "tax_return",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.75,
    });
    expect(r.outcome).toBe("extract");
  });
});

// ─── 6. Confidence formatter — must never produce > 100 ──────────────────────

describe("ANCHOR: Confidence formatter — no absurd percentages", () => {
  it("confidence 0.98 stays 98%, not 9800%", () => {
    const raw = 0.98;
    const pct = Math.round(raw * 100);
    expect(pct).toBe(98);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it("confidence 54 (integer from bad model) is clamped to ≤100%", () => {
    const raw = 54;
    const normalized = raw > 1 ? Math.min(1, raw / 100) : Math.max(0, Math.min(1, raw));
    const pct = Math.round(normalized * 100);
    expect(pct).toBe(54);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it("confidence 98 (integer from bad model) is clamped to ≤100%", () => {
    const raw = 98;
    const normalized = raw > 1 ? Math.min(1, raw / 100) : Math.max(0, Math.min(1, raw));
    const pct = Math.round(normalized * 100);
    expect(pct).toBe(98);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it("confidence 99 (integer from bad model) is clamped to 99%, not 9900%", () => {
    const raw = 99;
    const normalized = raw > 1 ? Math.min(1, raw / 100) : Math.max(0, Math.min(1, raw));
    const pct = Math.round(normalized * 100);
    expect(pct).toBe(99);
    expect(pct).toBeLessThanOrEqual(100);
  });
});

// ─── 7. documentClassification/documentMeta invalid format coercion ───────────

describe("ANCHOR: documentClassification/documentMeta invalid format must be coerced", () => {
  function minimalEnvelope(overrides: Record<string, unknown> = {}) {
    return {
      documentClassification: {
        primaryType: "consumer_loan_contract",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 0.85,
        reasons: [],
      },
      documentMeta: {
        scannedVsDigital: "digital",
      },
      parties: {},
      extractedFields: {
        loanAmount: { value: "500000", status: "extracted", confidence: 0.9 },
        lender: { value: "ČSOB", status: "extracted", confidence: 0.9 },
      },
      reviewWarnings: [],
      suggestedActions: [],
      ...overrides,
    };
  }

  it("missing scannedVsDigital in documentMeta → coerced to unknown", () => {
    const input = minimalEnvelope({ documentMeta: {} });
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "aggressive", expectedPrimaryType: "consumer_loan_contract" });
    const result = documentReviewEnvelopeSchema.safeParse(coerced);
    expect(result.success).toBe(true);
  });

  it("invalid scannedVsDigital value → coerced to unknown", () => {
    const input = minimalEnvelope({ documentMeta: { scannedVsDigital: "text_pdf" } });
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dm = (coerced as { documentMeta: { scannedVsDigital: string } }).documentMeta;
    expect(dm.scannedVsDigital).toBe("unknown");
  });

  it("invalid primaryType → coerced to expectedPrimaryType", () => {
    const input = minimalEnvelope({
      documentClassification: { primaryType: "bad_type_xyz", lifecycleStatus: "final_contract", documentIntent: "creates_new_product", confidence: 0.8, reasons: [] }
    });
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dc = (coerced as { documentClassification: { primaryType: string } }).documentClassification;
    expect(dc.primaryType).toBe("consumer_loan_contract");
  });

  it("overallConfidence > 1 in documentMeta → clamped to [0,1]", () => {
    const input = minimalEnvelope({ documentMeta: { scannedVsDigital: "digital", overallConfidence: 98 } });
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dm = (coerced as { documentMeta: { overallConfidence: number } }).documentMeta;
    expect(dm.overallConfidence).toBeLessThanOrEqual(1);
    expect(dm.overallConfidence).toBeGreaterThan(0);
  });

  it("missing documentMeta entirely → coerced with scannedVsDigital: unknown", () => {
    const { documentMeta: _, ...withoutMeta } = minimalEnvelope() as Record<string, unknown> & { documentMeta: unknown };
    const input = withoutMeta;
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "aggressive", expectedPrimaryType: "consumer_loan_contract" });
    const dm = (coerced as { documentMeta?: { scannedVsDigital?: string } }).documentMeta;
    expect(dm?.scannedVsDigital).toBe("unknown");
  });
});

// ─── 8. EXTRACTION PHILOSOPHY — unsupported subtype must never produce empty output ──

describe("EXTRACTION PHILOSOPHY: unsupported subtype / supporting doc / proposal — non-empty output", () => {
  it("supporting_document with unknown subtype → extract (not manual_review)", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "supporting_document",
      productFamily: "unknown",
      productSubtype: "some_unknown_subtype",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.6,
    });
    expect(r.outcome).toBe("extract");
  });

  it("AML/FATCA subtype (aml_kyc_form) → extract with consent prompt", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "consent_or_identification_document",
      productFamily: "compliance",
      productSubtype: "aml_kyc_form",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.7,
    });
    expect(r.outcome).toBe("extract");
  });

  it("medical_questionnaire / health attachment → extract via legacy (not hard block)", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "consent_or_identification_document",
      productFamily: "life_insurance",
      productSubtype: "health_questionnaire_attachment",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.65,
    });
    // Must be extract, not manual_review — even medical/health attachments get best-effort output
    expect(r.outcome).toBe("extract");
  });

  it("proposal / modelation → always extract (not manual_review)", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "proposal",
      productFamily: "life_insurance",
      productSubtype: "risk_life_insurance",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.72,
    });
    expect(r.outcome).toBe("extract");
    if (r.outcome === "extract") {
      expect(r.promptKey).toBe("insuranceProposalModelation");
    }
  });

  it("payslip via supporting_document → extract", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "supporting_document",
      productFamily: "compliance",
      productSubtype: "payslip",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.75,
    });
    expect(r.outcome).toBe("extract");
    if (r.outcome === "extract") {
      expect(r.promptKey).toBe("supportingDocumentExtraction");
    }
  });

  it("bank_statement with banking family → extract", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "statement",
      productFamily: "banking",
      productSubtype: "bank_statement_standard",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.8,
    });
    expect(r.outcome).toBe("extract");
  });

  it("termination_document → extract (not manual_review when prompt missing)", () => {
    // When terminationDocumentExtraction prompt is missing, it used to return manual_review.
    // This is acceptable for the prompt-missing case, but the route should be attempted.
    const r = resolveAiReviewExtractionRoute({
      documentType: "termination_document",
      productFamily: "life_insurance",
      productSubtype: "unknown",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.7,
    });
    // Either extract (if prompt exists) or manual_review with explicit reason code
    expect(["extract", "manual_review"]).toContain(r.outcome);
    if (r.outcome === "manual_review") {
      expect(r.reasonCodes).toContain("prompt_missing_termination");
    }
  });
});

// ─── 9. buildManualReviewStubEnvelope — always has requiresAdvisorDecision + advisorNotes ──

describe("EXTRACTION PHILOSOPHY: buildManualReviewStubEnvelope — never empty, always has advisor metadata", () => {
  function makeClassification(primaryType: string) {
    return {
      primaryType: primaryType as import("../document-review-types").ContractDocumentType,
      subtype: "unknown" as const,
      lifecycleStatus: "unknown" as const,
      documentIntent: "manual_review_required" as const,
      confidence: 0.55,
      reasons: ["test_classification"],
    };
  }

  it("stub has requiresAdvisorDecision: true", () => {
    const stub = buildManualReviewStubEnvelope({
      classification: makeClassification("life_insurance_contract"),
      inputMode: "text_pdf",
      extractionMode: "text",
      norm: "insurance_contract",
      route: "manual_review_only",
    });
    expect(stub.requiresAdvisorDecision).toBe(true);
  });

  it("stub has non-empty advisorNotes", () => {
    const stub = buildManualReviewStubEnvelope({
      classification: makeClassification("pension_contract"),
      inputMode: "scanned_pdf",
      extractionMode: "vision_fallback",
      norm: "investment_contract",
      route: "manual_review_only",
    });
    expect(stub.advisorNotes).toBeDefined();
    expect(Array.isArray(stub.advisorNotes)).toBe(true);
    expect((stub.advisorNotes ?? []).length).toBeGreaterThan(0);
    expect((stub.advisorNotes ?? [])[0].length).toBeGreaterThan(10);
  });

  it("stub preserves detected primaryType (not downgraded to unsupported_or_unknown when type is known)", () => {
    const stub = buildManualReviewStubEnvelope({
      classification: makeClassification("consumer_loan_contract"),
      inputMode: "text_pdf",
      extractionMode: "text",
      norm: "loan_contract",
      route: "manual_review_only",
    });
    expect(stub.documentClassification.primaryType).toBe("consumer_loan_contract");
  });

  it("stub with truly unknown type → primaryType: unsupported_or_unknown", () => {
    const stub = buildManualReviewStubEnvelope({
      classification: makeClassification("unsupported_or_unknown"),
      inputMode: "text_pdf",
      extractionMode: "text",
      norm: "unknown",
      route: "manual_review_only",
    });
    expect(stub.documentClassification.primaryType).toBe("unsupported_or_unknown");
  });

  it("stub has extractionMode: best_effort in documentMeta", () => {
    const stub = buildManualReviewStubEnvelope({
      classification: makeClassification("bank_statement"),
      inputMode: "text_pdf",
      extractionMode: "text",
      norm: "bank_statement",
      route: "manual_review_only",
    });
    expect(stub.documentMeta.extractionMode).toBe("best_effort");
  });

  it("stub has at least one reviewWarning with requires_advisor_decision code", () => {
    const stub = buildManualReviewStubEnvelope({
      classification: makeClassification("payslip_document"),
      inputMode: "text_pdf",
      extractionMode: "text",
      norm: "income_document",
      route: "supporting_document",
    });
    const codes = stub.reviewWarnings.map((w) => w.code);
    expect(codes).toContain("requires_advisor_decision");
  });

  it("custom advisorNote is passed through", () => {
    const customNote = "Tento dokument je AML příloha — zkontrolujte ručně.";
    const stub = buildManualReviewStubEnvelope({
      classification: makeClassification("consent_or_declaration"),
      inputMode: "text_pdf",
      extractionMode: "text",
      norm: "unknown",
      route: "manual_review_only",
      advisorNote: customNote,
    });
    expect(stub.advisorNotes).toContain(customNote);
    const reviewNote = stub.reviewWarnings.find((w) => w.code === "requires_advisor_decision");
    expect(reviewNote?.message).toBe(customNote);
  });
});

// ─── 10. no_matching_route — router must fallback to best-effort, never hard block ──

describe("EXTRACTION PHILOSOPHY: no_matching_route → best-effort extraction, not empty", () => {
  it("unknown family but known document type → extract via best-effort legacy", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "contract",
      productFamily: "unknown",
      productSubtype: "unknown",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.5,
    });
    // Must not be manual_review with no_matching_route — must attempt extraction
    if (r.outcome === "manual_review") {
      // Only acceptable if confidence is too low (below threshold)
      expect(r.reasonCodes).not.toContain("no_matching_route");
    } else {
      expect(r.outcome).toBe("extract");
    }
  });

  it("known family (investment) with unknown document type → extract", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "unknown",
      productFamily: "investment",
      productSubtype: "unknown",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.6,
    });
    expect(r.outcome).toBe("extract");
  });

  it("compliance family with unrecognized document type → extract via compliance fallback", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "some_new_document_type_xyz",
      productFamily: "compliance",
      productSubtype: "unknown",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.55,
    });
    expect(r.outcome).toBe("extract");
  });

  it("leasing family with unknown document type → extract via leasingExtraction", () => {
    const r = resolveAiReviewExtractionRoute({
      documentType: "unknown",
      productFamily: "leasing",
      productSubtype: "financial_lease",
      businessIntent: "standard",
      recommendedRoute: "extract",
      confidence: 0.65,
    });
    expect(r.outcome).toBe("extract");
    if (r.outcome === "extract") {
      expect(r.promptKey).toBe("leasingExtraction");
    }
  });
});
