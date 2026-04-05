import { describe, expect, it } from "vitest";
import type { DocumentReviewEnvelope } from "../document-review-types";
import { applyExtractedFieldAliasNormalizations } from "../extraction-field-alias-normalize";
import { selectSchemaForType } from "../document-schema-router";
import { runVerificationPass } from "../document-verification";

function minimalEnvelope(primaryType: DocumentReviewEnvelope["documentClassification"]["primaryType"]): DocumentReviewEnvelope {
  return {
    documentClassification: {
      primaryType,
      subtype: "test",
      lifecycleStatus: "final_contract",
      documentIntent: "creates_new_product",
      confidence: 0.9,
      reasons: [],
    },
    documentMeta: {
      scannedVsDigital: "digital",
      overallConfidence: 0.9,
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
    reviewWarnings: [],
    suggestedActions: [],
    sensitivityProfile: "standard_personal_data",
    contentFlags: {
      isFinalContract: true,
      isProposalOnly: false,
      containsPaymentInstructions: false,
      containsClientData: false,
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    },
  };
}

describe("applyExtractedFieldAliasNormalizations", () => {
  it("fills canonical life_insurance_investment_contract fields from LLM aliases", () => {
    const env = minimalEnvelope("life_insurance_investment_contract");
    env.extractedFields = {
      institutionName: {
        value: "Generali Česká pojišťovna a.s.",
        status: "extracted",
        confidence: 0.88,
        evidenceSnippet: "pojistitel",
      },
      productName: {
        value: "Bel Mondo 20",
        status: "extracted",
        confidence: 0.9,
        evidenceSnippet: "produkt",
      },
      policyNumber: {
        value: "3282880076",
        status: "extracted",
        confidence: 0.85,
        evidenceSnippet: "smlouva",
      },
      effectiveDate: {
        value: "1. 6. 2026",
        status: "extracted",
        confidence: 0.84,
        evidenceSnippet: "počátek",
      },
      investmentDetails: {
        value: { strategy: "Fond fondů dynamický 100 %" },
        status: "extracted",
        confidence: 0.8,
        evidenceSnippet: "strategie",
      },
      monthlyPremium: {
        value: "4 166 Kč",
        status: "extracted",
        confidence: 0.82,
        evidenceSnippet: "pojistné",
      },
    };

    applyExtractedFieldAliasNormalizations(env);

    expect(env.extractedFields.insurer?.value).toContain("Generali");
    expect(env.extractedFields.contractNumber?.value).toBe("3282880076");
    // normalizeExtractedFieldDates converts to ISO (internal/DB format); display is handled by mapper
    expect(env.extractedFields.policyStartDate?.value).toBe("2026-06-01");
    expect(String(env.extractedFields.investmentStrategy?.value)).toContain("dynamický");
    expect(env.extractedFields.totalMonthlyPremium?.value).toBe("4 166 Kč");

    const schema = selectSchemaForType("life_insurance_investment_contract");
    const { completeness, warnings } = runVerificationPass(env, schema);
    expect(completeness.requiredSatisfied).toBe(5);
    expect(completeness.requiredTotal).toBe(5);
    expect(warnings.filter((w) => w.code === "MISSING_REQUIRED_FIELD")).toHaveLength(0);
  });

  it("salvages contract fields from Czech text fragments when aliases are missing", () => {
    const env = minimalEnvelope("life_insurance_investment_contract");
    env.extractedFields = {
      title: {
        value: [
          "Modelace vývoje investičního životního pojištění",
          "Bel Mondo 20",
          "pojistná smlouva číslo 3282880076",
          "Počátek pojištění 1. 6. 2026",
          "Generali Česká pojišťovna a.s.",
        ].join("\n"),
        status: "inferred_low_confidence",
        confidence: 0.62,
      },
    };

    applyExtractedFieldAliasNormalizations(env);

    expect(env.extractedFields.insurer?.value).toContain("Generali");
    expect(env.extractedFields.productName?.value).toBe("Bel Mondo 20");
    expect(env.extractedFields.contractNumber?.value).toBe("3282880076");
    // normalizeExtractedFieldDates converts to ISO (internal/DB format); display is handled by mapper
    expect(env.extractedFields.policyStartDate?.value).toBe("2026-06-01");
  });

  it("fills proposalNumber_or_contractNumber for life_insurance_proposal", () => {
    const env = minimalEnvelope("life_insurance_proposal");
    env.documentClassification.lifecycleStatus = "proposal";
    env.documentClassification.documentIntent = "illustrative_only";
    env.extractedFields = {
      insurer: { value: "UNIQA", status: "extracted", confidence: 0.9, evidenceSnippet: "x" },
      productName: { value: "Domino", status: "extracted", confidence: 0.9, evidenceSnippet: "x" },
      documentStatus: { value: "návrh", status: "extracted", confidence: 0.8, evidenceSnippet: "x" },
      proposalNumber: { value: "PROP-001", status: "extracted", confidence: 0.85, evidenceSnippet: "x" },
    };
    applyExtractedFieldAliasNormalizations(env);
    expect(env.extractedFields.proposalNumber_or_contractNumber?.value).toBe("PROP-001");
    const schema = selectSchemaForType("life_insurance_proposal");
    const { completeness } = runVerificationPass(env, schema);
    expect(completeness.requiredSatisfied).toBe(schema.extractionRules.required.length);
  });

  it("maps consumer loan aliases to lender, loanAmount, installmentAmount", () => {
    const env = minimalEnvelope("consumer_loan_contract");
    env.extractedFields = {
      bankName: { value: "ČSOB", status: "extracted", confidence: 0.9, evidenceSnippet: "banka" },
      contractNumber: { value: "U-123", status: "extracted", confidence: 0.88, evidenceSnippet: "ref" },
      principal: { value: 500000, status: "extracted", confidence: 0.87, evidenceSnippet: "jistina" },
      monthlyInstallment: { value: "6 200 Kč", status: "extracted", confidence: 0.86, evidenceSnippet: "splátka" },
    };
    applyExtractedFieldAliasNormalizations(env);
    expect(env.extractedFields.lender?.value).toBe("ČSOB");
    expect(env.extractedFields.loanAmount?.value).toBe(500000);
    expect(env.extractedFields.installmentAmount?.value).toBe("6 200 Kč");
    const schema = selectSchemaForType("consumer_loan_contract");
    const { completeness, warnings } = runVerificationPass(env, schema);
    expect(completeness.requiredSatisfied).toBe(4);
    expect(warnings.filter((w) => w.code === "MISSING_REQUIRED_FIELD")).toHaveLength(0);
  });

  it("maps pension_contract provider and participantFullName aliases", () => {
    const env = minimalEnvelope("pension_contract");
    env.extractedFields = {
      institutionName: { value: "Penze Co", status: "extracted", confidence: 0.9, evidenceSnippet: "x" },
      productName: { value: "DPS X", status: "extracted", confidence: 0.9, evidenceSnippet: "x" },
      contractNumber: { value: "DPS-9", status: "extracted", confidence: 0.88, evidenceSnippet: "x" },
      fullName: { value: "Jan Test", status: "extracted", confidence: 0.87, evidenceSnippet: "x" },
    };
    applyExtractedFieldAliasNormalizations(env);
    expect(env.extractedFields.provider?.value).toBe("Penze Co");
    expect(env.extractedFields.participantFullName?.value).toBe("Jan Test");
    const schema = selectSchemaForType("pension_contract");
    const { completeness } = runVerificationPass(env, schema);
    expect(completeness.requiredSatisfied).toBe(4);
  });
});

describe("runVerificationPass readability", () => {
  it("skips LOW_EVIDENCE_REQUIRED on text_pdf with good coverage when value present and confidence ok", () => {
    const env = minimalEnvelope("life_insurance_investment_contract");
    env.documentMeta.textCoverageEstimate = 0.92;
    env.documentMeta.preprocessStatus = "ok";
    env.extractedFields = {
      insurer: { value: "X", status: "extracted", confidence: 0.72 },
      productName: { value: "Y", status: "extracted", confidence: 0.72 },
      contractNumber: { value: "1", status: "extracted", confidence: 0.72 },
      policyStartDate: { value: "2026-01-01", status: "extracted", confidence: 0.72 },
      investmentStrategy: { value: "mixed", status: "extracted", confidence: 0.72 },
    };

    const schema = selectSchemaForType("life_insurance_investment_contract");
    const { warnings } = runVerificationPass(env, schema, {
      readability: {
        inputMode: "text_pdf",
        textCoverageEstimate: 0.92,
        preprocessStatus: "ok",
      },
    });
    expect(warnings.filter((w) => w.code === "LOW_EVIDENCE_REQUIRED")).toHaveLength(0);
  });
});
