import { z } from "zod";
import {
  DOCUMENT_LIFECYCLE_STATUSES,
  PRIMARY_DOCUMENT_TYPES,
  type DocumentIntent,
  type DocumentLifecycleStatus,
  type DocumentReviewEnvelope,
  documentReviewEnvelopeSchema,
} from "./document-review-types";
import { coerceReviewEnvelopeParsedJson } from "./envelope-parse-coerce";

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
        // Primary person (policyholder / main insured)
        "extractedFields.fullName",
        "extractedFields.birthDate",
        "extractedFields.personalId",
        "extractedFields.address",
        "extractedFields.phone",
        "extractedFields.email",
        "extractedFields.occupation",
        "extractedFields.sports",
        // Multi-person structured arrays (Phase 3)
        "extractedFields.insuredPersons",   // JSON array of persons with roles
        "extractedFields.coverages",         // JSON array of risks per person
        "extractedFields.riders",            // JSON array of riders
        "extractedFields.beneficiaries",     // JSON array of beneficiaries
        // Contract core
        "extractedFields.policyEndDate",
        "extractedFields.contractNumber",
        "extractedFields.policyDuration",
        "extractedFields.dateSigned",
        // Payment
        "extractedFields.totalMonthlyPremium",
        "extractedFields.annualPremium",
        "extractedFields.riskPremium",
        "extractedFields.paymentFrequency",
        "extractedFields.paymentAccountNumber",
        "extractedFields.bankAccount",
        "extractedFields.iban",
        "extractedFields.variableSymbol",
        "extractedFields.bankCode",
        // Risk benefits (flat fallback if not in coverages array)
        "extractedFields.deathBenefit",
        "extractedFields.accidentBenefit",
        "extractedFields.disabilityBenefit",
        "extractedFields.hospitalizationBenefit",
        "extractedFields.seriousIllnessBenefit",
        // Intermediary
        "extractedFields.intermediaryName",
        "extractedFields.intermediaryCode",
        "extractedFields.intermediaryCompany",
        ...commonOptional,
      ],
      conditional: [
        "extractedFields.contractNumber_or_proposalNumber",
        "extractedFields.bankPaymentInfo_if_present",
        // Phase 3: multi-person structured output when >1 person detected
        "parties.policyholder_if_multiple_persons",
        "parties.insured_if_differs_from_policyholder",
        "parties.child_insured_if_present",
      ],
      notApplicableRules: [
        "collateral is not_applicable for life insurance unless explicit",
        "companyId not required for natural persons",
        "investment fields not_applicable for pure risk life insurance",
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
        // Phase 3 multi-person rules
        "when multiple persons detected: each must have a role (policyholder|insured|child_insured|beneficiary)",
        "coverages must be linked to a participant name when multiple persons present",
        "health questionnaire sections must set sectionSensitivity.health_section = health_data",
        "bundle detection: if health/AML/payment sections present add reviewWarning multi_section_bundle_detected",
      ],
      suggestedActionRules: [
        "create_or_link_client",
        "create_contract_record",
        "create_task",
        "request_manual_review_on_ambiguity",
      ],
    },
  },
  life_insurance_investment_contract: {
    primaryType: "life_insurance_investment_contract",
    allowedLifecycle: ["final_contract", "proposal", "annex", "unknown"],
    subtypeHints: ["generali_bel_mondo_investment", "csob_invest_zivot", "uniqa_invest"],
    defaultIntent: "creates_new_product",
    extractionRules: {
      required: [
        "extractedFields.insurer",
        "extractedFields.productName",
        "extractedFields.contractNumber",
        "extractedFields.policyStartDate",
        "extractedFields.investmentStrategy",
      ],
      optional: [
        "extractedFields.fullName",
        "extractedFields.birthDate",
        "extractedFields.personalId",
        "extractedFields.address",
        "extractedFields.phone",
        "extractedFields.email",
        "extractedFields.policyEndDate",
        "extractedFields.totalMonthlyPremium",
        "extractedFields.annualPremium",
        "extractedFields.paymentFrequency",
        "extractedFields.paymentAccountNumber",
        "extractedFields.iban",
        "extractedFields.variableSymbol",
        "extractedFields.bankCode",
        "extractedFields.occupation",
        "extractedFields.sports",
        "extractedFields.intermediaryName",
        "extractedFields.intermediaryCode",
        "extractedFields.intermediaryCompany",
        "extractedFields.dateSigned",
        "extractedFields.insuredPersons",
        "extractedFields.deathBenefit",
        "extractedFields.accidentBenefit",
        "extractedFields.disabilityBenefit",
        "extractedFields.hospitalizationBenefit",
        "extractedFields.seriousIllnessBenefit",
        "extractedFields.riskPremium",
        "extractedFields.investmentPremium",
        "extractedFields.investmentFunds",
        "extractedFields.fundAllocation",
        "extractedFields.regularExtraContribution",
        "extractedFields.feeStructure",
        "extractedFields.coverages",
        "extractedFields.riders",
        "extractedFields.beneficiaries",
        ...commonOptional,
      ],
      conditional: [
        "extractedFields.paymentAccounts_if_present",
        "extractedFields.surrenderValue_if_available",
        // Phase 3 multi-person and investment
        "parties.policyholder_if_multiple_persons",
        "parties.insured_if_differs_from_policyholder",
      ],
      notApplicableRules: [
        "pure risk coverage fields may not apply if no risk rider",
      ],
      matchingKeys: [
        "fullName", "birthDate", "maskedPersonalId", "email", "phone", "address", "householdMembers",
      ],
      crmMappingTarget: "contracts(segment=ZP_INV)",
      reviewRules: [
        "proposal must never be marked as final contract",
        "investment allocation must sum to 100% if present",
        "intermediary fields must not be merged into client contacts",
        // Phase 3 investment rules
        "investmentFunds must be JSON array if multiple funds present",
        "investmentStrategy must distinguish modeled vs contractual",
        "when multiple persons detected: each must have role in parties",
        "bundle detection: health questionnaire section sets sectionSensitivity.health_section = health_data",
      ],
      suggestedActionRules: [
        "create_or_link_client",
        "create_or_update_contract_record",
        "link_household",
        "create_task",
        "propose_financial_analysis_refresh",
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
        "extractedFields.fullName",
        "extractedFields.firstName",
        "extractedFields.lastName",
        "extractedFields.birthDate",
        "extractedFields.personalId",
        "extractedFields.address",
        "extractedFields.permanentAddress",
        "extractedFields.phone",
        "extractedFields.email",
        "extractedFields.productType",
        "extractedFields.productSummary",
        "extractedFields.policyStartDate",
        "extractedFields.policyEndDate",
        "extractedFields.policyDuration",
        "extractedFields.effectiveDate",
        "extractedFields.documentIssueDate",
        "extractedFields.modelationDate",
        "extractedFields.documentSummary",
        "extractedFields.totalMonthlyPremium",
        "extractedFields.annualPremium",
        "extractedFields.currency",
        "extractedFields.paymentFrequency",
        "extractedFields.paymentAccountNumber",
        "extractedFields.iban",
        "extractedFields.variableSymbol",
        "extractedFields.specificSymbol",
        "extractedFields.constantSymbol",
        "extractedFields.bankCode",
        "extractedFields.occupation",
        "extractedFields.sports",
        "extractedFields.intermediaryName",
        "extractedFields.intermediaryCode",
        "extractedFields.intermediaryCompany",
        "extractedFields.intermediaryPhone",
        "extractedFields.intermediaryEmail",
        "extractedFields.dateSigned",
        "extractedFields.insuredPersons",
        "extractedFields.deathBenefit",
        "extractedFields.accidentBenefit",
        "extractedFields.disabilityBenefit",
        "extractedFields.hospitalizationBenefit",
        "extractedFields.seriousIllnessBenefit",
        "extractedFields.selectedCoverages",
        "extractedFields.coverages",
        "extractedFields.riders",
        "extractedFields.insuredRisks",
        "extractedFields.modelPremium",
        "extractedFields.investmentScenario",
        "extractedFields.investmentFunds",
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
  nonlife_insurance_contract: {
    primaryType: "nonlife_insurance_contract",
    allowedLifecycle: ["final_contract", "proposal", "offer", "annex", "unknown"],
    subtypeHints: ["property_insurance", "vehicle_insurance", "travel_insurance", "liability_insurance"],
    defaultIntent: "creates_new_product",
    extractionRules: {
      required: [
        "extractedFields.insurer",
        "extractedFields.productName",
        "extractedFields.contractNumber",
        "extractedFields.policyStartDate",
        "extractedFields.insuredObject",
      ],
      optional: [
        "extractedFields.fullName",
        "extractedFields.birthDate",
        "extractedFields.personalId",
        "extractedFields.address",
        "extractedFields.phone",
        "extractedFields.email",
        "extractedFields.policyEndDate",
        "extractedFields.annualPremium",
        "extractedFields.paymentFrequency",
        "extractedFields.paymentAccountNumber",
        "extractedFields.iban",
        "extractedFields.variableSymbol",
        "extractedFields.bankCode",
        "extractedFields.intermediaryName",
        "extractedFields.intermediaryCode",
        "extractedFields.dateSigned",
        "extractedFields.coverageLimit",
        "extractedFields.deductible",
        "extractedFields.insuredRisks",
        "extractedFields.insuredAddress",
        ...commonOptional,
      ],
      conditional: ["extractedFields.coinsured_if_present"],
      notApplicableRules: ["investment and life-specific fields are not_applicable"],
      matchingKeys: ["fullName", "birthDate", "maskedPersonalId", "email", "phone", "address"],
      crmMappingTarget: "contracts(segment=NZP)",
      reviewRules: ["distinguish between offer and signed contract"],
      suggestedActionRules: [
        "create_or_link_client",
        "create_contract_record",
        "create_task",
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
  pension_contract: {
    primaryType: "pension_contract",
    allowedLifecycle: ["final_contract", "proposal", "annex", "unknown"],
    subtypeHints: [
      "doplňkové_penzijní_spoření_DPS",
      "penzijní_připojištění_PP",
      "transformovaný_fond_v_rámci_DPS",
      "transformovany_fond",
      "doplnkove_penzijni_sporeni",
      "penzijni_pripojisteni",
    ],
    defaultIntent: "creates_new_product",
    extractionRules: {
      required: [
        "extractedFields.provider",
        "extractedFields.productName",
        "extractedFields.contractNumber",
        "extractedFields.participantFullName",
      ],
      optional: [
        "extractedFields.contributionParticipant",
        "extractedFields.contributionEmployer",
        "extractedFields.stateContribution",
        "extractedFields.investmentStrategy",
        "extractedFields.beneficiaries",
        "extractedFields.startDate",
        "extractedFields.paymentFrequency",
        ...commonOptional,
      ],
      conditional: ["extractedFields.taxOptimization_if_present"],
      notApplicableRules: ["loan-specific fields are not_applicable"],
      matchingKeys: ["participantFullName", "birthDate", "maskedPersonalId", "email", "phone", "address"],
      crmMappingTarget: "contracts(segment=PP)",
      reviewRules: [
        "DPS (doplňkové penzijní spoření) a PP (penzijní připojištění) jsou různé produkty — neoznačuj jeden jako druhý",
        "transformovaný fond u DPS ≠ samostatná investiční platforma typu FUNDOO/Amundi",
      ],
      suggestedActionRules: [
        "create_or_link_client",
        "create_contract_record",
        "create_task",
        "propose_financial_analysis_refresh",
      ],
    },
  },
  investment_modelation: {
    primaryType: "investment_modelation",
    allowedLifecycle: ["illustration", "modelation", "non_binding_projection", "unknown"],
    subtypeHints: ["fund_modelation", "portfolio_projection", "investment_illustration"],
    defaultIntent: "illustrative_only",
    extractionRules: {
      required: [
        "extractedFields.provider",
        "extractedFields.productName",
      ],
      optional: [
        "extractedFields.projectedReturn",
        "extractedFields.investmentHorizon",
        "extractedFields.riskProfile",
        "extractedFields.proposedFunds",
        "extractedFields.regularContribution",
        "extractedFields.oneOffContribution",
        "extractedFields.feeProjection",
        ...commonOptional,
      ],
      conditional: ["extractedFields.scenarioComparison_if_present"],
      notApplicableRules: ["final contract and binding fields are not_applicable"],
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
  payment_instruction: {
    primaryType: "payment_instruction",
    allowedLifecycle: ["confirmation", "statement", "unknown"],
    subtypeHints: ["insurance_payment", "loan_repayment", "standing_order"],
    defaultIntent: "reference_only",
    extractionRules: {
      required: [
        "extractedFields.provider",
        "extractedFields.bankAccount",
        "extractedFields.variableSymbol",
      ],
      optional: [
        "extractedFields.productName",
        "extractedFields.contractReference",
        "extractedFields.iban",
        "extractedFields.bic",
        "extractedFields.bankCode",
        "extractedFields.specificSymbol",
        "extractedFields.regularAmount",
        "extractedFields.oneOffAmount",
        "extractedFields.currency",
        "extractedFields.paymentFrequency",
        "extractedFields.firstPaymentDate",
        "extractedFields.paymentPurpose",
        "extractedFields.paymentType",
        "extractedFields.minimumInvestment",
        "extractedFields.separateInstructionsCZK",
        "extractedFields.separateInstructionsEUR",
        "extractedFields.separateInstructionsUSD",
        ...commonOptional,
      ],
      conditional: ["extractedFields.clientName_if_present"],
      notApplicableRules: ["contract creation fields are not_applicable unless explicit contract reference"],
      matchingKeys: ["clientName", "contractReference", "variableSymbol", "iban"],
      crmMappingTarget: "payment_setup+portal",
      reviewRules: [
        "payment instruction is never a contract",
        "incomplete payment details must go to review",
        "validate IBAN format",
        "validate variable symbol format",
      ],
      suggestedActionRules: [
        "create_payment_setup",
        "attach_to_existing_contract",
        "attach_to_existing_client",
        "request_manual_review",
      ],
    },
  },
  investment_payment_instruction: {
    primaryType: "investment_payment_instruction",
    allowedLifecycle: ["confirmation", "statement", "unknown"],
    subtypeHints: [
      "fundoo_pravidelna_investice",
      "fundoo_jednorazova_investice",
      "amundi_typicky_poskytovatel",
      "fundoo_investment",
      "amundi_investment",
      "conseq_investment",
    ],
    defaultIntent: "reference_only",
    extractionRules: {
      required: [
        "extractedFields.platform",
        "extractedFields.bankAccount",
      ],
      optional: [
        "extractedFields.productName",
        "extractedFields.investmentType",
        "extractedFields.contractReference",
        "extractedFields.clientName",
        "extractedFields.variableSymbol",
        "extractedFields.specificSymbol",
        "extractedFields.iban",
        "extractedFields.bic",
        "extractedFields.bankCode",
        "extractedFields.regularAmount",
        "extractedFields.oneOffAmount",
        "extractedFields.currency",
        "extractedFields.paymentFrequency",
        "extractedFields.firstPaymentDate",
        "extractedFields.minimumInvestment",
        "extractedFields.separateInstructionsCZK",
        "extractedFields.separateInstructionsEUR",
        "extractedFields.separateInstructionsUSD",
        "extractedFields.paymentPurpose",
        ...commonOptional,
      ],
      conditional: ["extractedFields.fundName_if_present"],
      notApplicableRules: ["contract creation and insurance fields are not_applicable"],
      matchingKeys: ["clientName", "contractReference", "variableSymbol", "iban"],
      crmMappingTarget: "payment_setup+portal",
      reviewRules: [
        "investment payment instruction is never a contract",
        "FUNDOO = pouze investice (pravidelná nebo jednorázová); typický správce/platforma Amundi — ne DPS ani PP",
        "DIP je jiný režim než čistý fondový příkaz; při stopách obou označ nižší jistotu",
        "validate IBAN and account format",
        "separate CZK/EUR/USD instructions if present",
      ],
      suggestedActionRules: [
        "create_payment_setup",
        "attach_to_existing_contract",
        "attach_to_existing_client",
        "request_manual_review",
      ],
    },
  },
  payment_schedule: {
    primaryType: "payment_schedule",
    allowedLifecycle: ["statement", "confirmation", "unknown"],
    subtypeHints: ["loan_repayment_schedule", "insurance_premium_schedule"],
    defaultIntent: "reference_only",
    extractionRules: {
      required: [
        "extractedFields.provider",
        "extractedFields.contractReference",
      ],
      optional: [
        "extractedFields.clientName",
        "extractedFields.scheduleRows",
        "extractedFields.totalPayments",
        "extractedFields.paymentFrequency",
        "extractedFields.firstPaymentDate",
        "extractedFields.lastPaymentDate",
        "extractedFields.installmentAmount",
        ...commonOptional,
      ],
      conditional: ["extractedFields.interestBreakdown_if_present"],
      notApplicableRules: ["new product creation is not_applicable"],
      matchingKeys: ["clientName", "contractReference"],
      crmMappingTarget: "documents+contract_attachment",
      reviewRules: ["payment schedule is supplementary data, not a contract"],
      suggestedActionRules: [
        "attach_to_existing_contract",
        "attach_to_existing_client",
        "mark_as_supporting_document",
      ],
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
    subtypeHints: [
      "fundoo_amundi_subscription",
      "fund_subscription",
      "investment_order_form",
      "pravidelna_nebo_jednorazova_investice",
    ],
    defaultIntent: "creates_new_product",
    extractionRules: {
      required: ["extractedFields.investorFullName", "extractedFields.productName"],
      optional: ["extractedFields.contributionAmount", ...commonOptional],
      conditional: ["extractedFields.signedDate_if_present"],
      notApplicableRules: ["bank-statement specific fields are not_applicable"],
      matchingKeys: ["investorFullName", "birthDate", "maskedPersonalId", "email"],
      crmMappingTarget: "contracts(segment=INV)",
      reviewRules: [
        "ensure lifecycle not misclassified as final when proposal",
        "FUNDOO / Amundi úpis = investice, ne smlouva DPS ani PP",
      ],
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
  financial_analysis_document: {
    primaryType: "financial_analysis_document",
    allowedLifecycle: ["confirmation", "unknown"],
    subtypeHints: ["financial_analysis", "risk_assessment", "needs_analysis"],
    defaultIntent: "supports_financial_analysis",
    extractionRules: {
      required: ["extractedFields.clientName", "extractedFields.analysisDate"],
      optional: [
        "extractedFields.advisorName",
        "extractedFields.totalIncome",
        "extractedFields.totalExpenses",
        "extractedFields.existingProducts",
        "extractedFields.recommendations",
        "extractedFields.riskProfile",
        ...commonOptional,
      ],
      conditional: ["extractedFields.investmentHorizon_if_present"],
      notApplicableRules: ["product contract fields are not_applicable"],
      matchingKeys: ["clientName", "birthDate", "email", "phone", "address"],
      crmMappingTarget: "documents+financial_analysis",
      reviewRules: ["analysis document is not a product or contract"],
      suggestedActionRules: [
        "attach_to_existing_client",
        "propose_financial_analysis_update",
        "mark_as_supporting_document",
      ],
    },
  },
  precontract_information: {
    primaryType: "precontract_information",
    allowedLifecycle: ["offer", "proposal", "unknown"],
    subtypeHints: ["ipid", "kid", "precontract_info_sheet"],
    defaultIntent: "illustrative_only",
    extractionRules: {
      required: ["extractedFields.provider", "extractedFields.productName"],
      optional: [
        "extractedFields.productType",
        "extractedFields.coverageSummary",
        "extractedFields.exclusions",
        "extractedFields.premiumRange",
        ...commonOptional,
      ],
      conditional: [],
      notApplicableRules: ["contract-specific fields are not_applicable"],
      matchingKeys: ["clientName"],
      crmMappingTarget: "documents",
      reviewRules: ["precontract info is never a signed contract"],
      suggestedActionRules: [
        "attach_to_client_documents",
        "attach_to_existing_contract",
      ],
    },
  },
  identity_document: {
    primaryType: "identity_document",
    allowedLifecycle: ["confirmation", "unknown"],
    subtypeHints: ["citizen_id", "passport", "drivers_license", "residence_permit"],
    defaultIntent: "supports_underwriting_or_bonita",
    extractionRules: {
      required: ["extractedFields.documentType", "extractedFields.fullName"],
      optional: [
        "extractedFields.documentNumber",
        "extractedFields.birthDate",
        "extractedFields.nationality",
        "extractedFields.issuedDate",
        "extractedFields.expiryDate",
        "extractedFields.issuingAuthority",
        "extractedFields.address",
        ...commonOptional,
      ],
      conditional: ["extractedFields.maskedPersonalId_if_visible"],
      notApplicableRules: ["financial product fields are not_applicable"],
      matchingKeys: ["fullName", "birthDate", "maskedPersonalId"],
      crmMappingTarget: "documents+identity_verification",
      reviewRules: ["high sensitivity - identity data", "never auto-apply without review"],
      suggestedActionRules: [
        "attach_to_existing_client",
        "request_manual_review",
        "mark_as_supporting_document",
      ],
    },
  },
  medical_questionnaire: {
    primaryType: "medical_questionnaire",
    allowedLifecycle: ["confirmation", "unknown"],
    subtypeHints: ["health_questionnaire", "medical_report"],
    defaultIntent: "supports_underwriting_or_bonita",
    extractionRules: {
      required: ["extractedFields.clientName"],
      optional: [
        "extractedFields.questionnaireDate",
        "extractedFields.relatedContractNumber",
        "extractedFields.insurer",
        ...commonOptional,
      ],
      conditional: [],
      notApplicableRules: ["health data extraction requires explicit compliance clearance"],
      matchingKeys: ["clientName", "birthDate", "maskedPersonalId"],
      crmMappingTarget: "documents+health_underwriting",
      reviewRules: [
        "health_data sensitivity profile must be applied",
        "never extract specific health conditions without compliance flag",
      ],
      suggestedActionRules: [
        "attach_to_existing_client",
        "attach_to_existing_contract",
        "request_manual_review",
      ],
    },
  },
  consent_or_declaration: {
    primaryType: "consent_or_declaration",
    allowedLifecycle: ["confirmation", "unknown"],
    subtypeHints: ["gdpr_consent", "aml_declaration", "pep_declaration", "investment_risk_acknowledgment"],
    defaultIntent: "reference_only",
    extractionRules: {
      required: ["extractedFields.declarationType", "extractedFields.clientName"],
      optional: [
        "extractedFields.signedDate",
        "extractedFields.relatedContractNumber",
        "extractedFields.provider",
        ...commonOptional,
      ],
      conditional: [],
      notApplicableRules: ["product contract fields are not_applicable"],
      matchingKeys: ["clientName", "birthDate", "maskedPersonalId"],
      crmMappingTarget: "documents+compliance",
      reviewRules: ["consent is not a product document"],
      suggestedActionRules: [
        "attach_to_existing_client",
        "attach_to_existing_contract",
        "mark_as_supporting_document",
      ],
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
        "extractedFields.fullName",
        "extractedFields.birthDate",
        "extractedFields.personalId",
        "extractedFields.address",
        "extractedFields.phone",
        "extractedFields.email",
        "extractedFields.startDate",
        "extractedFields.endDate",
        "extractedFields.policyDuration",
        "extractedFields.totalMonthlyPremium",
        "extractedFields.annualPremium",
        "extractedFields.paymentFrequency",
        "extractedFields.paymentAccountNumber",
        "extractedFields.iban",
        "extractedFields.variableSymbol",
        "extractedFields.bankCode",
        "extractedFields.occupation",
        "extractedFields.sports",
        "extractedFields.intermediaryName",
        "extractedFields.intermediaryCode",
        "extractedFields.intermediaryCompany",
        "extractedFields.dateSigned",
        "extractedFields.insuredPersons",
        "extractedFields.deathBenefit",
        "extractedFields.accidentBenefit",
        "extractedFields.disabilityBenefit",
        "extractedFields.hospitalizationBenefit",
        "extractedFields.seriousIllnessBenefit",
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
        "extractedFields.fullName",
        "extractedFields.birthDate",
        "extractedFields.personalId",
        "extractedFields.address",
        "extractedFields.phone",
        "extractedFields.email",
        "extractedFields.changedCoverages",
        "extractedFields.removedCoverages",
        "extractedFields.addedCoverages",
        "extractedFields.paymentFrequency",
        "extractedFields.intermediaryName",
        "extractedFields.intermediaryCode",
        "extractedFields.dateSigned",
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
        "extractedFields.fullName",
        "extractedFields.firstName",
        "extractedFields.lastName",
        "extractedFields.birthDate",
        "extractedFields.personalId",
        "extractedFields.address",
        "extractedFields.permanentAddress",
        "extractedFields.phone",
        "extractedFields.email",
        "extractedFields.proposalNumber",
        "extractedFields.contractNumber",
        "extractedFields.policyholder",
        "extractedFields.productType",
        "extractedFields.productSummary",
        "extractedFields.policyStartDate",
        "extractedFields.policyEndDate",
        "extractedFields.policyDuration",
        "extractedFields.effectiveDate",
        "extractedFields.documentIssueDate",
        "extractedFields.modelationDate",
        "extractedFields.documentSummary",
        "extractedFields.totalMonthlyPremium",
        "extractedFields.annualPremium",
        "extractedFields.currency",
        "extractedFields.paymentFrequency",
        "extractedFields.paymentAccountNumber",
        "extractedFields.iban",
        "extractedFields.variableSymbol",
        "extractedFields.specificSymbol",
        "extractedFields.constantSymbol",
        "extractedFields.bankCode",
        "extractedFields.occupation",
        "extractedFields.sports",
        "extractedFields.intermediaryName",
        "extractedFields.intermediaryCode",
        "extractedFields.intermediaryCompany",
        "extractedFields.intermediaryPhone",
        "extractedFields.intermediaryEmail",
        "extractedFields.dateSigned",
        "extractedFields.coverages",
        "extractedFields.riders",
        "extractedFields.insuredRisks",
        "extractedFields.selectedCoverages",
        "extractedFields.insuredPersons",
        "extractedFields.deathBenefit",
        "extractedFields.accidentBenefit",
        "extractedFields.disabilityBenefit",
        "extractedFields.hospitalizationBenefit",
        "extractedFields.seriousIllnessBenefit",
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
        "create_or_link_client",
        "create_payment_setup",
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
    life_insurance_investment_contract: "final_contract",
    life_insurance_proposal: "proposal",
    life_insurance_change_request: "policy_change_request",
    life_insurance_modelation: "illustration",
    nonlife_insurance_contract: "final_contract",
    consumer_loan_contract: "final_contract",
    consumer_loan_with_payment_protection: "final_contract",
    mortgage_document: "unknown",
    pension_contract: "final_contract",
    investment_service_agreement: "onboarding_form",
    investment_subscription_document: "proposal",
    investment_modelation: "modelation",
    payment_instruction: "confirmation",
    investment_payment_instruction: "confirmation",
    payment_schedule: "statement",
    payslip_document: "payroll_statement",
    income_proof_document: "income_proof",
    income_confirmation: "confirmation",
    corporate_tax_return: "tax_return",
    self_employed_tax_or_income_document: "tax_or_income_proof",
    financial_analysis_document: "confirmation",
    insurance_policy_change_or_service_doc: "policy_change_request",
    bank_statement: "statement",
    liability_insurance_offer: "offer",
    insurance_comparison: "comparison",
    precontract_information: "offer",
    identity_document: "confirmation",
    medical_questionnaire: "confirmation",
    consent_or_declaration: "confirmation",
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

const PAYMENT_INSTRUCTION_PROMPT_ADDENDUM = `
KRITICKÉ POKYNY PRO PLATEBNÍ INSTRUKCE:
Tento dokument obsahuje platební pokyny. Extrahuj přesně:
- komu platit (provider/platform),
- na jaký účet (bankAccount, IBAN, bankCode),
- jaký symbol použít (variableSymbol, specificSymbol),
- kolik platit (regularAmount, oneOffAmount),
- jak často (paymentFrequency),
- v jaké měně (currency),
- od kdy (firstPaymentDate),
- co je účelem platby (paymentPurpose, paymentType),
- minimální investice (minimumInvestment), pokud je uvedena,
- pokud jsou oddělené instrukce pro CZK/EUR/USD, extrahuj je odděleně do separateInstructionsCZK, separateInstructionsEUR, separateInstructionsUSD.

Platební instrukce NIKDY NENÍ smlouva. Neoznačuj ji jako final_contract.
U chybějících platebních údajů přidej reviewWarning s kódem "incomplete_payment_details".
`;

const PROPOSAL_VS_CONTRACT_PROMPT_ADDENDUM = `
KRITICKÉ: Rozliš návrh/modelaci od finální smlouvy.
- "Pojistná smlouva" + číslo smlouvy + podpis/datum uzavření = finální smlouva.
- "Návrh pojistné smlouvy", "Detailní nabídka", "Modelace", "informační sdělení" = NÁVRH, ne smlouva.
- "může se lišit od konečné výše" = modelace.
- Pokud chybí finální doložka nebo podpis, raději označ jako proposal.
Nastav contentFlags.isFinalContract resp. contentFlags.isProposalOnly.
`;

const CHANGE_REQUEST_PROMPT_ADDENDUM = `
Tento dokument je změna/dodatek k existující smlouvě.
Vždy extrahuj referenci na existující číslo smlouvy (existingPolicyNumber).
Nikdy neoznačuj jako novou smlouvu.
`;

/** Czech market: DPS vs PP vs FUNDOO vs DIP — injected for pension & investment-related extraction. */
const CZECH_PENSION_VS_INVESTMENT_ADDENDUM = `
České pojmenování produktů (nepřekládej zkratky):
- DPS = doplňkové penzijní spoření. PP = penzijní připojištění. Jsou to různé režimy/produkty — v productName a subtype je rozliš.
- FUNDOO značí investici výhradně jako pravidelnou nebo jednorázovou; často Amundi jako správce nebo platforma. Není to smlouva DPS ani PP.
- DIP = dlouhodobý investiční produkt (daňový rámec). Liší se od běžného fondového příkazu (např. FUNDOO) i od DPS; při nejasnosti sniž confidence a uveď důvod v reasons.
`;

const PRIMARY_TYPES_WITH_CZECH_MARKET_ADDENDUM = new Set<string>([
  "pension_contract",
  "investment_payment_instruction",
  "investment_subscription_document",
  "investment_service_agreement",
  "investment_modelation",
]);

function getTypeSpecificAddendum(primaryType: string): string {
  if (primaryType === "payment_instruction" || primaryType === "investment_payment_instruction") {
    return PAYMENT_INSTRUCTION_PROMPT_ADDENDUM;
  }
  if (primaryType === "life_insurance_proposal" || primaryType === "life_insurance_modelation" ||
      primaryType === "investment_modelation" || primaryType === "precontract_information" ||
      primaryType === "liability_insurance_offer" || primaryType === "insurance_comparison") {
    return PROPOSAL_VS_CONTRACT_PROMPT_ADDENDUM;
  }
  if (primaryType === "life_insurance_change_request" || primaryType === "insurance_policy_change_or_service_doc") {
    return CHANGE_REQUEST_PROMPT_ADDENDUM;
  }
  if (primaryType === "life_insurance_final_contract" || primaryType === "life_insurance_contract" ||
      primaryType === "life_insurance_investment_contract" || primaryType === "nonlife_insurance_contract") {
    return PROPOSAL_VS_CONTRACT_PROMPT_ADDENDUM;
  }
  return "";
}

/**
 * Optional bundle context for type-specific schema prompts.
 * When provided, the prompt includes section-aware extraction rules.
 */
export type SchemaPromptBundleContext = {
  hasSensitiveAttachment?: boolean;
  hasInvestmentSection?: boolean;
  candidateTypes?: string[];
  hasSectionTexts?: boolean;
};

export function buildSchemaPrompt(
  schemaDef: DocumentSchemaDefinition,
  isScanFallback: boolean,
  bundleContext?: SchemaPromptBundleContext | null,
): string {
  const scanHint = isScanFallback
    ? "Dokument je pravděpodobně scan. U nečitelných dat použij status inferred_low_confidence nebo not_found. Pokud je kvalita nízká, přidej reviewWarning."
    : "";
  const typeAddendum =
    getTypeSpecificAddendum(schemaDef.primaryType) +
    (PRIMARY_TYPES_WITH_CZECH_MARKET_ADDENDUM.has(schemaDef.primaryType) ? CZECH_PENSION_VS_INVESTMENT_ADDENDUM : "");

  const bundleRules = buildBundleContextRules(schemaDef.primaryType, bundleContext);

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
    `- sensitivityProfile\n` +
    `- contentFlags{isFinalContract, isProposalOnly, containsPaymentInstructions, containsClientData, containsAdvisorData, containsMultipleDocumentSections}\n\n` +
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
    `- not_found když dokument je relevantní, ale údaj se nepodařilo najít.\n` +
    `Všechny textové hodnoty (reasons, reviewWarnings.message, suggestedActions.label apod.) piš VŽDY česky.\n` +
    typeAddendum +
    bundleRules;
}

/**
 * Build section-aware extraction rules for bundle documents.
 * Returns empty string for non-bundle or when no relevant context.
 */
function buildBundleContextRules(
  primaryType: string,
  bundleContext?: SchemaPromptBundleContext | null,
): string {
  if (!bundleContext) return "";

  const rules: string[] = [];

  if (bundleContext.hasSensitiveAttachment) {
    rules.push("BUNDLE: Dokument obsahuje citlivou přílohu (zdravotní dotazník nebo AML formulář). Tato data nepatří do contractual extraction — nastav sectionSensitivity.health_section nebo sectionSensitivity.aml_section.");
  }

  if (bundleContext.hasSectionTexts) {
    rules.push("SEKCE: Dostáváš oddělené textové bloky per sekci. Contractual facts (číslo smlouvy, pojistné, pojistník) taháš PRIMÁRNĚ ze SMLUVNÍ ČÁSTI. Zdravotní údaje NEPOUŽÍVEJ jako zdroj smluvních faktů.");
  }

  if (bundleContext.hasInvestmentSection) {
    rules.push("INVESTICE: investmentStrategy, investmentFunds, investmentPremium taháš PRIMÁRNĚ z INVESTIČNÍ SEKCE. Pokud je přítomná v textu, ne z jiných sekcí.");
  }

  const isLifeInsurance = primaryType.startsWith("life_insurance") || primaryType === "life_insurance_investment_contract";
  if (isLifeInsurance && bundleContext.candidateTypes?.includes("health_questionnaire")) {
    rules.push("ZDRAVOTNÍ SEKCE: Zdravotní dotazník je součástí bundlu. NEEXTRAHUJ z něj contractual facts (pojistník, pojistné, rizika, číslo smlouvy) pokud nejsou explicitně potvrzené ve smluvní části. Nastav contentFlags.containsMultipleDocumentSections = true.");
  }

  return rules.length > 0 ? `\nBUNDLE PRAVIDLA:\n${rules.map((r) => `- ${r}`).join("\n")}\n` : "";
}

export type SafeParseReviewEnvelopeOptions = {
  /** Align invalid/missing primaryType with pipeline classification before Zod. */
  expectedPrimaryType?: string;
};

export function safeParseReviewEnvelope(
  raw: string,
  options?: SafeParseReviewEnvelopeOptions,
): {
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

  const exp = options?.expectedPrimaryType;
  const tryParse = (value: unknown) => documentReviewEnvelopeSchema.safeParse(value);

  let result = tryParse(parsed);
  if (result.success) return { ok: true, data: result.data };

  let coerced = coerceReviewEnvelopeParsedJson(parsed, { mode: "light", expectedPrimaryType: exp });
  result = tryParse(coerced);
  if (result.success) return { ok: true, data: result.data };

  coerced = coerceReviewEnvelopeParsedJson(parsed, { mode: "aggressive", expectedPrimaryType: exp });
  result = tryParse(coerced);
  if (result.success) return { ok: true, data: result.data };

  return { ok: false, issues: result.error.issues };
}

