/**
 * Human-friendly message generation for document extraction results.
 * Per plan Section 15: AI must communicate in natural Czech, not technical jargon.
 */

import type { PrimaryDocumentType, DocumentLifecycleStatus } from "./document-review-types";
import type { InputMode } from "./input-mode-detection";

const TYPE_LABELS: Record<string, string> = {
  life_insurance_final_contract: "pojistnou smlouvu k životnímu pojištění",
  life_insurance_contract: "smlouvu k životnímu pojištění",
  life_insurance_investment_contract: "smlouvu k investičnímu životnímu pojištění",
  life_insurance_proposal: "návrh pojistné smlouvy",
  life_insurance_change_request: "žádost o změnu životního pojištění",
  life_insurance_modelation: "modelaci životního pojištění",
  nonlife_insurance_contract: "smlouvu k neživotnímu pojištění",
  consumer_loan_contract: "smlouvu o spotřebitelském úvěru",
  consumer_loan_with_payment_protection: "smlouvu o úvěru s pojištěním splátek",
  mortgage_document: "dokument k hypotéce",
  pension_contract: "smlouvu o penzijním spoření",
  investment_service_agreement: "smlouvu o investičních službách",
  investment_subscription_document: "upisovací dokument k investici",
  investment_modelation: "modelaci investice",
  payment_instruction: "platební instrukce",
  investment_payment_instruction: "platební instrukce k investici",
  payment_schedule: "platební kalendář",
  payslip_document: "výplatní pásku",
  income_proof_document: "doklad o příjmu",
  income_confirmation: "potvrzení o příjmu",
  corporate_tax_return: "daňové přiznání právnické osoby",
  self_employed_tax_or_income_document: "daňové přiznání / doklad OSVČ",
  financial_analysis_document: "finanční analýzu",
  insurance_policy_change_or_service_doc: "servisní dokument k pojistce",
  bank_statement: "bankovní výpis",
  liability_insurance_offer: "nabídku pojištění odpovědnosti",
  insurance_comparison: "porovnání pojištění",
  precontract_information: "předsmluvní informace",
  identity_document: "doklad totožnosti",
  medical_questionnaire: "zdravotní dotazník",
  consent_or_declaration: "souhlas / prohlášení",
  service_agreement: "servisní smlouvu",
  generic_financial_document: "finanční dokument",
  unsupported_or_unknown: "nepodporovaný dokument",
};

export function getDocumentTypeLabel(primaryType: PrimaryDocumentType): string {
  return TYPE_LABELS[primaryType] ?? "dokument";
}

/**
 * Generate the main human-friendly summary after extraction.
 * This is what the AI "says" to the advisor after processing.
 */
export function buildHumanSummary(params: {
  primaryType: PrimaryDocumentType;
  lifecycleStatus: DocumentLifecycleStatus;
  inputMode: InputMode;
  confidence: number;
  productName?: string;
  institutionName?: string;
  contractNumber?: string;
  clientName?: string;
  containsPaymentInstructions?: boolean;
  reasonsForReview?: string[];
}): string {
  const {
    primaryType,
    lifecycleStatus,
    inputMode,
    confidence,
    productName,
    institutionName,
    clientName,
    contractNumber,
    containsPaymentInstructions,
    reasonsForReview,
  } = params;

  const parts: string[] = [];
  const label = getDocumentTypeLabel(primaryType);

  // Main identification
  parts.push(`Rozpoznala jsem ${label}.`);

  // Product / institution detail
  if (productName && institutionName) {
    parts.push(`Produkt: ${productName} od ${institutionName}.`);
  } else if (institutionName) {
    parts.push(`Instituce: ${institutionName}.`);
  } else if (productName) {
    parts.push(`Produkt: ${productName}.`);
  }

  // Contract number
  if (contractNumber) {
    parts.push(`Číslo smlouvy: ${contractNumber}.`);
  }

  // Client
  if (clientName) {
    parts.push(`Klient: ${clientName}.`);
  }

  // Lifecycle warning
  if (lifecycleStatus === "proposal" || lifecycleStatus === "offer") {
    parts.push("Upozornění: Jedná se o návrh/nabídku, ne o finálně uzavřenou smlouvu.");
  } else if (lifecycleStatus === "illustration" || lifecycleStatus === "modelation" || lifecycleStatus === "non_binding_projection") {
    parts.push("Jedná se o modelaci/ilustraci, ne o závazný smluvní dokument.");
  } else if (lifecycleStatus === "policy_change_request" || lifecycleStatus === "endorsement_request") {
    parts.push("Jedná se o žádost o změnu existující smlouvy.");
  }

  const modeStr = inputMode as string;
  if (modeStr === "scanned_pdf" || modeStr === "image_document") {
    parts.push("Dokument je scan. Přepnula jsem na OCR režim – některé údaje mohou vyžadovat kontrolu.");
  } else if (modeStr === "mixed_pdf") {
    parts.push("Dokument obsahuje kombinaci textu a scanů. Některé části mohou vyžadovat kontrolu.");
  }

  // Payment instructions
  if (containsPaymentInstructions) {
    parts.push("Dokument obsahuje platební instrukce, které mohu přenést do klientského portálu.");
  }

  // Confidence
  if (confidence < 0.5) {
    parts.push("Kvalita čtení je nízká. Doporučuji důkladnou kontrolu všech údajů.");
  } else if (confidence < 0.7) {
    parts.push("Některé údaje mají nižší jistotu čtení. Doporučuji ověřit klíčové položky.");
  }

  // Review reasons
  if (reasonsForReview && reasonsForReview.length > 0) {
    const relevant = reasonsForReview.filter((r) => !r.startsWith("low_") && r !== "model_flagged");
    if (relevant.length > 0) {
      parts.push(`Dokument vyžaduje kontrolu: ${relevant.slice(0, 3).join(", ")}.`);
    }
  }

  return parts.join(" ");
}

/**
 * Generate human-friendly error message instead of technical jargon.
 * Per Section 15.3 of the plan.
 */
export function buildHumanErrorMessage(params: {
  errorCode?: string;
  errorMessage?: string;
  primaryType?: PrimaryDocumentType;
  inputMode?: InputMode;
}): string {
  const { errorCode, errorMessage, primaryType, inputMode } = params;

  if (errorCode === "OPENAI_RATE_LIMIT") {
    return "AI služba je momentálně přetížená. Zkuste to prosím za minutu.";
  }

  if (inputMode === "scanned_pdf" || inputMode === "image_document") {
    if (errorMessage?.includes("OCR") || errorMessage?.includes("scan")) {
      return "Dokument je scan a kvalita OCR je nízká. Zkuste nahrát dokument ve vyšší kvalitě nebo jako textové PDF.";
    }
    return "Dokument je scan. Nepodařilo se ho dostatečně přečíst pro automatické zpracování.";
  }

  if (primaryType === "unsupported_or_unknown") {
    return "Dokument byl rozpoznán jako nepodporovaný typ. Můžete ho přiřadit ručně.";
  }

  if (errorMessage?.includes("schema") || errorMessage?.includes("schéma")) {
    return "Dokument byl rozpoznán, ale jeho struktura neodpovídá očekávanému formátu. Zkuste ruční kontrolu.";
  }

  if (errorMessage?.includes("Klasifikace")) {
    return "Nepodařilo se určit typ dokumentu. Zkuste nahrát dokument znovu nebo ho přiřaďte ručně.";
  }

  return errorMessage ?? "Zpracování dokumentu se nezdařilo. Zkuste ho nahrát znovu.";
}

/**
 * Build quick action suggestions based on document type and extraction result.
 * Per Section 15.2 of the plan.
 */
export type QuickAction = {
  id: string;
  label: string;
  icon: string;
  primary: boolean;
  actionType: string;
};

export function buildQuickActions(params: {
  primaryType: PrimaryDocumentType;
  lifecycleStatus: DocumentLifecycleStatus;
  hasClientMatch: boolean;
  hasMultipleCandidates: boolean;
  containsPaymentInstructions: boolean;
  isReviewRequired: boolean;
}): QuickAction[] {
  const actions: QuickAction[] = [];
  const {
    primaryType,
    lifecycleStatus,
    hasClientMatch,
    hasMultipleCandidates,
    containsPaymentInstructions,
    isReviewRequired,
  } = params;

  if (hasMultipleCandidates) {
    actions.push({
      id: "select_client",
      label: "Vybrat kandidáta klienta",
      icon: "UserCheck",
      primary: true,
      actionType: "select_client_candidate",
    });
  } else if (hasClientMatch) {
    actions.push({
      id: "assign_client",
      label: "Přiřadit ke klientovi",
      icon: "UserCheck",
      primary: true,
      actionType: "assign_to_client",
    });
  } else {
    actions.push({
      id: "create_client",
      label: "Vytvořit nového klienta",
      icon: "UserPlus",
      primary: true,
      actionType: "create_new_client",
    });
  }

  if (containsPaymentInstructions) {
    actions.push({
      id: "create_payment",
      label: "Vytvořit platební údaje",
      icon: "CreditCard",
      primary: true,
      actionType: "create_payment_setup",
    });
  }

  const contractTypes = new Set([
    "life_insurance_final_contract", "life_insurance_contract",
    "life_insurance_investment_contract", "nonlife_insurance_contract",
    "consumer_loan_contract", "consumer_loan_with_payment_protection",
    "mortgage_document", "pension_contract",
  ]);
  if (contractTypes.has(primaryType) && lifecycleStatus === "final_contract") {
    actions.push({
      id: "create_contract",
      label: "Založit smlouvu",
      icon: "FileSignature",
      primary: false,
      actionType: "create_contract_record",
    });
  }

  actions.push({
    id: "create_task",
    label: "Vytvořit úkol",
    icon: "CheckSquare",
    primary: false,
    actionType: "create_task",
  });

  actions.push({
    id: "draft_email",
    label: "Připravit email",
    icon: "Mail",
    primary: false,
    actionType: "draft_email",
  });

  if (isReviewRequired) {
    actions.push({
      id: "open_review",
      label: "Otevřít detail review",
      icon: "Eye",
      primary: false,
      actionType: "open_review_detail",
    });
  }

  return actions;
}
