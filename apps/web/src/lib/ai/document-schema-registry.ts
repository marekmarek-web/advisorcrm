import { z } from "zod";
import {
  DOCUMENT_LIFECYCLE_STATUSES,
  PRIMARY_DOCUMENT_TYPES,
  type DocumentIntent,
  type DocumentLifecycleStatus,
  type DocumentReviewEnvelope,
  documentReviewEnvelopeSchema,
} from "./document-review-types";

export type DocumentFieldRuleSet = {
  required: string[];
  optional: string[];
  conditional: string[];
  notApplicableRules: string[];
  matchingKeys: string[];
  crmMappingTarget: string;
  reviewRules: string[];
  suggestedActionRules: string[];
};

export type DocumentSchemaDefinition = {
  primaryType: (typeof PRIMARY_DOCUMENT_TYPES)[number];
  allowedLifecycle: DocumentLifecycleStatus[];
  subtypeHints: string[];
  defaultIntent: DocumentIntent;
  extractionRules: DocumentFieldRuleSet;
};

const commonOptional = [
  "documentMeta.issuer",
  "documentMeta.documentDate",
  "documentMeta.language",
  "documentMeta.pageCount",
];

export const DOCUMENT_SCHEMA_REGISTRY: Record<
  (typeof PRIMARY_DOCUMENT_TYPES)[number],
  DocumentSchemaDefinition
> = {
  life_insurance_contract: {
    primaryType: "life_insurance_contract",
    allowedLifecycle: ["final_contract", "annex", "unknown"],
    subtypeHints: ["generali_bel_mondo", "uniqa_domino_risk", "maxima_maxefekt"],
    defaultIntent: "creates_new_product",
    extractionRules: {
      required: [
        "extractedFields.insurer",
        "extractedFields.productName",
        "extractedFields.documentStatus",
        "extractedFields.policyStartDate",
      ],
      optional: [
        "extractedFields.policyEndDate",
        "extractedFields.totalMonthlyPremium",
        "extractedFields.coverages",
        "extractedFields.riders",
        ...commonOptional,
      ],
      conditional: [
        "extractedFields.contractNumber_or_proposalNumber",
        "extractedFields.bankPaymentInfo_if_present",
      ],
      notApplicableRules: [
        "collateral is not_applicable for life insurance unless explicit",
        "companyId not required for natural persons",
      ],
      matchingKeys: [
        "fullName",
        "birthDate",
        "maskedPersonalId",
        "email",
        "phone",
        "address",
        "householdMembers",
      ],
      crmMappingTarget: "contracts(segment=ZP)",
      reviewRules: [
        "proposal must never be marked as final contract",
        "nesjednano values map to explicitly_not_selected",
        "broker fields must not be merged into client contacts",
      ],
      suggestedActionRules: [
        "create_or_link_client",
        "create_contract_record",
        "create_task",
        "request_manual_review_on_ambiguity",
      ],
    },
  },
  life_insurance_proposal: {
    primaryType: "life_insurance_proposal",
    allowedLifecycle: ["proposal", "offer", "unknown"],
    subtypeHints: ["generali_bel_mondo", "uniqa_domino_risk", "maxima_maxefekt"],
    defaultIntent: "illustrative_only",
    extractionRules: {
      required: [
        "extractedFields.insurer",
        "extractedFields.productName",
        "extractedFields.documentStatus",
        "extractedFields.proposalNumber_or_contractNumber",
      ],
      optional: [
        "extractedFields.totalMonthlyPremium",
        "extractedFields.coverages",
        "extractedFields.riders",
        ...commonOptional,
      ],
      conditional: ["extractedFields.policyStartDate_if_present"],
      notApplicableRules: ["contractSignedDate may be not_applicable for proposal"],
      matchingKeys: ["fullName", "birthDate", "maskedPersonalId", "email", "phone"],
      crmMappingTarget: "opportunities(segment=ZP)",
      reviewRules: ["proposal not final contract"],
      suggestedActionRules: [
        "create_or_link_client",
        "create_opportunity",
        "create_task_followup",
      ],
    },
  },
  consumer_loan_contract: {
    primaryType: "consumer_loan_contract",
    allowedLifecycle: ["final_contract", "annex", "unknown"],
    subtypeHints: ["moneta_expres_pujcka", "csob_consumer_loan"],
    defaultIntent: "creates_new_product",
    extractionRules: {
      required: [
        "extractedFields.lender",
        "extractedFields.contractNumber",
        "extractedFields.loanAmount",
        "extractedFields.installmentAmount",
      ],
      optional: [
        "extractedFields.rpsn",
        "extractedFields.totalPayable",
        "extractedFields.accountForRepayment",
        "extractedFields.relatedBankAccount",
        ...commonOptional,
      ],
      conditional: ["extractedFields.collateral_if_secured_loan"],
      notApplicableRules: ["companyId not required for natural person borrower"],
      matchingKeys: ["fullName", "birthDate", "maskedPersonalId", "address", "phone", "email"],
      crmMappingTarget: "contracts(segment=UVER)",
      reviewRules: ["distinguish missing vs not_applicable for collateral"],
      suggestedActionRules: [
        "create_or_link_client",
        "create_contract_record",
        "create_task",
      ],
    },
  },
  consumer_loan_with_payment_protection: {
    primaryType: "consumer_loan_with_payment_protection",
    allowedLifecycle: ["final_contract", "proposal", "annex", "unknown"],
    subtypeHints: ["moneta_payment_protection", "csob_loan_ppi"],
    defaultIntent: "creates_new_product",
    extractionRules: {
      required: [
        "extractedFields.lender",
        "extractedFields.contractNumber",
        "extractedFields.loanAmount",
        "extractedFields.paymentProtectionProvider",
        "extractedFields.insuredRisks",
      ],
      optional: [
        "extractedFields.monthlyInsuranceCharge",
        "extractedFields.insuranceStart",
        "extractedFields.insuranceEnd",
        "extractedFields.claimsConditions",
        ...commonOptional,
      ],
      conditional: ["extractedFields.medicalConsentPresent_if_declared"],
      notApplicableRules: ["collateral may be not_applicable for unsecured loans"],
      matchingKeys: ["fullName", "birthDate", "maskedPersonalId", "address", "phone", "email"],
      crmMappingTarget: "contracts(segment=UVER)+insurance_link",
      reviewRules: ["do not treat insurance section as standalone contract unless explicit"],
      suggestedActionRules: [
        "create_or_link_client",
        "create_contract_record",
        "create_task_review_insurance",
      ],
    },
  },
  mortgage_document: {
    primaryType: "mortgage_document",
    allowedLifecycle: [...DOCUMENT_LIFECYCLE_STATUSES],
    subtypeHints: ["mortgage_annex", "mortgage_offer"],
    defaultIntent: "supports_underwriting_or_bonita",
    extractionRules: {
      required: ["extractedFields.lender", "extractedFields.documentStatus"],
      optional: ["extractedFields.loanAmount", "extractedFields.interestRate", ...commonOptional],
      conditional: ["extractedFields.collateral_if_present"],
      notApplicableRules: ["for pure annex product fields may be not_applicable"],
      matchingKeys: ["fullName", "birthDate", "maskedPersonalId", "address"],
      crmMappingTarget: "contracts(segment=HYPO)",
      reviewRules: ["annex must not overwrite final contract data without review"],
      suggestedActionRules: ["create_or_link_client", "create_task_manual_review"],
    },
  },
  income_confirmation: {
    primaryType: "income_confirmation",
    allowedLifecycle: ["confirmation", "unknown"],
    subtypeHints: ["csob_income_confirmation", "employer_income_confirmation"],
    defaultIntent: "supports_income_verification",
    extractionRules: {
      required: [
        "extractedFields.employerName",
        "extractedFields.employeeFullName",
        "extractedFields.issueDate",
      ],
      optional: [
        "extractedFields.averageNetIncomeLast3Months",
        "extractedFields.averageNetIncomeLast12Months",
        "extractedFields.employerStampPresent",
        ...commonOptional,
      ],
      conditional: ["extractedFields.wageDeductionsDetail_if_deductions_true"],
      notApplicableRules: ["not a final contract or product agreement"],
      matchingKeys: ["employeeFullName", "employeeBirthDate", "address", "employerName"],
      crmMappingTarget: "documents+income_verification",
      reviewRules: ["mark as income verification document"],
      suggestedActionRules: [
        "attach_to_existing_client",
        "create_income_verification_record",
        "propose_financial_analysis_update",
      ],
    },
  },
  bank_statement: {
    primaryType: "bank_statement",
    allowedLifecycle: ["statement", "unknown"],
    subtypeHints: ["csob_bank_statement", "moneta_bank_statement"],
    defaultIntent: "supports_financial_analysis",
    extractionRules: {
      required: [
        "extractedFields.bankName",
        "extractedFields.accountOwner",
        "extractedFields.statementPeriodFrom",
        "extractedFields.statementPeriodTo",
      ],
      optional: [
        "extractedFields.openingBalance",
        "extractedFields.closingBalance",
        "extractedFields.transactionsSummary",
        "extractedFields.recurringPayments",
        ...commonOptional,
      ],
      conditional: ["extractedFields.detectedLoanPayments_if_present"],
      notApplicableRules: ["raw transaction dump is not_applicable for regular CRM review"],
      matchingKeys: ["accountOwner", "accountName", "address", "ibanMasked"],
      crmMappingTarget: "documents+cashflow_summary",
      reviewRules: ["high sensitivity handling required"],
      suggestedActionRules: [
        "attach_to_existing_client",
        "request_manual_review",
        "propose_financial_analysis_update",
      ],
    },
  },
  investment_service_agreement: {
    primaryType: "investment_service_agreement",
    allowedLifecycle: ["onboarding_form", "final_contract", "proposal", "unknown"],
    subtypeHints: ["codya_invest_service_agreement"],
    defaultIntent: "reference_only",
    extractionRules: {
      required: [
        "extractedFields.companyName",
        "extractedFields.serviceType",
        "extractedFields.investorFullName",
      ],
      optional: [
        "extractedFields.fatcaStatus",
        "extractedFields.communicationPreferences",
        "extractedFields.onlineAccessServices",
        ...commonOptional,
      ],
      conditional: ["extractedFields.qualifiedInvestorDeclaration_if_present"],
      notApplicableRules: ["document may be onboarding without product holding"],
      matchingKeys: ["investorFullName", "birthDate", "maskedPersonalId", "email", "phone"],
      crmMappingTarget: "investment_onboarding",
      reviewRules: ["must not be auto-labeled as investment product contract"],
      suggestedActionRules: [
        "create_or_link_client",
        "create_task_onboarding",
        "create_opportunity",
      ],
    },
  },
  investment_subscription_document: {
    primaryType: "investment_subscription_document",
    allowedLifecycle: ["proposal", "final_contract", "onboarding_form", "unknown"],
    subtypeHints: ["fund_subscription", "investment_order_form"],
    defaultIntent: "creates_new_product",
    extractionRules: {
      required: ["extractedFields.investorFullName", "extractedFields.productName"],
      optional: ["extractedFields.contributionAmount", ...commonOptional],
      conditional: ["extractedFields.signedDate_if_present"],
      notApplicableRules: ["bank-statement specific fields are not_applicable"],
      matchingKeys: ["investorFullName", "birthDate", "maskedPersonalId", "email"],
      crmMappingTarget: "contracts(segment=INV)",
      reviewRules: ["ensure lifecycle not misclassified as final when proposal"],
      suggestedActionRules: ["create_or_link_client", "create_contract_record", "create_task"],
    },
  },
  liability_insurance_offer: {
    primaryType: "liability_insurance_offer",
    allowedLifecycle: ["offer", "proposal", "unknown"],
    subtypeHints: ["employer_liability_offer"],
    defaultIntent: "illustrative_only",
    extractionRules: {
      required: ["extractedFields.offerType", "extractedFields.productArea"],
      optional: [
        "extractedFields.insurer",
        "extractedFields.premium",
        "extractedFields.paymentFrequency",
        "extractedFields.coverageLimit",
        "extractedFields.deductible",
        ...commonOptional,
      ],
      conditional: ["extractedFields.offerValidDate_if_present"],
      notApplicableRules: ["bindingContract should be false by default"],
      matchingKeys: ["insuredPersonName", "yearOfBirth", "brokerName"],
      crmMappingTarget: "opportunities(segment=ODP)",
      reviewRules: ["must not be represented as signed contract"],
      suggestedActionRules: [
        "create_or_link_client",
        "create_opportunity",
        "create_task_followup",
      ],
    },
  },
  insurance_comparison: {
    primaryType: "insurance_comparison",
    allowedLifecycle: ["comparison", "offer", "unknown"],
    subtypeHints: ["insurance_market_comparison"],
    defaultIntent: "illustrative_only",
    extractionRules: {
      required: ["extractedFields.offerType", "extractedFields.productArea"],
      optional: ["extractedFields.includedRiders", "extractedFields.packageName", ...commonOptional],
      conditional: ["extractedFields.coverageLimit_if_present"],
      notApplicableRules: ["bindingContract is always false for comparison docs"],
      matchingKeys: ["insuredPersonName", "yearOfBirth", "brokerName"],
      crmMappingTarget: "opportunities(segment=ODP)",
      reviewRules: ["comparison never equals final contract"],
      suggestedActionRules: ["create_opportunity", "create_task_followup"],
    },
  },
  service_agreement: {
    primaryType: "service_agreement",
    allowedLifecycle: ["final_contract", "onboarding_form", "unknown"],
    subtypeHints: ["service_contract", "advisory_agreement"],
    defaultIntent: "reference_only",
    extractionRules: {
      required: ["extractedFields.companyName_or_provider", "extractedFields.investorFullName_or_clientName"],
      optional: ["extractedFields.serviceAgreementStatus", "extractedFields.signedDate", ...commonOptional],
      conditional: ["extractedFields.partnerCompany_if_present"],
      notApplicableRules: ["product obligation fields may be not_applicable"],
      matchingKeys: ["fullName", "birthDate", "maskedPersonalId", "address", "email"],
      crmMappingTarget: "documents+service_relation",
      reviewRules: ["service agreement is not automatically an investment position"],
      suggestedActionRules: ["create_or_link_client", "create_task"],
    },
  },
  generic_financial_document: {
    primaryType: "generic_financial_document",
    allowedLifecycle: [...DOCUMENT_LIFECYCLE_STATUSES],
    subtypeHints: ["generic_financial_document"],
    defaultIntent: "reference_only",
    extractionRules: {
      required: ["extractedFields.documentSummary"],
      optional: [...commonOptional, "extractedFields.primaryParties", "extractedFields.financialTerms"],
      conditional: [],
      notApplicableRules: ["type-specific required fields are not_applicable unless inferred with confidence"],
      matchingKeys: ["fullName", "birthDate", "email", "phone", "address"],
      crmMappingTarget: "documents",
      reviewRules: ["force manual review on low confidence"],
      suggestedActionRules: ["request_manual_review", "attach_to_existing_client"],
    },
  },
  unsupported_or_unknown: {
    primaryType: "unsupported_or_unknown",
    allowedLifecycle: ["unknown"],
    subtypeHints: ["unsupported_or_unknown"],
    defaultIntent: "manual_review_required",
    extractionRules: {
      required: [],
      optional: ["extractedFields.documentSummary", ...commonOptional],
      conditional: [],
      notApplicableRules: ["all finance-specific fields are not_applicable"],
      matchingKeys: [],
      crmMappingTarget: "documents",
      reviewRules: ["do not hallucinate unavailable text"],
      suggestedActionRules: ["request_manual_review"],
    },
  },
  life_insurance_final_contract: {
    primaryType: "life_insurance_final_contract",
    allowedLifecycle: ["final_contract"],
    subtypeHints: ["generali_bel_mondo_final_contract"],
    defaultIntent: "creates_new_product",
    extractionRules: {
      required: [
        "extractedFields.insurer",
        "extractedFields.productName",
        "extractedFields.contractNumber",
        "extractedFields.policyholder",
      ],
      optional: [
        "extractedFields.businessCaseNumber",
        "extractedFields.startDate",
        "extractedFields.endDate",
        "extractedFields.policyDuration",
        "extractedFields.totalMonthlyPremium",
        "extractedFields.riskPremium",
        "extractedFields.investmentPremium",
        "extractedFields.coverages",
        "extractedFields.investmentAllocation",
      ],
      conditional: ["extractedFields.paymentAccounts_if_present", "extractedFields.taxMode_if_present"],
      notApplicableRules: ["illustrative projection fields are not_applicable unless explicit"],
      matchingKeys: ["fullName", "birthDate", "maskedPersonalId", "email", "phone", "address", "householdMembers"],
      crmMappingTarget: "create_or_update_contract_record(segment=ZP)",
      reviewRules: ["must represent final contract", "intermediary fields must not be client identity"],
      suggestedActionRules: [
        "create_or_update_contract_record",
        "link_client",
        "link_household",
        "propose_financial_analysis_refresh",
        "create_service_review_task",
      ],
    },
  },
  life_insurance_change_request: {
    primaryType: "life_insurance_change_request",
    allowedLifecycle: ["endorsement_request", "policy_change_request", "unknown"],
    subtypeHints: ["cpp_neon_change_request"],
    defaultIntent: "modifies_existing_product",
    extractionRules: {
      required: [
        "extractedFields.insurer",
        "extractedFields.existingPolicyNumber",
        "extractedFields.requestedChanges",
      ],
      optional: [
        "extractedFields.changedCoverages",
        "extractedFields.removedCoverages",
        "extractedFields.addedCoverages",
        "extractedFields.healthQuestionnairePresent",
      ],
      conditional: ["extractedFields.loanLinkedCoverageFlag_if_present", "extractedFields.signedOrunsigned_if_detectable"],
      notApplicableRules: ["new contract creation is not_applicable by default"],
      matchingKeys: ["existingPolicyNumber", "fullName", "birthDate", "maskedPersonalId"],
      crmMappingTarget: "attach_to_existing_contract",
      reviewRules: ["never classify as new contract by default"],
      suggestedActionRules: [
        "attach_to_existing_contract",
        "create_service_task",
        "request_contract_mapping",
        "request_manual_review",
      ],
    },
  },
  life_insurance_modelation: {
    primaryType: "life_insurance_modelation",
    allowedLifecycle: ["illustration", "modelation", "non_binding_projection", "unknown"],
    subtypeHints: ["kooperativa_flexi_modelation"],
    defaultIntent: "illustrative_only",
    extractionRules: {
      required: ["extractedFields.insurer", "extractedFields.productName", "extractedFields.modelationId"],
      optional: [
        "extractedFields.selectedCoverages",
        "extractedFields.modelPremium",
        "extractedFields.investmentScenario",
        "extractedFields.investmentFunds",
        "extractedFields.requiredDocuments",
      ],
      conditional: ["extractedFields.policyStartIfIllustrated_if_present"],
      notApplicableRules: ["final contract fields are not_applicable for modelation"],
      matchingKeys: ["fullName", "birthDate", "maskedPersonalId", "email", "phone"],
      crmMappingTarget: "opportunity+documents",
      reviewRules: ["explicitly mark as non-binding projection"],
      suggestedActionRules: [
        "create_opportunity",
        "attach_to_client_documents",
        "schedule_consultation",
        "prepare_comparison",
      ],
    },
  },
  payslip_document: {
    primaryType: "payslip_document",
    allowedLifecycle: ["payroll_statement", "income_proof", "unknown"],
    subtypeHints: ["payroll_slip"],
    defaultIntent: "supports_income_verification",
    extractionRules: {
      required: ["extractedFields.employerName", "extractedFields.employeeName", "extractedFields.netWage"],
      optional: [
        "extractedFields.periodMonth",
        "extractedFields.periodYear",
        "extractedFields.grossWage",
        "extractedFields.deductions",
        "extractedFields.paymentToAccountMasked",
      ],
      conditional: ["extractedFields.bonuses_if_present", "extractedFields.holidayCompensation_if_present"],
      notApplicableRules: ["product portfolio creation is not_applicable"],
      matchingKeys: ["employeeName", "birthDate", "address", "employerName"],
      crmMappingTarget: "income_verification_supporting_document",
      reviewRules: ["show summary only for wage and deductions"],
      suggestedActionRules: [
        "attach_to_client_or_company",
        "attach_to_existing_financing_deal",
        "update_income_profile",
        "mark_as_supporting_document",
      ],
    },
  },
  income_proof_document: {
    primaryType: "income_proof_document",
    allowedLifecycle: ["income_proof", "confirmation", "unknown"],
    subtypeHints: ["income_proof_document"],
    defaultIntent: "supports_income_verification",
    extractionRules: {
      required: ["extractedFields.employeeFullName_or_ownerName", "extractedFields.incomeSummary"],
      optional: ["extractedFields.employerName", "extractedFields.issueDate", "extractedFields.period"],
      conditional: ["extractedFields.incomeSource_if_present"],
      notApplicableRules: ["product contract fields are not_applicable"],
      matchingKeys: ["fullName", "birthDate", "address", "email", "phone"],
      crmMappingTarget: "income_verification_supporting_document",
      reviewRules: ["do not classify as product"],
      suggestedActionRules: [
        "attach_to_client_or_company",
        "attach_to_existing_financing_deal",
        "update_income_profile",
        "mark_as_supporting_document",
      ],
    },
  },
  corporate_tax_return: {
    primaryType: "corporate_tax_return",
    allowedLifecycle: ["tax_return", "unknown"],
    subtypeHints: ["corporate_income_tax_return"],
    defaultIntent: "supports_underwriting_or_bonita",
    extractionRules: {
      required: ["extractedFields.companyName", "extractedFields.ico", "extractedFields.taxPeriodFrom", "extractedFields.taxPeriodTo"],
      optional: [
        "extractedFields.dic",
        "extractedFields.mainBusinessActivity",
        "extractedFields.resultOfOperations",
        "extractedFields.taxBaseSignals",
      ],
      conditional: ["extractedFields.advisorFiledFlag_if_present"],
      notApplicableRules: ["client product creation is not_applicable by default"],
      matchingKeys: ["companyName", "ico", "officeAddress", "ownerNameIfPresent"],
      crmMappingTarget: "company_income_verification_supporting_document",
      reviewRules: ["do not place into personal product portfolio"],
      suggestedActionRules: [
        "create_or_link_company_entity",
        "attach_to_business_client",
        "attach_to_loan_or_financing_deal",
        "create_manual_review_task",
      ],
    },
  },
  self_employed_tax_or_income_document: {
    primaryType: "self_employed_tax_or_income_document",
    allowedLifecycle: ["tax_or_income_proof", "income_proof", "tax_return", "unknown"],
    subtypeHints: ["osvc_tax_or_income_document"],
    defaultIntent: "supports_underwriting_or_bonita",
    extractionRules: {
      required: ["extractedFields.ownerName", "extractedFields.taxOrIncomePeriod"],
      optional: ["extractedFields.ico_if_present", "extractedFields.netIncomeSummary", "extractedFields.expenseSummary"],
      conditional: ["extractedFields.taxBaseSignals_if_present"],
      notApplicableRules: ["new product creation is not_applicable by default"],
      matchingKeys: ["ownerName", "birthDate", "maskedPersonalId", "ico"],
      crmMappingTarget: "bonita_supporting_document",
      reviewRules: ["requires manual review when owner/company ambiguity"],
      suggestedActionRules: [
        "attach_to_client_or_company",
        "attach_to_existing_financing_deal",
        "create_manual_review_task",
      ],
    },
  },
  insurance_policy_change_or_service_doc: {
    primaryType: "insurance_policy_change_or_service_doc",
    allowedLifecycle: ["policy_change_request", "endorsement_request", "unknown"],
    subtypeHints: ["insurance_policy_change_or_service_doc"],
    defaultIntent: "modifies_existing_product",
    extractionRules: {
      required: ["extractedFields.insurer", "extractedFields.existingPolicyNumber_or_reference"],
      optional: ["extractedFields.requestedChanges", "extractedFields.serviceNotes"],
      conditional: ["extractedFields.signedOrunsigned_if_detectable"],
      notApplicableRules: ["new product record creation is not_applicable by default"],
      matchingKeys: ["existingPolicyNumber", "fullName", "birthDate", "maskedPersonalId"],
      crmMappingTarget: "existing_contract_service_update",
      reviewRules: ["if existing contract missing -> manual mapping required"],
      suggestedActionRules: [
        "attach_to_existing_contract",
        "create_service_task",
        "request_contract_mapping",
        "request_manual_review",
      ],
    },
  },
};

function toLifecycle(
  raw: unknown,
  fallback: DocumentLifecycleStatus
): DocumentLifecycleStatus {
  const t = String(raw ?? "").trim();
  if ((DOCUMENT_LIFECYCLE_STATUSES as readonly string[]).includes(t)) {
    return t as DocumentLifecycleStatus;
  }
  return fallback;
}

export function classifyLifecycleFromPrimary(
  primaryType: (typeof PRIMARY_DOCUMENT_TYPES)[number],
  proposed?: unknown
): DocumentLifecycleStatus {
  const fallbackMap: Record<(typeof PRIMARY_DOCUMENT_TYPES)[number], DocumentLifecycleStatus> = {
    life_insurance_final_contract: "final_contract",
    life_insurance_contract: "final_contract",
    life_insurance_proposal: "proposal",
    life_insurance_change_request: "policy_change_request",
    life_insurance_modelation: "illustration",
    consumer_loan_contract: "final_contract",
    consumer_loan_with_payment_protection: "final_contract",
    mortgage_document: "unknown",
    payslip_document: "payroll_statement",
    income_proof_document: "income_proof",
    income_confirmation: "confirmation",
    corporate_tax_return: "tax_return",
    self_employed_tax_or_income_document: "tax_or_income_proof",
    insurance_policy_change_or_service_doc: "policy_change_request",
    bank_statement: "statement",
    investment_service_agreement: "onboarding_form",
    investment_subscription_document: "proposal",
    liability_insurance_offer: "offer",
    insurance_comparison: "comparison",
    service_agreement: "final_contract",
    generic_financial_document: "unknown",
    unsupported_or_unknown: "unknown",
  };
  return toLifecycle(proposed, fallbackMap[primaryType]);
}

export function classifyIntentFromClassification(params: {
  primaryType: (typeof PRIMARY_DOCUMENT_TYPES)[number];
  lifecycleStatus: DocumentLifecycleStatus;
}): DocumentIntent {
  const schemaIntent = DOCUMENT_SCHEMA_REGISTRY[params.primaryType]?.defaultIntent;
  if (schemaIntent) {
    if (params.lifecycleStatus === "proposal" || params.lifecycleStatus === "offer") {
      if (schemaIntent === "creates_new_product") return "illustrative_only";
    }
    if (params.lifecycleStatus === "policy_change_request" || params.lifecycleStatus === "endorsement_request") {
      return "modifies_existing_product";
    }
    if (
      params.lifecycleStatus === "illustration" ||
      params.lifecycleStatus === "modelation" ||
      params.lifecycleStatus === "non_binding_projection"
    ) {
      return "illustrative_only";
    }
    return schemaIntent;
  }
  return "reference_only";
}

export function buildSchemaPrompt(
  schemaDef: DocumentSchemaDefinition,
  isScanFallback: boolean
): string {
  const scanHint = isScanFallback
    ? "Dokument je pravděpodobně scan. U nečitelných dat použij status inferred_low_confidence nebo not_found."
    : "";
  return `Jsi extrakční engine pro finanční dokumenty.\n${scanHint}\n\n` +
    `Dokument klasifikace:\n` +
    `- primaryType: ${schemaDef.primaryType}\n` +
    `- allowedLifecycle: ${schemaDef.allowedLifecycle.join(", ")}\n` +
    `- subtypeHints: ${schemaDef.subtypeHints.join(", ")}\n\n` +
    `Vrať JEDINĚ platný JSON dle struktury DocumentReviewEnvelope:\n` +
    `- documentClassification{primaryType, subtype, lifecycleStatus, documentIntent, confidence, reasons}\n` +
    `- documentMeta{fileName,pageCount,issuer,documentDate,language,scannedVsDigital,overallConfidence}\n` +
    `- parties{}\n` +
    `- productsOrObligations[]\n` +
    `- financialTerms{}\n` +
    `- serviceTerms{}\n` +
    `- extractedFields{ [fieldKey]: {value, confidence, sourcePage, evidenceSnippet, status, sensitive?} }\n` +
    `- evidence[]\n` +
    `- candidateMatches{matchedClients,matchedHouseholds,matchedDeals,matchedCompanies,matchedContracts,score,reason,ambiguityFlags}\n` +
    `- sectionSensitivity\n` +
    `- relationshipInference\n` +
    `- reviewWarnings[]\n` +
    `- suggestedActions[]\n` +
    `- dataCompleteness\n` +
    `- sensitivityProfile\n\n` +
    `Rules:\n` +
    `- required fields: ${schemaDef.extractionRules.required.join(", ") || "none"}\n` +
    `- optional fields: ${schemaDef.extractionRules.optional.join(", ") || "none"}\n` +
    `- conditional fields: ${schemaDef.extractionRules.conditional.join(", ") || "none"}\n` +
    `- not applicable rules: ${schemaDef.extractionRules.notApplicableRules.join(" | ") || "none"}\n` +
    `- matching keys: ${schemaDef.extractionRules.matchingKeys.join(", ") || "none"}\n` +
    `- CRM mapping target: ${schemaDef.extractionRules.crmMappingTarget}\n` +
    `- review rules: ${schemaDef.extractionRules.reviewRules.join(" | ") || "none"}\n` +
    `- suggested action rules: ${schemaDef.extractionRules.suggestedActionRules.join(", ") || "none"}\n\n` +
    `Field status semantics:\n` +
    `- explicitly_not_selected použij pro \"nesjednáno\".\n` +
    `- not_applicable když pole pro tento typ dokumentu nedává smysl.\n` +
    `- missing když je pole required, ale chybí v dokumentu.\n` +
    `- not_found když dokument je relevantní, ale údaj se nepodařilo najít.\n`;
}

export function safeParseReviewEnvelope(raw: string): {
  ok: true;
  data: DocumentReviewEnvelope;
} | {
  ok: false;
  issues: z.ZodIssue[];
} {
  let parsed: unknown;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return {
      ok: false,
      issues: [{ code: "custom", path: [], message: e instanceof Error ? e.message : String(e) }],
    };
  }
  const result = documentReviewEnvelopeSchema.safeParse(parsed);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, issues: result.error.issues };
}

