/**
 * Central prompt + model policy registry for copilot and AI Review.
 * Prompt IDs come from env (OpenAI Prompt Builder pmpt_*).
 */

export type PromptRegistryCategory = "copilot" | "ai_review" | "future_scan";

/** Keys for AI Review extraction / classifier prompts (env OPENAI_PROMPT_*). */
export const AI_REVIEW_PROMPT_KEYS = [
  "docClassifierV2",
  "insuranceContractExtraction",
  "insuranceProposalModelation",
  "insuranceAmendment",
  "nonLifeInsuranceExtraction",
  "carInsuranceExtraction",
  "investmentContractExtraction",
  "investmentProposal",
  "retirementProductExtraction",
  "dipExtraction",
  "buildingSavingsExtraction",
  "loanContractExtraction",
  "mortgageExtraction",
  "paymentInstructionsExtraction",
  "supportingDocumentExtraction",
  "legacyFinancialProductExtraction",
  "terminationDocumentExtraction",
  "consentIdentificationExtraction",
  "confirmationDocumentExtraction",
  "reviewDecision",
  "clientMatch",
] as const;

export type AiReviewPromptKey = (typeof AI_REVIEW_PROMPT_KEYS)[number];

const AI_REVIEW_ENV_KEYS: Record<AiReviewPromptKey, string> = {
  docClassifierV2: "OPENAI_PROMPT_AI_REVIEW_DOC_CLASSIFIER_ID",
  insuranceContractExtraction: "OPENAI_PROMPT_AI_REVIEW_INSURANCE_CONTRACT_EXTRACTION_ID",
  insuranceProposalModelation: "OPENAI_PROMPT_AI_REVIEW_INSURANCE_PROPOSAL_MODELATION_ID",
  insuranceAmendment: "OPENAI_PROMPT_AI_REVIEW_INSURANCE_AMENDMENT_ID",
  nonLifeInsuranceExtraction: "OPENAI_PROMPT_AI_REVIEW_NON_LIFE_INSURANCE_EXTRACTION_ID",
  carInsuranceExtraction: "OPENAI_PROMPT_AI_REVIEW_CAR_INSURANCE_EXTRACTION_ID",
  investmentContractExtraction: "OPENAI_PROMPT_AI_REVIEW_INVESTMENT_CONTRACT_EXTRACTION_ID",
  investmentProposal: "OPENAI_PROMPT_AI_REVIEW_INVESTMENT_PROPOSAL_ID",
  retirementProductExtraction: "OPENAI_PROMPT_AI_REVIEW_RETIREMENT_PRODUCT_EXTRACTION_ID",
  dipExtraction: "OPENAI_PROMPT_AI_REVIEW_DIP_EXTRACTION_ID",
  buildingSavingsExtraction: "OPENAI_PROMPT_AI_REVIEW_BUILDING_SAVINGS_EXTRACTION_ID",
  loanContractExtraction: "OPENAI_PROMPT_AI_REVIEW_LOAN_CONTRACT_EXTRACTION_ID",
  mortgageExtraction: "OPENAI_PROMPT_AI_REVIEW_MORTGAGE_EXTRACTION_ID",
  paymentInstructionsExtraction: "OPENAI_PROMPT_AI_REVIEW_PAYMENT_INSTRUCTIONS_EXTRACTION_ID",
  supportingDocumentExtraction: "OPENAI_PROMPT_AI_REVIEW_SUPPORTING_DOCUMENT_EXTRACTION_ID",
  legacyFinancialProductExtraction: "OPENAI_PROMPT_AI_REVIEW_LEGACY_FINANCIAL_PRODUCT_EXTRACTION_ID",
  terminationDocumentExtraction: "OPENAI_PROMPT_AI_REVIEW_TERMINATION_DOCUMENT_ID",
  consentIdentificationExtraction: "OPENAI_PROMPT_AI_REVIEW_CONSENT_IDENTIFICATION_ID",
  confirmationDocumentExtraction: "OPENAI_PROMPT_AI_REVIEW_CONFIRMATION_DOCUMENT_ID",
  reviewDecision: "OPENAI_PROMPT_AI_REVIEW_REVIEW_DECISION_ID",
  clientMatch: "OPENAI_PROMPT_AI_REVIEW_CLIENT_MATCH_ID",
};

const AI_REVIEW_VERSION_KEYS: Partial<Record<AiReviewPromptKey, string>> = {
  docClassifierV2: "OPENAI_PROMPT_AI_REVIEW_DOC_CLASSIFIER_VERSION",
  reviewDecision: "OPENAI_PROMPT_AI_REVIEW_REVIEW_DECISION_VERSION",
  clientMatch: "OPENAI_PROMPT_AI_REVIEW_CLIENT_MATCH_VERSION",
};

export type AiReviewRegistryEntry = {
  key: AiReviewPromptKey;
  category: PromptRegistryCategory;
  envKey: string;
  versionEnvKey?: string;
  purpose: string;
};

export const AI_REVIEW_REGISTRY: Record<AiReviewPromptKey, AiReviewRegistryEntry> = {
  docClassifierV2: {
    key: "docClassifierV2",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.docClassifierV2,
    versionEnvKey: AI_REVIEW_VERSION_KEYS.docClassifierV2,
    purpose: "Document type / product family classifier (v2)",
  },
  insuranceContractExtraction: {
    key: "insuranceContractExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.insuranceContractExtraction,
    purpose: "Life insurance contract extraction",
  },
  insuranceProposalModelation: {
    key: "insuranceProposalModelation",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.insuranceProposalModelation,
    purpose: "Insurance proposal / modelation",
  },
  insuranceAmendment: {
    key: "insuranceAmendment",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.insuranceAmendment,
    purpose: "Insurance amendment / change",
  },
  nonLifeInsuranceExtraction: {
    key: "nonLifeInsuranceExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.nonLifeInsuranceExtraction,
    purpose: "Non-life insurance contract",
  },
  carInsuranceExtraction: {
    key: "carInsuranceExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.carInsuranceExtraction,
    purpose: "Car (motor) insurance contract",
  },
  investmentContractExtraction: {
    key: "investmentContractExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.investmentContractExtraction,
    purpose: "Investment contract",
  },
  investmentProposal: {
    key: "investmentProposal",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.investmentProposal,
    purpose: "Investment proposal (future-dedicated prompt)",
  },
  retirementProductExtraction: {
    key: "retirementProductExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.retirementProductExtraction,
    purpose: "PP / DPS product extraction",
  },
  dipExtraction: {
    key: "dipExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.dipExtraction,
    purpose: "DIP extraction",
  },
  buildingSavingsExtraction: {
    key: "buildingSavingsExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.buildingSavingsExtraction,
    purpose: "Building savings contract",
  },
  loanContractExtraction: {
    key: "loanContractExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.loanContractExtraction,
    purpose: "Consumer / generic loan contract",
  },
  mortgageExtraction: {
    key: "mortgageExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.mortgageExtraction,
    purpose: "Mortgage-specific extraction (future)",
  },
  paymentInstructionsExtraction: {
    key: "paymentInstructionsExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.paymentInstructionsExtraction,
    purpose: "Payment instructions",
  },
  supportingDocumentExtraction: {
    key: "supportingDocumentExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.supportingDocumentExtraction,
    purpose: "Supporting / statement documents",
  },
  legacyFinancialProductExtraction: {
    key: "legacyFinancialProductExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.legacyFinancialProductExtraction,
    purpose: "Legacy financial product",
  },
  terminationDocumentExtraction: {
    key: "terminationDocumentExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.terminationDocumentExtraction,
    purpose: "Termination / cancellation document",
  },
  consentIdentificationExtraction: {
    key: "consentIdentificationExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.consentIdentificationExtraction,
    purpose: "AML/KYC / mandate",
  },
  confirmationDocumentExtraction: {
    key: "confirmationDocumentExtraction",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.confirmationDocumentExtraction,
    purpose: "Confirmation of contract or payment",
  },
  reviewDecision: {
    key: "reviewDecision",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.reviewDecision,
    versionEnvKey: AI_REVIEW_VERSION_KEYS.reviewDecision,
    purpose: "LLM review decision over extraction payload",
  },
  clientMatch: {
    key: "clientMatch",
    category: "ai_review",
    envKey: AI_REVIEW_ENV_KEYS.clientMatch,
    versionEnvKey: AI_REVIEW_VERSION_KEYS.clientMatch,
    purpose: "LLM client match suggestion",
  },
};

export function getAiReviewPromptId(key: AiReviewPromptKey): string | null {
  const envKey = AI_REVIEW_ENV_KEYS[key];
  const v = process.env[envKey]?.trim();
  return v || null;
}

export function getAiReviewPromptVersion(key: AiReviewPromptKey): string | null {
  const vk = AI_REVIEW_VERSION_KEYS[key];
  if (vk) {
    const v = process.env[vk]?.trim();
    if (v) return v;
  }
  return process.env.OPENAI_PROMPT_VERSION?.trim() || null;
}

export function isAiReviewPromptConfigured(key: AiReviewPromptKey): boolean {
  return Boolean(getAiReviewPromptId(key));
}
