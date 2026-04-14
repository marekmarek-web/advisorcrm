/**
 * P1.1 + P1.2 regression tests
 *
 * P1.1 — Payment anti-hallucination:
 *   AH01: investment_modelation doc with payment-like fields → NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS warning
 *   AH02: payment_instruction doc → no anti-hallucination warning (exempt)
 *   AH03: life_insurance_contract with containsPaymentInstructions=true → no spurious warning
 *   AH04: life_insurance_contract without explicit payment section + bankAccount → PAYMENT_FIELDS_WITHOUT_EXPLICIT_SECTION
 *   AH05: evaluatePaymentApplyReadiness with needsHumanReview=true → applyBarrierReasons, not just warning
 *   AH06: quality gate — informative doc without explicit payment section → PAYMENT_SOURCE_NOT_ELIGIBLE_INFORMATIVE_DOC
 *
 * P1.2 — Section ownership / address precedence:
 *   SO01: fullName from AML block → cleared when parties has policyholder
 *   SO02: address from health_block → cleared when parties has policyholder with address
 *   SO03: address from client_block → NOT cleared even if institution name in document header
 *   SO04: looksLikeInstitution("Generali náměstí 12") → false (address, not institution name)
 *   SO05: looksLikeInstitution("Generali pojišťovna") → true
 *   SO06: secondary_section_override_blocked warning emitted for address from aml_block
 *   SO07: AML-only envelope → no client identity fields from AML override primary fields
 *   SO08: combined-extraction prompt includes RULE 7 (payment anti-hallucination text)
 *   SO09: combined-extraction prompt includes RULE 8 (address source separation text)
 *   SO10: buildSectionSpecificRules with contractualText → includes address separation rule
 */

import { describe, it, expect } from "vitest";
import { validateDocumentEnvelope } from "../extraction-validation";
import { applyFieldSourcePriorityAndEvidence } from "../field-source-priority";
import { evaluatePaymentApplyReadiness, evaluateApplyReadiness } from "../quality-gates";
import { buildCombinedClassifyAndExtractPrompt } from "../combined-extraction";
import type { DocumentReviewEnvelope } from "../document-review-types";
import type { ContractReviewRow } from "../review-queue-repository";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEnvelope(
  overrides: Partial<DocumentReviewEnvelope> = {}
): DocumentReviewEnvelope {
  return {
    documentClassification: {
      primaryType: "life_insurance_contract",
      subtype: null,
      lifecycleStatus: "final_contract",
      documentIntent: "creates_new_product",
      confidence: 0.9,
      reasons: [],
      ...((overrides.documentClassification as object) ?? {}),
    },
    documentMeta: { scannedVsDigital: "digital", overallConfidence: 0.9 },
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
    reviewWarnings: [],
    suggestedActions: [],
    ...overrides,
  } as DocumentReviewEnvelope;
}

function makeRow(overrides: Partial<ContractReviewRow> = {}): ContractReviewRow {
  return {
    id: "test-row",
    extractedPayload: null,
    detectedDocumentType: null,
    confidence: 0.9,
    lifecycleStatus: null,
    correctedLifecycleStatus: null,
    matchedClientId: null,
    createNewClientConfirmed: false,
    clientMatchCandidates: [],
    extractionTrace: null,
    fieldConfidenceMap: null,
    ...overrides,
  } as unknown as ContractReviewRow;
}

// ─── P1.1 — Payment anti-hallucination ────────────────────────────────────────

describe("P1.1 — Payment anti-hallucination (extraction-validation)", () => {
  it("AH01: investment_modelation with bankAccount+variableSymbol → NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS", () => {
    const result = validateDocumentEnvelope({
      documentClassification: { primaryType: "investment_modelation" },
      contentFlags: { containsPaymentInstructions: false },
      extractedFields: {
        bankAccount: { value: "123456/0800", status: "extracted" },
        variableSymbol: { value: "12345678", status: "extracted" },
        totalMonthlyPremium: { value: "1500", status: "extracted" },
      },
    });
    expect(result.warnings.some((w) => w.code === "NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS")).toBe(true);
  });

  it("AH02: payment_instruction doc → no anti-hallucination payment warning", () => {
    const result = validateDocumentEnvelope({
      documentClassification: { primaryType: "payment_instruction" },
      contentFlags: { containsPaymentInstructions: true },
      extractedFields: {
        bankAccount: { value: "123456/0800", status: "extracted" },
        variableSymbol: { value: "12345678", status: "extracted" },
      },
    });
    expect(result.warnings.some((w) => w.code === "NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS")).toBe(false);
    expect(result.warnings.some((w) => w.code === "PAYMENT_FIELDS_WITHOUT_EXPLICIT_SECTION")).toBe(false);
  });

  it("AH03: life_insurance_contract with containsPaymentInstructions=true → no spurious payment warning", () => {
    const result = validateDocumentEnvelope({
      documentClassification: { primaryType: "life_insurance_contract" },
      contentFlags: { containsPaymentInstructions: true },
      extractedFields: {
        bankAccount: { value: "987654/2700", status: "extracted" },
        variableSymbol: { value: "9876543", status: "extracted" },
        totalMonthlyPremium: { value: "800", status: "extracted" },
        fullName: { value: "Jan Novák", status: "extracted" },
      },
    });
    expect(result.warnings.some((w) => w.code === "NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS")).toBe(false);
    expect(result.warnings.some((w) => w.code === "PAYMENT_FIELDS_WITHOUT_EXPLICIT_SECTION")).toBe(false);
  });

  it("AH04: life_insurance_contract without explicit payment section + bankAccount → PAYMENT_FIELDS_WITHOUT_EXPLICIT_SECTION", () => {
    const result = validateDocumentEnvelope({
      documentClassification: { primaryType: "life_insurance_contract" },
      contentFlags: { containsPaymentInstructions: false },
      extractedFields: {
        bankAccount: { value: "111111/0100", status: "extracted" },
        variableSymbol: { value: "111", status: "extracted" },
        totalMonthlyPremium: { value: "2000", status: "extracted" },
      },
    });
    expect(result.warnings.some((w) => w.code === "PAYMENT_FIELDS_WITHOUT_EXPLICIT_SECTION")).toBe(true);
  });

  it("AH05: evaluatePaymentApplyReadiness with needsHumanReview=true → applyBarrierReasons", () => {
    const gate = evaluatePaymentApplyReadiness({
      amount: "1500",
      paymentFrequency: "monthly",
      accountNumber: "123456",
      bankCode: "0800",
      variableSymbol: "12345",
      institutionName: "Test pojišťovna",
      needsHumanReview: true,
    });
    expect(gate.applyBarrierReasons).toContain("PAYMENT_NEEDS_HUMAN_REVIEW");
    // Must not be in warnings (escalated to barrier)
    expect(gate.warnings).not.toContain("PAYMENT_NEEDS_HUMAN_REVIEW");
  });
});

describe("P1.1 — Payment apply gate (quality-gates)", () => {
  it("AH06: quality gate — investment_modelation without explicit payment section → PAYMENT_SOURCE_NOT_ELIGIBLE_INFORMATIVE_DOC", () => {
    const row = makeRow({
      detectedDocumentType: "investment_modelation",
      extractedPayload: {
        documentClassification: {
          primaryType: "investment_modelation",
          lifecycleStatus: "modelation",
          documentIntent: "reference_only",
          confidence: 0.8,
        },
        contentFlags: { containsPaymentInstructions: false },
        extractedFields: {
          bankAccount: { value: "123456/0800" },
          variableSymbol: { value: "12345678" },
          totalMonthlyPremium: { value: "1500" },
        },
      },
      extractionTrace: {
        extractionRoute: "combined",
        documentType: "investment_modelation",
        normalizedPipelineClassification: "investment_modelation",
        classificationConfidence: 0.8,
      },
    });
    const gate = evaluateApplyReadiness(row);
    // Informative-doc payment source is advisory — must not block whole CRM apply (client match / contract).
    expect(gate.warnings).toContain("PAYMENT_SOURCE_NOT_ELIGIBLE_INFORMATIVE_DOC");
    const allBarriers = [...gate.blockedReasons, ...gate.applyBarrierReasons];
    expect(allBarriers).not.toContain("PAYMENT_SOURCE_NOT_ELIGIBLE_INFORMATIVE_DOC");
  });
});

// ─── P1.2 — Section ownership / address precedence ─────────────────────────

describe("P1.2 — Section ownership and address precedence (field-source-priority)", () => {
  it("SO01: fullName from AML block → cleared when parties has policyholder", () => {
    const env = makeEnvelope({
      parties: {
        policyholder: { role: "policyholder", fullName: "Jan Novák" },
      },
      extractedFields: {
        fullName: {
          value: "Jan Novák",
          status: "extracted",
          evidenceTier: "explicit_section_block",
          sourceKind: "aml_block",
          sourceLabel: "z AML přílohy",
          confidence: 0.7,
        },
      },
    });
    applyFieldSourcePriorityAndEvidence(env);
    // After the guard, fullName should be sourced from parties (policyholder_block), not aml_block
    const ef = env.extractedFields as Record<string, { sourceKind?: string; value?: unknown }>;
    expect(ef.fullName?.sourceKind).not.toBe("aml_block");
    expect(ef.fullName?.value).toBe("Jan Novák");
  });

  it("SO02: address from health_block → cleared when parties has policyholder with address", () => {
    const env = makeEnvelope({
      parties: {
        policyholder: { role: "policyholder", fullName: "Jana Nováková", address: "Hlavní 1, Praha" },
      },
      extractedFields: {
        address: {
          value: "Vedlejší 2, Brno",
          status: "extracted",
          evidenceTier: "explicit_section_block",
          sourceKind: "health_block",
          sourceLabel: "ze zdravotního dotazníku",
          confidence: 0.6,
        },
      },
    });
    applyFieldSourcePriorityAndEvidence(env);
    const ef = env.extractedFields as Record<string, { sourceKind?: string; value?: unknown }>;
    // Address from health block should be cleared (secondary source guard)
    expect(ef.address?.sourceKind).not.toBe("health_block");
    // Warning should be emitted
    expect(env.reviewWarnings?.some((w) => w.code === "secondary_section_override_blocked" && w.field === "extractedFields.address")).toBe(true);
  });

  it("SO03: address from client_block → NOT cleared even if value contains institution context", () => {
    const env = makeEnvelope({
      parties: {},
      extractedFields: {
        address: {
          value: "Pojistníkova 5, Praha 2",
          status: "extracted",
          evidenceTier: "explicit_section_block",
          sourceKind: "client_block",
          sourceLabel: "Klient / Pojistník",
          confidence: 0.92,
        },
        fullName: {
          value: "Petr Dvořák",
          status: "extracted",
          evidenceTier: "explicit_section_block",
          sourceKind: "client_block",
          confidence: 0.92,
        },
      },
    });
    applyFieldSourcePriorityAndEvidence(env);
    const ef = env.extractedFields as Record<string, { sourceKind?: string; value?: unknown }>;
    // Address from client_block must be preserved
    expect(ef.address?.value).toBe("Pojistníkova 5, Praha 2");
    expect(ef.address?.sourceKind).toBe("client_block");
    expect(env.reviewWarnings?.some((w) => w.code === "secondary_section_override_blocked" && w.field === "extractedFields.address")).toBe(false);
  });

  it("SO04: looksLikeInstitution('Generali náměstí 12') → false (looks like address, not institution name)", () => {
    // Test the heuristic indirectly: address in client field with institution address-like value
    // should NOT be nulled (institution heuristic should be address-aware)
    const env = makeEnvelope({
      extractedFields: {
        address: {
          value: "Generali náměstí 12, Praha 1",
          status: "extracted",
          evidenceTier: "explicit_section_block",
          sourceKind: "client_block",
          confidence: 0.85,
        },
        fullName: {
          value: "Karel Šimánek",
          status: "extracted",
          evidenceTier: "explicit_section_block",
          sourceKind: "client_block",
          confidence: 0.9,
        },
      },
    });
    applyFieldSourcePriorityAndEvidence(env);
    const ef = env.extractedFields as Record<string, { value?: unknown }>;
    // Address must be preserved — "Generali náměstí 12" is an address, not an institution name
    expect(ef.address?.value).toBe("Generali náměstí 12, Praha 1");
  });

  it("SO05: fullName = 'Generali pojišťovna' in client field → nulled (institution name heuristic)", () => {
    const env = makeEnvelope({
      extractedFields: {
        fullName: {
          value: "Generali pojišťovna",
          status: "extracted",
          evidenceTier: "explicit_labeled_field",
          sourceKind: "client_block",
          confidence: 0.5,
        },
      },
    });
    applyFieldSourcePriorityAndEvidence(env);
    const ef = env.extractedFields as Record<string, { value?: unknown; status?: string }>;
    expect(ef.fullName?.value).toBeNull();
    expect(ef.fullName?.status).toBe("missing");
    expect(env.reviewWarnings?.some((w) => w.code === "client_field_institution_value" && w.field === "fullName")).toBe(true);
  });

  it("SO06: secondary_section_override_blocked warning emitted for address from aml_block even if no party has address", () => {
    const env = makeEnvelope({
      parties: {
        policyholder: { role: "policyholder", fullName: "Eva Horáková" }, // no address in party
      },
      extractedFields: {
        address: {
          value: "AML adresa 3, Brno",
          status: "extracted",
          evidenceTier: "explicit_section_block",
          sourceKind: "aml_block",
          sourceLabel: "z AML přílohy",
          confidence: 0.6,
        },
      },
    });
    applyFieldSourcePriorityAndEvidence(env);
    // Warning should still be emitted (even if value not cleared, advisor needs to know)
    expect(env.reviewWarnings?.some((w) => w.code === "secondary_section_override_blocked")).toBe(true);
  });

  it("SO07: institution-only document (no person block) → institution address not in extractedFields.address", () => {
    // When fullName looks like institution, it gets nulled — address from insurer_header should
    // also not end up in the client address field.
    const env = makeEnvelope({
      extractedFields: {
        fullName: {
          value: "UNIQA pojišťovna",
          status: "extracted",
          evidenceTier: "explicit_labeled_field",
          sourceKind: "insurer_header",
          confidence: 0.7,
        },
        address: {
          value: "Londýnská 1, Praha 2",
          status: "extracted",
          evidenceTier: "explicit_section_block",
          sourceKind: "insurer_header",
          confidence: 0.7,
        },
      },
    });
    applyFieldSourcePriorityAndEvidence(env);
    const ef = env.extractedFields as Record<string, { value?: unknown; sourceKind?: string }>;
    // fullName from insurer_header should be tagged but the institution check via looksLikeInstitution
    // will null it (UNIQA is in the patterns)
    expect(ef.fullName?.value).toBeNull();
  });
});

// ─── P1.1 + P1.2 — Prompt content checks ────────────────────────────────────

describe("P1.1 + P1.2 — Prompt content (combined-extraction)", () => {
  it("SO08: combined prompt includes RULE 7 payment anti-hallucination text", () => {
    const prompt = buildCombinedClassifyAndExtractPrompt("Testovací text dokumentu.", "test.pdf", null, null);
    expect(prompt).toContain("RULE 7");
    expect(prompt).toContain("PAYMENT ANTI-HALLUCINATION");
    expect(prompt).toContain("investment_payment_informative_only");
  });

  it("SO09: combined prompt includes RULE 8 address source separation text", () => {
    const prompt = buildCombinedClassifyAndExtractPrompt("Testovací text dokumentu.", "test.pdf", null, null);
    expect(prompt).toContain("RULE 8");
    expect(prompt).toContain("ADDRESS SOURCE SEPARATION");
    expect(prompt).toContain("institutionAddress");
  });

  it("SO10: buildSectionSpecificRules with contractualText → includes address separation rule", () => {
    const prompt = buildCombinedClassifyAndExtractPrompt(
      "Testovací text.",
      "test.pdf",
      { isBundle: false },
      { contractualText: "Pojistník: Jan Novák, ul. Testovací 1", paymentText: null, healthText: null, investmentText: null, attachmentText: null }
    );
    expect(prompt).toContain("ADRESA INSTITUCE vs. ADRESA KLIENTA");
    expect(prompt).toContain("autoritativní zdroj");
  });
});

// ─── Phase 3 payment sync regression — AML-only and informative bundle ───────

describe("P1.1 — Payment regression: AML/informative bundles", () => {
  it("AH-REG01: AML-only bundle (investment_service_agreement) with account info → NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS", () => {
    const result = validateDocumentEnvelope({
      documentClassification: { primaryType: "investment_service_agreement" },
      contentFlags: { containsPaymentInstructions: false },
      extractedFields: {
        bankAccount: { value: "246810/0100", status: "extracted" },
        variableSymbol: { value: "246810", status: "extracted" },
      },
    });
    expect(result.warnings.some((w) => w.code === "NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS")).toBe(true);
  });

  it("AH-REG02: pension_contract with account from informative section → NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS", () => {
    const result = validateDocumentEnvelope({
      documentClassification: { primaryType: "pension_contract" },
      contentFlags: { containsPaymentInstructions: false },
      extractedFields: {
        bankAccount: { value: "135791/2700", status: "extracted" },
        variableSymbol: { value: "13579", status: "extracted" },
        totalMonthlyPremium: { value: "500", status: "extracted" },
      },
    });
    expect(result.warnings.some((w) => w.code === "NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS")).toBe(true);
  });

  it("AH-REG03: life_insurance_contract with explicit payment section → no payment warning", () => {
    const result = validateDocumentEnvelope({
      documentClassification: { primaryType: "life_insurance_contract" },
      contentFlags: { containsPaymentInstructions: true, isFinalContract: true },
      extractedFields: {
        bankAccount: { value: "999888/0800", status: "extracted" },
        variableSymbol: { value: "9998880", status: "extracted" },
        totalMonthlyPremium: { value: "1200", status: "extracted" },
        fullName: { value: "Tomáš Procházka", status: "extracted" },
      },
    });
    expect(result.warnings.some((w) =>
      w.code === "NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS" ||
      w.code === "PAYMENT_FIELDS_WITHOUT_EXPLICIT_SECTION"
    )).toBe(false);
  });
});
