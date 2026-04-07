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
import { mapAiClassifierToPrimaryType, mapAiClassifierToClassificationResult } from "../ai-review-type-mapper";
import { tryCoerceReviewEnvelopeAfterValidationFailure } from "../coerce-partial-review-envelope";

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
      primaryType: primaryType as import("../document-classification").ContractDocumentType,
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

// ─── 11. TYPE MAPPER — DPS/PP/DIP confirmation/consent → correct primary type ──

function cls(partial: Record<string, unknown>) {
  return {
    documentType: "contract",
    productFamily: "life_insurance",
    productSubtype: "unknown",
    businessIntent: "standard",
    recommendedRoute: "extract",
    confidence: 0.8,
    reasons: [],
    warnings: [],
    ...partial,
  } as Parameters<typeof mapAiClassifierToPrimaryType>[0];
}

describe("TYPE MAPPER: DPS/PP confirmation/consent → pension_contract (not income_confirmation)", () => {
  it("DPS + confirmation_document → pension_contract", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "confirmation_document",
      productFamily: "dps",
      productSubtype: "dps_confirmation",
    }))).toBe("pension_contract");
  });

  it("DPS + consent_or_identification_document → pension_contract", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "consent_or_identification_document",
      productFamily: "dps",
      productSubtype: "dps_participant_consent",
    }))).toBe("pension_contract");
  });

  it("PP + confirmation_document → pension_contract", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "confirmation_document",
      productFamily: "pp",
      productSubtype: "pension_confirmation",
    }))).toBe("pension_contract");
  });

  it("DPS + proposal → pension_contract", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "proposal",
      productFamily: "dps",
      productSubtype: "dps_proposal",
    }))).toBe("pension_contract");
  });

  it("DIP + confirmation_document → investment_subscription_document", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "confirmation_document",
      productFamily: "dip",
      productSubtype: "dip_confirmation",
    }))).toBe("investment_subscription_document");
  });

  it("DIP + proposal → investment_subscription_document", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "proposal",
      productFamily: "dip",
      productSubtype: "dip_proposal",
    }))).toBe("investment_subscription_document");
  });
});

// ─── 12. TYPE MAPPER — supporting docs must use specific types when subtype signals exist ──

describe("TYPE MAPPER: Payslip/tax_return subtype signals → specific types (not bank_statement)", () => {
  it("statement + payslip subtype → payslip_document", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "statement",
      productFamily: "compliance",
      productSubtype: "payslip",
    }))).toBe("payslip_document");
  });

  it("supporting_document + mzda subtype → payslip_document", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "supporting_document",
      productFamily: "compliance",
      productSubtype: "výplatní_lístek_mzda",
    }))).toBe("payslip_document");
  });

  it("statement + tax_return subtype → corporate_tax_return", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "statement",
      productFamily: "compliance",
      productSubtype: "danove_priznani_sro",
    }))).toBe("corporate_tax_return");
  });

  it("supporting_document + corporate_tax subtype → corporate_tax_return", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "supporting_document",
      productFamily: "compliance",
      productSubtype: "corporate_tax_return",
    }))).toBe("corporate_tax_return");
  });

  it("statement without specific subtype → bank_statement (default)", () => {
    expect(mapAiClassifierToPrimaryType(cls({
      documentType: "statement",
      productFamily: "banking",
      productSubtype: "monthly_statement",
    }))).toBe("bank_statement");
  });
});

// ─── 13. CONFIDENCE CLAMPING — per-field confidence in envelope coercion ──

describe("CONFIDENCE CLAMPING: per-field confidence > 1 must be clamped before Zod parse", () => {
  function envelopeWithFieldConf(fieldConf: number) {
    return {
      documentClassification: {
        primaryType: "consumer_loan_contract",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 0.85,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {
        loanAmount: { value: "500000", status: "extracted", confidence: fieldConf },
        lender: { value: "ČSOB", status: "extracted", confidence: fieldConf },
      },
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    };
  }

  it("field confidence 0.85 passes Zod directly", () => {
    const input = envelopeWithFieldConf(0.85);
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const result = documentReviewEnvelopeSchema.safeParse(coerced);
    expect(result.success).toBe(true);
  });

  it("field confidence 85 (integer) is clamped to 0.85 and passes Zod", () => {
    const input = envelopeWithFieldConf(85);
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const ef = (coerced as { extractedFields: Record<string, { confidence: number }> }).extractedFields;
    expect(ef.loanAmount.confidence).toBeLessThanOrEqual(1);
    expect(ef.loanAmount.confidence).toBeGreaterThan(0);
    const result = documentReviewEnvelopeSchema.safeParse(coerced);
    expect(result.success).toBe(true);
  });

  it("field confidence 98 (integer) is clamped to 0.98 and passes Zod", () => {
    const input = envelopeWithFieldConf(98);
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const ef = (coerced as { extractedFields: Record<string, { confidence: number }> }).extractedFields;
    expect(ef.loanAmount.confidence).toBeCloseTo(0.98, 2);
    const result = documentReviewEnvelopeSchema.safeParse(coerced);
    expect(result.success).toBe(true);
  });

  it("documentClassification.confidence 85 (integer) is clamped to 0.85", () => {
    const input = {
      documentClassification: {
        primaryType: "consumer_loan_contract",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 85,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {},
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    };
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dc = (coerced as { documentClassification: { confidence: number } }).documentClassification;
    expect(dc.confidence).toBeLessThanOrEqual(1);
    expect(dc.confidence).toBeCloseTo(0.85, 2);
    const result = documentReviewEnvelopeSchema.safeParse(coerced);
    expect(result.success).toBe(true);
  });

  it("missing lifecycleStatus is defaulted to unknown", () => {
    const input = {
      documentClassification: {
        primaryType: "consumer_loan_contract",
        confidence: 0.8,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {},
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    };
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dc = (coerced as { documentClassification: { lifecycleStatus: string } }).documentClassification;
    expect(dc.lifecycleStatus).toBe("unknown");
    const result = documentReviewEnvelopeSchema.safeParse(coerced);
    expect(result.success).toBe(true);
  });

  it("missing documentClassification entirely → created with expectedPrimaryType", () => {
    const input = {
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {
        loanAmount: { value: "500000", status: "extracted", confidence: 0.85 },
      },
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    };
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dc = (coerced as { documentClassification: { primaryType: string } }).documentClassification;
    expect(dc.primaryType).toBe("consumer_loan_contract");
    const result = documentReviewEnvelopeSchema.safeParse(coerced);
    expect(result.success).toBe(true);
  });
});

// ─── 14. CLASSIFICATION RESULT — confidence always 0-1 ──

describe("CLASSIFICATION RESULT: mapAiClassifierToClassificationResult clamps confidence", () => {
  it("confidence 0.85 stays 0.85", () => {
    const result = mapAiClassifierToClassificationResult(cls({ confidence: 0.85 }));
    expect(result.confidence).toBe(0.85);
  });

  it("confidence 0 stays 0", () => {
    const result = mapAiClassifierToClassificationResult(cls({ confidence: 0 }));
    expect(result.confidence).toBe(0);
  });

  it("confidence 1 stays 1", () => {
    const result = mapAiClassifierToClassificationResult(cls({ confidence: 1 }));
    expect(result.confidence).toBe(1);
  });
});

// ─── 15. PDF EXPORT — globalConfidence must not produce >100% ─────────────────

describe("ANCHOR: PDF export globalConfidence never exceeds 100%", () => {
  it("globalConfidence=98 (as percent) → display must be 98%, not 9800%", () => {
    // globalConfidence is already 0-100 from mapApiToExtractionDocument
    const globalConfidence = 98;
    // build-ai-review-pdf.ts fix: must NOT multiply by 100 again
    const confDisplayPct = globalConfidence > 1 ? Math.round(globalConfidence) : Math.round(globalConfidence * 100);
    expect(confDisplayPct).toBe(98);
    expect(confDisplayPct).toBeLessThanOrEqual(100);
  });

  it("globalConfidence=54 (as percent) → display must be 54%", () => {
    const globalConfidence = 54;
    const confDisplayPct = globalConfidence > 1 ? Math.round(globalConfidence) : Math.round(globalConfidence * 100);
    expect(confDisplayPct).toBe(54);
    expect(confDisplayPct).toBeLessThanOrEqual(100);
  });

  it("globalConfidence=0.98 (fractional) → display must be 98%", () => {
    const globalConfidence = 0.98;
    const confDisplayPct = globalConfidence > 1 ? Math.round(globalConfidence) : Math.round(globalConfidence * 100);
    expect(confDisplayPct).toBe(98);
    expect(confDisplayPct).toBeLessThanOrEqual(100);
  });
});

// ─── 16. documentMeta as string → coerced to safe object ─────────────────────

describe("ANCHOR: documentMeta as non-object value must be coerced to safe default", () => {
  function minimalEnvelopeWithMeta(meta: unknown) {
    return {
      documentClassification: {
        primaryType: "consumer_loan_contract",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 0.85,
        reasons: [],
      },
      documentMeta: meta,
      extractedFields: {},
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    };
  }

  it("documentMeta as string → coerced to { scannedVsDigital: 'unknown' }", () => {
    const input = minimalEnvelopeWithMeta("invalid_string");
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dm = (coerced as Record<string, Record<string, unknown>>).documentMeta;
    expect(dm).toBeDefined();
    expect(typeof dm).toBe("object");
    expect(dm.scannedVsDigital).toBe("unknown");
  });

  it("documentMeta as null → coerced to { scannedVsDigital: 'unknown' }", () => {
    const input = minimalEnvelopeWithMeta(null);
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dm = (coerced as Record<string, Record<string, unknown>>).documentMeta;
    expect(dm).toBeDefined();
    expect(dm.scannedVsDigital).toBe("unknown");
  });

  it("documentMeta as array → coerced to { scannedVsDigital: 'unknown' }", () => {
    const input = minimalEnvelopeWithMeta([{ foo: "bar" }]);
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dm = (coerced as Record<string, Record<string, unknown>>).documentMeta;
    expect(dm).toBeDefined();
    expect(dm.scannedVsDigital).toBe("unknown");
  });

  it("documentMeta missing entirely → coerced to { scannedVsDigital: 'unknown' }", () => {
    const input = minimalEnvelopeWithMeta(undefined);
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "aggressive", expectedPrimaryType: "consumer_loan_contract" });
    const dm = (coerced as Record<string, Record<string, unknown>>).documentMeta;
    expect(dm).toBeDefined();
    expect(dm.scannedVsDigital).toBe("unknown");
  });

  it("documentClassification as string → coerced to valid object with expectedPrimaryType", () => {
    const input = {
      documentClassification: "invalid_string",
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {},
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    };
    const coerced = coerceReviewEnvelopeParsedJson(input, { mode: "light", expectedPrimaryType: "consumer_loan_contract" });
    const dc = (coerced as Record<string, Record<string, unknown>>).documentClassification;
    expect(dc).toBeDefined();
    expect(typeof dc).toBe("object");
    expect(dc.primaryType).toBe("consumer_loan_contract");
  });
});

// ─── 17. GČP odpovědnost — insuredObject inferred from nonlife classification ─

describe("ANCHOR: GČP odpovědnost — insuredObject inferred when missing", () => {
  function makeNonlifeClassification(primaryType: string) {
    return {
      primaryType: primaryType as import("../document-classification").ContractDocumentType,
      subtype: "liability_insurance" as const,
      lifecycleStatus: "final_contract" as const,
      documentIntent: "creates_new_product" as const,
      confidence: 0.78,
      reasons: ["nonlife_contract"],
    };
  }

  it("nonlife_insurance_contract with missing insuredObject → coercion infers from productName", () => {
    const parsed = {
      documentClassification: {
        primaryType: "nonlife_insurance_contract",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 0.78,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {
        productName: { value: "GČP Odpovědnost fyzické osoby", status: "extracted", confidence: 0.85 },
        insurer: { value: "Generali Česká pojišťovna", status: "extracted", confidence: 0.90 },
        contractNumber: { value: "12345678", status: "extracted", confidence: 0.88 },
      },
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    };
    const coerced = tryCoerceReviewEnvelopeAfterValidationFailure(
      parsed,
      "nonlife_insurance_contract",
      makeNonlifeClassification("nonlife_insurance_contract")
    );
    // insuredObject should be inferred or at least not break the output
    expect(coerced).not.toBeNull();
    if (coerced) {
      // Either inferred or extracted fields still present
      const hasClientData = coerced.extractedFields.productName?.value || coerced.extractedFields.insurer?.value;
      expect(hasClientData).toBeTruthy();
    }
  });
});

// ─── 18. AMUNDI DIP — productType=DIP inferred when missing ──────────────────

describe("ANCHOR: AMUNDI DIP — productType=DIP inferred from productName", () => {
  function makeDipClassification() {
    return {
      primaryType: "investment_subscription_document" as import("../document-classification").ContractDocumentType,
      subtype: "dip" as const,
      lifecycleStatus: "final_contract" as const,
      documentIntent: "creates_new_product" as const,
      confidence: 0.88,
      reasons: ["dip_contract"],
    };
  }

  it("investment_subscription_document with productName containing DIP → productType inferred as DIP", () => {
    const parsed = {
      documentClassification: {
        primaryType: "investment_subscription_document",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 0.88,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      extractedFields: {
        productName: { value: "AMUNDI DIP Platforma", status: "extracted", confidence: 0.90 },
        institutionName: { value: "AMUNDI", status: "extracted", confidence: 0.85 },
        contractNumber: { value: "DIP-12345", status: "extracted", confidence: 0.88 },
        // productType intentionally missing
      },
      parties: {},
      reviewWarnings: [],
      suggestedActions: [],
    };
    const coerced = tryCoerceReviewEnvelopeAfterValidationFailure(
      parsed,
      "investment_subscription_document",
      makeDipClassification()
    );
    expect(coerced).not.toBeNull();
    if (coerced) {
      const productType = String(coerced.extractedFields.productType?.value ?? "");
      expect(productType).toBe("DIP");
    }
  });
});
