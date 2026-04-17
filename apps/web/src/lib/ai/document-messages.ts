/**
 * Human-friendly message generation for document extraction results.
 * Per plan Section 15: AI must communicate in natural Czech, not technical jargon.
 */

import type { PrimaryDocumentType, DocumentLifecycleStatus } from "./document-review-types";
import type { InputMode } from "./input-mode-detection";

const TYPE_LABELS: Record<string, string> = {
  /** Normalizované / zkrácené pipeline aliasy — nesmí se propisovat do UI jako anglické kódy. */
  insurance_contract: "životní pojistnou smlouvu",
  investment_contract: "investiční smlouvu nebo rámcovou smlouvu",
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
  pension_contract: "smlouvu k DPS (doplňkové penzijní spoření) nebo PP (penzijní připojištění)",
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
const SUPPORTING_PRIMARY_TYPES = new Set([
  "payslip_document", "income_proof_document", "income_confirmation",
  "corporate_tax_return", "self_employed_tax_or_income_document",
  "financial_analysis_document", "bank_statement",
  "medical_questionnaire", "consent_or_declaration", "identity_document",
  "insurance_policy_change_or_service_doc", "service_agreement",
]);

const REVIEW_REASON_SUPPRESS = new Set([
  // Pipeline internals — not actionable
  "leasing_contract_dedicated", "leasing_contract_legacy_fallback",
  "supporting_document_review", "reference_lane",
  "adobe_preprocess_reused", "preprocess_succeeded",
  "localTemplateFallback", "storedPromptDivergenceDetected",
  "partial_extraction_coerced", "partial_extraction_merged_into_stub",
  "critical_review_warning", "missing_required_data",
]);

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
  const isSupporting = SUPPORTING_PRIMARY_TYPES.has(primaryType);

  // Main identification
  parts.push(`Rozpoznala jsem ${label}.`);

  if (isSupporting) {
    // Supporting docs: short, focused summary
    if (clientName) parts.push(`Vystaveno pro: ${clientName}.`);
    if (institutionName) parts.push(`Instituce: ${institutionName}.`);
    // No contract numbers, no payment instructions, no product for supporting docs
  } else {
    // Product / institution detail
    if (productName && institutionName) {
      parts.push(`Produkt: ${productName} od ${institutionName}.`);
    } else if (institutionName) {
      parts.push(`Instituce: ${institutionName}.`);
    } else if (productName) {
      parts.push(`Produkt: ${productName}.`);
    }

    // Contract number — only for product docs
    if (contractNumber) {
      parts.push(`Číslo smlouvy: ${contractNumber}.`);
    }

    // Client
    if (clientName) {
      parts.push(`Klient: ${clientName}.`);
    }

    // Lifecycle — important for advisor to know proposal vs final
    if (lifecycleStatus === "proposal" || lifecycleStatus === "offer") {
      parts.push("Jedná se o návrh/nabídku, ne o finálně uzavřenou smlouvu.");
    } else if (lifecycleStatus === "illustration" || lifecycleStatus === "modelation" || lifecycleStatus === "non_binding_projection") {
      parts.push("Jedná se o modelaci/ilustraci — nezávazný dokument.");
    } else if (lifecycleStatus === "policy_change_request" || lifecycleStatus === "endorsement_request") {
      parts.push("Žádost o změnu existující smlouvy.");
    }

    // Payment instructions
    if (containsPaymentInstructions) {
      parts.push("Dokument obsahuje platební instrukce.");
    }
  }

  // Scan/OCR quality — relevant for all document types
  const modeStr = inputMode as string;
  if (modeStr === "scanned_pdf" || modeStr === "image_document") {
    parts.push("Dokument je scan — údaje je potřeba ručně zkontrolovat oproti originálu.");
  } else if (modeStr === "mixed_pdf") {
    parts.push("Dokument obsahuje scan i textovou vrstvu — některé části mohou vyžadovat kontrolu.");
  }

  if (confidence < 0.5) {
    parts.push("Dokument se nepodařilo spolehlivě přečíst — důkladně zkontrolujte všechny údaje.");
  } else if (confidence < 0.65) {
    parts.push("Některé údaje byly nalezeny jen částečně — doporučujeme je ověřit oproti dokumentu.");
  }

  // Actionable review reasons only
  if (reasonsForReview && reasonsForReview.length > 0) {
    const humanized = reasonsForReview
      .filter((r) => !REVIEW_REASON_SUPPRESS.has(r) && !r.startsWith("low_") && r !== "model_flagged")
      .map((r) => humanizeReviewReasonForAdvisorSummary(r))
      .filter((s): s is string => Boolean(s))
      .slice(0, 2);
    if (humanized.length > 0) {
      parts.push(humanized.join(" "));
    }
  }

  return parts.join(" ");
}

/** Maps internal pipeline reason codes to short Czech hints for the executive summary. */
function humanizeReviewReasonForAdvisorSummary(code: string): string | null {
  const t = code.trim();
  const map: Record<string, string> = {
    partial_extraction_coerced: "Některé údaje byly dopočítány z kontextu — ověřte je oproti dokumentu.",
    partial_extraction_merged_into_stub: "Údaje byly nalezeny jen částečně — zkontrolujte úplnost.",
    proposal_or_modelation_not_final_contract: "Jde o modelaci nebo ilustraci, ne o finální smlouvu.",
    proposal_not_final_contract: "Dokument vypadá jako návrh, ne jako finální smlouva.",
    hybrid_contract_signals_detected: "V dokumentu jsou prvky více typů smluv — ověřte rozpoznaný typ.",
    scan_or_ocr_unusable: "Dokument se nepodařilo spolehlivě přečíst — zkontrolujte všechny údaje.",
    ambiguous_client_match: "V CRM existuje více možných klientů — vyberte správného.",
    near_match_advisory:
      "Nalezena pravděpodobná shoda s klientem v CRM — ověřte, zda jde o správnou osobu.",
    incomplete_payment_details: "Platební údaje nejsou kompletní — doplňte chybějící hodnoty.",
    low_classifier_confidence: "Typ dokumentu nebyl rozpoznán s dostatečnou jistotou.",
    low_ocr_quality: "Dokument se nepodařilo spolehlivě přečíst — údaje zkontrolujte.",
    low_text_coverage: "Text dokumentu se nepodařilo spolehlivě přečíst.",
    low_text_coverage_estimate: "Text dokumentu se nepodařilo spolehlivě přečíst.",
    no_markdown_content_for_pdf: "Z dokumentu se nepodařilo získat čitelný text.",
  };
  if (map[t]) return map[t];
  if (/^[a-z][a-z0-9_]*$/i.test(t) && t.includes("_")) return null;
  if (t.length > 0) return t;
  return null;
}

/** Rozhodnutí párování klienta z backendu — jediný zdroj pravdy pro UI (bez paralelní heuristiky). */
export type MatchVerdictUi =
  | "existing_match"
  | "near_match"
  | "ambiguous_match"
  | "no_match";

export type MatchVerdictBanner = {
  tone: "success" | "warning" | "danger" | "neutral";
  title: string;
  body: string;
};

/**
 * Texty pro banner „stav párování klienta“ (poradenské UI).
 */
export function buildMatchVerdictBanner(
  verdict: MatchVerdictUi | null | undefined,
  opts?: { topCandidateName?: string; topScorePct?: number }
): MatchVerdictBanner | null {
  if (!verdict) return null;
  const name = opts?.topCandidateName?.trim();
  const pct =
    typeof opts?.topScorePct === "number" && Number.isFinite(opts.topScorePct)
      ? Math.round(opts.topScorePct)
      : undefined;

  switch (verdict) {
    case "existing_match":
      return {
        tone: "success",
        title: name ? `Klient nalezen: ${name}` : "Klient nalezen v CRM",
        body:
          "Shoda je dostatečně jistá — dokument je připraven ke kontrole a schválení. Pokud jde o jinou osobu, použijte „Změnit klienta“.",
      };
    case "near_match":
      return {
        tone: "warning",
        title: name ? `Pravděpodobná shoda: ${name}${pct != null ? ` (${pct} %)` : ""}` : "Pravděpodobná shoda v CRM",
        body:
          "Nejvyšší kandidát je předvybrán jako výchozí. Před zápisem ho ověřte, nebo vyberte jiného klienta / zvolte nového klienta.",
      };
    case "ambiguous_match":
      return {
        tone: "danger",
        title: "Nejednoznačná shoda",
        body:
          "V evidenci Aidvisory je více rozumných kandidátů nebo jsou si příliš podobní. Vyberte správného klienta níže — propsání do Aidvisory je do výběru blokované.",
      };
    case "no_match":
      return {
        tone: "neutral",
        title: "Žádný odpovídající klient v evidenci Aidvisory",
        body:
          "Nepodařilo se najít spolehlivou shodu. Pokládáte-li nového klienta, potvrďte vytvoření níže.",
      };
    default:
      return null;
  }
}

export function approvedPendingApplyHint(
  verdict: MatchVerdictUi | null | undefined,
  hasResolvedClient: boolean
): string {
  if (!hasResolvedClient) {
    return "Kontrola je schválená, ale ještě není propsána do Aidvisory. Při kliknutí na Propsat do Aidvisory se použije vybraný klient, nebo se podle potvrzení založí nový záznam.";
  }
  if (verdict === "existing_match") {
    return "Kontrola je schválená, ale propsání do Aidvisory ještě neproběhlo — dokončíte je kliknutím na Propsat do Aidvisory. Připojení je k existujícímu klientovi v evidenci.";
  }
  return "Kontrola je schválená, ale propsání do Aidvisory ještě neproběhlo — dokončíte je kliknutím na Propsat do Aidvisory. Schválení potvrzuje správnost extrakce.";
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
      return "Dokument se nepodařilo spolehlivě přečíst. Zkuste nahrát čitelnější dokument nebo PDF s textovou vrstvou.";
    }
    return "Dokument je scan a nepodařilo se ho automaticky zpracovat. Zkuste nahrát čitelnější verzi.";
  }

  if (primaryType === "unsupported_or_unknown") {
    return "Tento typ dokumentu zatím neumíme automaticky zpracovat. Můžete ho přiřadit ručně.";
  }

  if (errorMessage?.includes("schema") || errorMessage?.includes("schéma")) {
    return "Struktura dokumentu neodpovídá očekávanému formátu. Zkontrolujte dokument ručně.";
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
