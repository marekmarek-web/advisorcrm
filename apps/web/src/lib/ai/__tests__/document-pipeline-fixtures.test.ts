import { describe, expect, it } from "vitest";
import type { DocumentReviewEnvelope } from "../document-review-types";
import { resolveDocumentSchema } from "../document-schema-router";
import { runVerificationPass } from "../document-verification";
import { resolveSensitivityProfile } from "../document-sensitivity";

type FixtureScenario = {
  name: string;
  envelope: DocumentReviewEnvelope;
  expectedType: string;
  expectedLifecycle: string;
  requiredFieldsMustBeSatisfied: string[];
  optionalFields: string[];
  notApplicableFields: string[];
  expectedActionTypes: string[];
};

function baseEnvelope(primaryType: DocumentReviewEnvelope["documentClassification"]["primaryType"]): DocumentReviewEnvelope {
  return {
    documentClassification: {
      primaryType,
      subtype: "fixture",
      lifecycleStatus: "unknown",
      documentIntent: "reference_only",
      confidence: 0.86,
      reasons: ["fixture"],
    },
    documentMeta: {
      scannedVsDigital: "digital",
      overallConfidence: 0.86,
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
      isFinalContract: false,
      isProposalOnly: false,
      containsPaymentInstructions: false,
      containsClientData: false,
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    },
  };
}

const SCENARIOS: FixtureScenario[] = [
  {
    name: "Generali Bel Mondo final contract",
    envelope: {
      ...baseEnvelope("life_insurance_final_contract"),
      documentClassification: {
        primaryType: "life_insurance_final_contract",
        subtype: "generali_bel_mondo",
        lifecycleStatus: "final_contract",
        documentIntent: "creates_new_product",
        confidence: 0.91,
        reasons: ["Generali", "pojistná smlouva"],
      },
      extractedFields: {
        insurer: { value: "Generali", confidence: 0.95, sourcePage: 1, evidenceSnippet: "Generali", status: "extracted" },
        productName: { value: "Bel Mondo", confidence: 0.92, sourcePage: 1, evidenceSnippet: "BEL MONDO", status: "extracted" },
        contractNumber: { value: "GM-2026-001", confidence: 0.89, sourcePage: 1, evidenceSnippet: "Číslo smlouvy", status: "extracted" },
        policyholder: { value: "Jan Novak", confidence: 0.87, sourcePage: 1, evidenceSnippet: "Pojistník", status: "extracted" },
      },
    },
    expectedType: "life_insurance_final_contract",
    expectedLifecycle: "final_contract",
    requiredFieldsMustBeSatisfied: ["extractedFields.insurer", "extractedFields.productName"],
    optionalFields: ["extractedFields.investmentAllocation"],
    notApplicableFields: ["extractedFields.illustrativeProjection"],
    expectedActionTypes: ["create_or_update_contract_record", "create_service_review_task"],
  },
  {
    name: "CPP change request",
    envelope: {
      ...baseEnvelope("life_insurance_change_request"),
      documentClassification: {
        primaryType: "life_insurance_change_request",
        subtype: "cpp_neon_change_request",
        lifecycleStatus: "policy_change_request",
        documentIntent: "modifies_existing_product",
        confidence: 0.88,
        reasons: ["Změnová žádost"],
      },
      extractedFields: {
        insurer: { value: "ČPP", confidence: 0.9, sourcePage: 1, evidenceSnippet: "ČPP", status: "extracted" },
        existingPolicyNumber: { value: "CPP-88911", confidence: 0.88, sourcePage: 1, evidenceSnippet: "Číslo smlouvy", status: "extracted" },
        requestedChanges: { value: "Zvýšení pojistné částky", confidence: 0.8, sourcePage: 2, evidenceSnippet: "Požadovaná změna", status: "extracted" },
      },
    },
    expectedType: "life_insurance_change_request",
    expectedLifecycle: "policy_change_request",
    requiredFieldsMustBeSatisfied: ["extractedFields.insurer", "extractedFields.existingPolicyNumber"],
    optionalFields: ["extractedFields.changedCoverages"],
    notApplicableFields: ["extractedFields.newPolicyCreation"],
    expectedActionTypes: ["attach_to_existing_contract", "request_contract_mapping"],
  },
  {
    name: "Kooperativa FLEXI modelation",
    envelope: {
      ...baseEnvelope("life_insurance_modelation"),
      documentClassification: {
        primaryType: "life_insurance_modelation",
        subtype: "kooperativa_flexi_modelation",
        lifecycleStatus: "modelation",
        documentIntent: "illustrative_only",
        confidence: 0.81,
        reasons: ["Modelace FLEXI"],
      },
      extractedFields: {
        insurer: { value: "Kooperativa", confidence: 0.91, sourcePage: 1, evidenceSnippet: "Kooperativa", status: "extracted" },
        productName: { value: "FLEXI", confidence: 0.84, sourcePage: 1, evidenceSnippet: "FLEXI", status: "extracted" },
        modelationId: { value: "MOD-9090", confidence: 0.8, sourcePage: 1, evidenceSnippet: "ID modelace", status: "extracted" },
      },
    },
    expectedType: "life_insurance_modelation",
    expectedLifecycle: "modelation",
    requiredFieldsMustBeSatisfied: ["extractedFields.insurer", "extractedFields.modelationId"],
    optionalFields: ["extractedFields.investmentScenario"],
    notApplicableFields: ["extractedFields.finalContractSignedDate"],
    expectedActionTypes: ["create_opportunity", "schedule_consultation"],
  },
  {
    name: "Pillow proposal",
    envelope: {
      ...baseEnvelope("life_insurance_proposal"),
      documentClassification: {
        primaryType: "life_insurance_proposal",
        subtype: "pillow_proposal",
        lifecycleStatus: "proposal",
        documentIntent: "illustrative_only",
        confidence: 0.89,
        reasons: ["Návrh Pillow"],
      },
      extractedFields: {
        insurer: { value: "Pillow", confidence: 0.9, sourcePage: 1, evidenceSnippet: "Pillow", status: "extracted" },
        productName: { value: "Život", confidence: 0.8, sourcePage: 1, evidenceSnippet: "Životní", status: "extracted" },
        documentStatus: { value: "proposal", confidence: 0.85, sourcePage: 1, evidenceSnippet: "Návrh", status: "extracted" },
        proposalNumber_or_contractNumber: { value: "PIL-1001", confidence: 0.79, sourcePage: 1, evidenceSnippet: "Návrh č.", status: "extracted" },
      },
    },
    expectedType: "life_insurance_proposal",
    expectedLifecycle: "proposal",
    requiredFieldsMustBeSatisfied: ["extractedFields.insurer", "extractedFields.proposalNumber_or_contractNumber"],
    optionalFields: ["extractedFields.totalMonthlyPremium"],
    notApplicableFields: ["extractedFields.contractSignedDate"],
    expectedActionTypes: ["create_opportunity", "create_task_followup"],
  },
  {
    name: "UNIQA Domino proposal",
    envelope: {
      ...baseEnvelope("life_insurance_proposal"),
      documentClassification: {
        primaryType: "life_insurance_proposal",
        subtype: "uniqa_domino_invest",
        lifecycleStatus: "proposal",
        documentIntent: "illustrative_only",
        confidence: 0.84,
        reasons: ["UNIQA Domino návrh"],
      },
      extractedFields: {
        insurer: { value: "UNIQA", confidence: 0.88, sourcePage: 1, evidenceSnippet: "UNIQA", status: "extracted" },
        productName: { value: "Domino Invest", confidence: 0.85, sourcePage: 1, evidenceSnippet: "Domino Invest", status: "extracted" },
        documentStatus: { value: "proposal", confidence: 0.83, sourcePage: 1, evidenceSnippet: "Návrh", status: "extracted" },
        proposalNumber_or_contractNumber: { value: "UNI-555", confidence: 0.82, sourcePage: 1, evidenceSnippet: "Návrh číslo", status: "extracted" },
      },
    },
    expectedType: "life_insurance_proposal",
    expectedLifecycle: "proposal",
    requiredFieldsMustBeSatisfied: ["extractedFields.insurer", "extractedFields.proposalNumber_or_contractNumber"],
    optionalFields: ["extractedFields.coverages"],
    notApplicableFields: ["extractedFields.contractSignedDate"],
    expectedActionTypes: ["create_opportunity", "create_task_followup"],
  },
  {
    name: "UNIQA Zivot a radost proposal",
    envelope: {
      ...baseEnvelope("life_insurance_proposal"),
      documentClassification: {
        primaryType: "life_insurance_proposal",
        subtype: "uniqa_zivot_radost",
        lifecycleStatus: "proposal",
        documentIntent: "illustrative_only",
        confidence: 0.82,
        reasons: ["UNIQA Život a radost návrh"],
      },
      extractedFields: {
        insurer: { value: "UNIQA", confidence: 0.88, sourcePage: 1, evidenceSnippet: "UNIQA", status: "extracted" },
        productName: { value: "Život & radost", confidence: 0.84, sourcePage: 1, evidenceSnippet: "Život & radost", status: "extracted" },
        documentStatus: { value: "proposal", confidence: 0.84, sourcePage: 1, evidenceSnippet: "Návrh", status: "extracted" },
        proposalNumber_or_contractNumber: { value: "UNI-ZR-102", confidence: 0.82, sourcePage: 1, evidenceSnippet: "Návrh číslo", status: "extracted" },
      },
    },
    expectedType: "life_insurance_proposal",
    expectedLifecycle: "proposal",
    requiredFieldsMustBeSatisfied: ["extractedFields.insurer", "extractedFields.proposalNumber_or_contractNumber"],
    optionalFields: ["extractedFields.coverages"],
    notApplicableFields: ["extractedFields.contractSignedDate"],
    expectedActionTypes: ["create_opportunity", "create_task_followup"],
  },
  {
    name: "Corporate tax return",
    envelope: {
      ...baseEnvelope("corporate_tax_return"),
      documentClassification: {
        primaryType: "corporate_tax_return",
        subtype: "corporate_income_tax_return",
        lifecycleStatus: "tax_return",
        documentIntent: "supports_underwriting_or_bonita",
        confidence: 0.83,
        reasons: ["Daňové přiznání PO"],
      },
      extractedFields: {
        companyName: { value: "ACME s.r.o.", confidence: 0.9, sourcePage: 1, evidenceSnippet: "ACME s.r.o.", status: "extracted" },
        ico: { value: "12345678", confidence: 0.92, sourcePage: 1, evidenceSnippet: "IČO", status: "extracted" },
        taxPeriodFrom: { value: "2025-01-01", confidence: 0.84, sourcePage: 1, evidenceSnippet: "Od", status: "extracted" },
        taxPeriodTo: { value: "2025-12-31", confidence: 0.84, sourcePage: 1, evidenceSnippet: "Do", status: "extracted" },
      },
    },
    expectedType: "corporate_tax_return",
    expectedLifecycle: "tax_return",
    requiredFieldsMustBeSatisfied: ["extractedFields.companyName", "extractedFields.ico"],
    optionalFields: ["extractedFields.resultOfOperations"],
    notApplicableFields: ["extractedFields.clientProductCreation"],
    expectedActionTypes: ["create_or_link_company_entity", "attach_to_loan_or_financing_deal"],
  },
  {
    name: "Payslip",
    envelope: {
      ...baseEnvelope("payslip_document"),
      documentClassification: {
        primaryType: "payslip_document",
        subtype: "payroll_slip",
        lifecycleStatus: "payroll_statement",
        documentIntent: "supports_income_verification",
        confidence: 0.79,
        reasons: ["Výplatní páska"],
      },
      extractedFields: {
        employerName: { value: "Contoso s.r.o.", confidence: 0.86, sourcePage: 1, evidenceSnippet: "Zaměstnavatel", status: "extracted" },
        employeeName: { value: "Jan Novak", confidence: 0.87, sourcePage: 1, evidenceSnippet: "Zaměstnanec", status: "extracted" },
        netWage: { value: 42500, confidence: 0.84, sourcePage: 1, evidenceSnippet: "Čistá mzda", status: "extracted" },
      },
    },
    expectedType: "payslip_document",
    expectedLifecycle: "payroll_statement",
    requiredFieldsMustBeSatisfied: ["extractedFields.employerName", "extractedFields.employeeName", "extractedFields.netWage"],
    optionalFields: ["extractedFields.deductions"],
    notApplicableFields: ["extractedFields.productCreation"],
    expectedActionTypes: ["update_income_profile", "mark_as_supporting_document"],
  },
];

describe("document-pipeline-fixtures", () => {
  for (const scenario of SCENARIOS) {
    it(`validates scenario: ${scenario.name}`, () => {
      expect(scenario.envelope.documentClassification.primaryType).toBe(scenario.expectedType);
      expect(scenario.envelope.documentClassification.lifecycleStatus).toBe(scenario.expectedLifecycle);

      const schema = resolveDocumentSchema(scenario.envelope.documentClassification.primaryType);
      const verification = runVerificationPass(scenario.envelope, schema);
      for (const requiredField of scenario.requiredFieldsMustBeSatisfied) {
        const key = requiredField.replace(/^extractedFields\./, "");
        const field = verification.envelope.extractedFields[key];
        expect(field).toBeDefined();
        expect(["extracted", "inferred_low_confidence", "explicitly_not_selected", "not_applicable"]).toContain(field?.status);
      }

      for (const actionType of scenario.expectedActionTypes) {
        expect(schema.extractionRules.suggestedActionRules.join("|")).toContain(actionType);
      }

      const sensitivity = resolveSensitivityProfile(verification.envelope);
      expect(sensitivity).toBeDefined();
      expect(verification.envelope.dataCompleteness?.requiredTotal ?? 0).toBeGreaterThanOrEqual(0);
    });
  }
});

