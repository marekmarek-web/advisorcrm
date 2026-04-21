/**
 * Validation layer for extracted contract data.
 * Rules for contract number, amounts, payment frequency, dates, email, phone, identifiers.
 */

import {
  dedupeCzechAccountTrailingBankCode,
  isValidPaymentVariableSymbol,
} from "./payment-field-contract";

export type ValidationWarning = {
  code: string;
  message: string;
  field?: string;
  /** Present on document-envelope / payment warnings from specialized validators. */
  severity?: "info" | "warning" | "critical";
};

export type ValidationResult = {
  valid: boolean;
  warnings: ValidationWarning[];
  reasonsForReview: string[];
};

/** Allowed payment frequency values (normalized). */
const PAYMENT_FREQUENCY_VALUES = new Set([
  "monthly",
  "quarterly",
  "yearly",
  "annual",
  "semi-annual",
  "one-time",
  "jednorázově",
  "měsíčně",
  "čtvrtletně",
  "pololetně",
  "ročně",
]);

/** Czech IBAN: CZ + 2 check digits + 20 digits = 24 chars. Generic: 15-34 alphanumeric. */
function isValidIbanFormat(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (cleaned.startsWith("CZ")) return /^CZ\d{22}$/.test(cleaned);
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned);
}

/** Czech account number: prefix-number/bankCode or just number/bankCode. */
function isValidCzechAccountFormat(account: string): boolean {
  const cleaned = account.replace(/\s/g, "");
  return /^(\d{0,6}-?)?\d{2,10}\/\d{4}$/.test(cleaned);
}

function addWarning(
  warnings: ValidationWarning[],
  reasons: string[],
  code: string,
  message: string,
  field?: string,
  reasonPhrase?: string
) {
  warnings.push({ code, message, field });
  if (reasonPhrase) reasons.push(reasonPhrase);
}

function fieldExtracted(f: { value?: unknown; status?: string } | undefined): boolean {
  return Boolean(f && f.status === "extracted" && f.value != null && String(f.value).trim() !== "");
}

/**
 * Looser presence check used for POLICYHOLDER_MISSING and PAYMENT_DATA_MISSING guards.
 * Accepts both "extracted" and "inferred_low_confidence" statuses — the combined extraction
 * path wraps scalar values as inferred_low_confidence even when the value is clearly present.
 * We still require a non-empty value to avoid false positives on null/empty cells.
 */
function fieldPresent(f: { value?: unknown; status?: string } | undefined): boolean {
  if (!f) return false;
  const status = f.status ?? "";
  if (status === "missing" || status === "not_found" || status === "not_applicable" || status === "explicitly_not_selected") return false;
  return f.value != null && String(f.value).trim() !== "" && String(f.value).trim() !== "—";
}

export function validateExtractedContract(payload: {
  contractNumber?: string | null;
  institutionName?: string | null;
  client?: {
    email?: string | null;
    phone?: string | null;
    personalId?: string | null;
    companyId?: string | null;
  } | null;
  paymentDetails?: {
    amount?: number | string | null;
    currency?: string | null;
    frequency?: string | null;
    iban?: string | null;
    accountNumber?: string | null;
    variableSymbol?: string | null;
  } | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  [key: string]: unknown;
}): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const reasonsForReview: string[] = [];

  // Contract number: if present, basic format (alphanumeric, dashes, spaces)
  if (payload.contractNumber != null && String(payload.contractNumber).trim() !== "") {
    const cn = String(payload.contractNumber).trim();
    if (!/^[\dA-Za-z\s\-/\.]{3,50}$/.test(cn)) {
      addWarning(
        warnings,
        reasonsForReview,
        "CONTRACT_NUMBER_FORMAT",
        "Číslo smlouvy nemá očekávaný formát",
        "contractNumber",
        "contract_number_format"
      );
    }
  }

  // Amount: non-negative, sane range
  const amount = payload.paymentDetails?.amount;
  if (amount != null && amount !== "") {
    const n = typeof amount === "number" ? amount : parseFloat(String(amount).replace(/\s/g, "").replace(",", "."));
    if (Number.isNaN(n)) {
      addWarning(
        warnings,
        reasonsForReview,
        "AMOUNT_INVALID",
        "Částka není platné číslo",
        "paymentDetails.amount",
        "amount_invalid"
      );
    } else if (n < 0) {
      addWarning(
        warnings,
        reasonsForReview,
        "AMOUNT_NEGATIVE",
        "Částka je záporná",
        "paymentDetails.amount",
        "amount_negative"
      );
    } else if (n > 1e12) {
      addWarning(
        warnings,
        reasonsForReview,
        "AMOUNT_SUSPICIOUS",
        "Částka je mimo očekávané rozmezí",
        "paymentDetails.amount",
        "amount_suspicious"
      );
    }
  }

  // Payment frequency: allowed values
  const freq = payload.paymentDetails?.frequency;
  if (freq != null && String(freq).trim() !== "") {
    const normalized = String(freq).trim().toLowerCase();
    if (!PAYMENT_FREQUENCY_VALUES.has(normalized) && !/^(monthly|yearly|quarterly|annual|one-time)/i.test(normalized)) {
      addWarning(
        warnings,
        reasonsForReview,
        "PAYMENT_FREQUENCY",
        "Neplatná nebo neobvyklá frekvence platby",
        "paymentDetails.frequency",
        "payment_frequency"
      );
    }
  }

  // Dates: parseable
  const parseDate = (s: string | null | undefined): Date | null => {
    if (s == null || String(s).trim() === "") return null;
    const str = String(s).trim();
    const iso = /^\d{4}-\d{2}-\d{2}/.test(str) ? str : str.split(".").reverse().join("-");
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const effective = parseDate(payload.effectiveDate);
  const expiration = parseDate(payload.expirationDate);
  if (payload.effectiveDate != null && String(payload.effectiveDate).trim() !== "" && effective == null) {
    addWarning(
      warnings,
      reasonsForReview,
      "DATE_EFFECTIVE",
      "Datum účinnosti nelze přečíst",
      "effectiveDate",
      "date_effective"
    );
  }
  if (payload.expirationDate != null && String(payload.expirationDate).trim() !== "" && expiration == null) {
    addWarning(
      warnings,
      reasonsForReview,
      "DATE_EXPIRATION",
      "Datum konce nelze přečíst",
      "expirationDate",
      "date_expiration"
    );
  }
  if (effective != null && expiration != null && effective > expiration) {
    addWarning(
      warnings,
      reasonsForReview,
      "DATE_RANGE",
      "Datum účinnosti je po datu konce",
      undefined,
      "date_range"
    );
  }

  // Email
  const email = payload.client?.email;
  if (email != null && String(email).trim() !== "") {
    const e = String(email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      addWarning(
        warnings,
        reasonsForReview,
        "EMAIL_FORMAT",
        "E-mail nemá platný formát",
        "client.email",
        "email_format"
      );
    }
  }

  // Phone: basic (digits, +, spaces)
  const phone = payload.client?.phone;
  if (phone != null && String(phone).trim() !== "") {
    const p = String(phone).trim();
    if (!/^[\d\s+\-()]{6,30}$/.test(p)) {
      addWarning(
        warnings,
        reasonsForReview,
        "PHONE_FORMAT",
        "Telefon nemá platný formát",
        "client.phone",
        "phone_format"
      );
    }
  }

  // Personal ID (Czech RČ):
  // Accepted formats:
  //   - 9 digits (pre-1954)                     "841209123"
  //   - 9 digits + '/' + 1 digit                "841209/1"
  //   - 10 digits (without slash, post-1954)    "8501020123"   ← F3-4 (H-13)
  //   - 6 digits + '/' + 3 or 4 digits          "850102/0123"
  //
  // Before F3-4 the 10-digit-without-slash form was only accepted implicitly
  // via the `id.length < 8` short-circuit (which is a correctness accident,
  // not an explicit format). We now list the format explicitly so the
  // warning path reports accurate diagnostics.
  const personalId = payload.client?.personalId;
  if (personalId != null && String(personalId).trim() !== "") {
    const id = String(personalId).trim().replace(/\s/g, "");
    const VALID_RC =
      /^\d{9}$|^\d{9}\/\d{1}$|^\d{10}$|^\d{6}\/\d{3,4}$/;
    if (!VALID_RC.test(id) && id.length < 8) {
      addWarning(
        warnings,
        reasonsForReview,
        "PERSONAL_ID_FORMAT",
        "Rodné číslo nemá očekávaný formát",
        "client.personalId",
        "personal_id_format"
      );
    }
  }

  // Company ID (Czech ICO: 8 digits)
  const companyId = payload.client?.companyId;
  if (companyId != null && String(companyId).trim() !== "") {
    const id = String(companyId).trim().replace(/\s/g, "");
    if (!/^\d{8}$/.test(id)) {
      addWarning(
        warnings,
        reasonsForReview,
        "COMPANY_ID_FORMAT",
        "IČO nemá očekávaný formát (8 číslic)",
        "client.companyId",
        "company_id_format"
      );
    }
  }

  // IBAN
  const iban = payload.paymentDetails?.iban
    ?? (payload as Record<string, unknown>).iban as string | undefined;
  if (iban != null && String(iban).trim() !== "") {
    if (!isValidIbanFormat(String(iban).trim())) {
      addWarning(
        warnings,
        reasonsForReview,
        "IBAN_FORMAT",
        "IBAN nemá platný formát",
        "iban",
        "iban_format"
      );
    }
  }

  // Account number
  const accountNumber = payload.paymentDetails?.accountNumber
    ?? (payload as Record<string, unknown>).accountNumber as string | undefined;
  if (accountNumber != null && String(accountNumber).trim() !== "") {
    const cleaned = String(accountNumber).trim();
    if (cleaned.includes("/") && !isValidCzechAccountFormat(cleaned)) {
      addWarning(
        warnings,
        reasonsForReview,
        "ACCOUNT_NUMBER_FORMAT",
        "Číslo účtu nemá platný formát",
        "accountNumber",
        "account_number_format"
      );
    }
  }

  // Variable symbol
  const variableSymbol = payload.paymentDetails?.variableSymbol
    ?? (payload as Record<string, unknown>).variableSymbol as string | undefined;
  if (variableSymbol != null && String(variableSymbol).trim() !== "") {
    if (!isValidPaymentVariableSymbol(String(variableSymbol).trim())) {
      addWarning(
        warnings,
        reasonsForReview,
        "VARIABLE_SYMBOL_FORMAT",
        "Variabilní symbol nemá platný formát (1-10 číslic)",
        "variableSymbol",
        "variable_symbol_format"
      );
    }
  }

  const valid = warnings.filter((w) =>
    ["AMOUNT_INVALID", "AMOUNT_NEGATIVE", "DATE_EFFECTIVE", "DATE_EXPIRATION", "DATE_RANGE"].includes(w.code)
  ).length === 0;

  return {
    valid,
    warnings,
    reasonsForReview: [...new Set(reasonsForReview)],
  };
}

/**
 * Extended validation for the full DocumentReviewEnvelope.
 * Includes proposal/contract confusion detection and payment instruction completeness.
 */
export function validateDocumentEnvelope(payload: {
  documentClassification?: {
    primaryType?: string;
    lifecycleStatus?: string;
  };
  contentFlags?: {
    isFinalContract?: boolean;
    isProposalOnly?: boolean;
    containsPaymentInstructions?: boolean;
  };
  extractedFields?: Record<string, { value?: unknown; status?: string }>;
}): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const reasonsForReview: string[] = [];
  const primaryType = payload.documentClassification?.primaryType ?? "";
  const lifecycle = payload.documentClassification?.lifecycleStatus ?? "";
  const fields = payload.extractedFields ?? {};

  // PROPOSAL_MARKED_AS_CONTRACT warning only fires for true non-final documents (modelation/kalkulace).
  // Proposal/offer documents are finální vstup by business rule — isFinalContract = true is correct for them.
  const modelationOnlyTypes = new Set([
    "life_insurance_modelation", "investment_modelation",
    "precontract_information", "insurance_comparison",
  ]);
  if (modelationOnlyTypes.has(primaryType) && payload.contentFlags?.isFinalContract) {
    addWarning(warnings, reasonsForReview, "PROPOSAL_MARKED_AS_CONTRACT",
      "Modelace/kalkulace je označena jako finální smlouva. Zkontrolujte klasifikaci.",
      "documentClassification.lifecycleStatus", "proposal_marked_as_contract");
  }

  const contractTypes = new Set([
    "life_insurance_final_contract", "life_insurance_contract",
    "life_insurance_investment_contract", "nonlife_insurance_contract",
    "consumer_loan_contract", "consumer_loan_with_payment_protection",
  ]);
  if (contractTypes.has(primaryType) && payload.contentFlags?.isProposalOnly) {
    addWarning(warnings, reasonsForReview, "CONTRACT_MARKED_AS_PROPOSAL",
      "Finální smlouva je označena jako návrh. Zkontrolujte klasifikaci.",
      "documentClassification.lifecycleStatus", "contract_marked_as_proposal");
  }

  const paymentTypes = new Set(["payment_instruction", "investment_payment_instruction"]);
  if (paymentTypes.has(primaryType)) {
    if (lifecycle === "final_contract") {
      addWarning(warnings, reasonsForReview, "PAYMENT_INSTRUCTION_AS_CONTRACT",
        "Platební instrukce nesmí být označena jako smlouva.",
        "documentClassification.lifecycleStatus", "payment_instruction_as_contract");
    }
    const hasAccount =
      fieldExtracted(fields.bankAccount) ||
      fieldExtracted(fields.iban) ||
      fieldExtracted(fields.accountNumber);
    const hasLinkId =
      fieldExtracted(fields.variableSymbol) ||
      fieldExtracted(fields.contractNumber) ||
      fieldExtracted(fields.investmentReference);
    if (!hasAccount) {
      addWarning(warnings, reasonsForReview, "INCOMPLETE_PAYMENT_DETAILS",
        "Platební instrukce: chybí účet nebo IBAN.",
        undefined, "incomplete_payment_details");
    }
    if (!hasLinkId) {
      addWarning(warnings, reasonsForReview, "INCOMPLETE_PAYMENT_DETAILS",
        "Platební instrukce: chybí VS, číslo smlouvy nebo jiný identifikátor platby.",
        undefined, "incomplete_payment_details");
    }
  }

  if (primaryType === "bank_statement") {
    const hasPeriod =
      fieldExtracted(fields.statementPeriodFrom) && fieldExtracted(fields.statementPeriodTo);
    const hasBalances =
      fieldExtracted(fields.openingBalance) && fieldExtracted(fields.closingBalance);
    if (!hasBalances) {
      addWarning(warnings, reasonsForReview, "BANK_STATEMENT_INCOMPLETE",
        "Výpis z účtu: chybí počáteční nebo konečný zůstatek (§8.8).",
        "extractedFields.openingBalance", "bank_statement_incomplete");
    }
    if (!hasPeriod) {
      addWarning(warnings, reasonsForReview, "BANK_STATEMENT_INCOMPLETE",
        "Výpis z účtu: chybí období výpisu.",
        "extractedFields.statementPeriodFrom", "bank_statement_incomplete");
    }
    if (!fieldExtracted(fields.bankName) && !fieldExtracted(fields.institutionName)) {
      addWarning(warnings, reasonsForReview, "BANK_STATEMENT_INCOMPLETE",
        "Výpis z účtu: chybí název banky.",
        undefined, "bank_statement_incomplete");
    }
  }

  const incomeTypes = new Set([
    "income_proof_document",
    "payslip_document",
    "income_confirmation",
    "corporate_tax_return",
    "self_employed_tax_or_income_document",
  ]);
  if (incomeTypes.has(primaryType)) {
    const hasEmployer =
      fieldExtracted(fields.employerName) ||
      fieldExtracted(fields.institutionName) ||
      fieldExtracted(fields.companyName);
    const hasPeriod =
      fieldExtracted(fields.incomePeriod) ||
      fieldExtracted(fields.statementPeriodFrom) ||
      fieldExtracted(fields.payPeriod);
    const hasAmount =
      fieldExtracted(fields.netIncome) ||
      fieldExtracted(fields.grossIncome) ||
      fieldExtracted(fields.incomeAmount);
    if (!hasEmployer) {
      addWarning(warnings, reasonsForReview, "INCOME_DOC_INCOMPLETE",
        "Doklad o příjmu: chybí zaměstnavatel / plátce.",
        undefined, "income_verification_incomplete");
    }
    if (!hasPeriod && !hasAmount) {
      addWarning(warnings, reasonsForReview, "INCOME_DOC_INCOMPLETE",
        "Doklad o příjmu: chybí období nebo částka příjmu.",
        undefined, "income_verification_incomplete");
    }
  }

  const loanContractTypes = new Set(["consumer_loan_contract", "consumer_loan_with_payment_protection"]);
  if (loanContractTypes.has(primaryType)) {
    const rpsn = fields.rpsn;
    if (rpsn && rpsn.status === "extracted" && rpsn.value != null) {
      const raw = String(rpsn.value).replace(/\s/g, "").replace(",", ".").replace(/%/g, "");
      const n = parseFloat(raw);
      if (!Number.isNaN(n) && (n < 0 || n > 60)) {
        addWarning(warnings, reasonsForReview, "LOAN_RPSN_SUSPECT",
          "RPSN mimo obvyklý rozsah — zkontrolujte extrakci.",
          "extractedFields.rpsn", "loan_rpsn_suspect");
      }
    }
    if (primaryType === "consumer_loan_contract") {
      if (!fieldExtracted(fields.installmentCount) && !fieldExtracted(fields.loanTermMonths)) {
        addWarning(warnings, reasonsForReview, "LOAN_TERMS_INCOMPLETE",
          "Úvěrová smlouva: chybí počet splátek nebo délka úvěru.",
          undefined, "loan_terms_incomplete");
      }
    }
  }

  const changeTypes = new Set(["life_insurance_change_request", "insurance_policy_change_or_service_doc"]);
  if (changeTypes.has(primaryType)) {
    const policyRef = fields.existingPolicyNumber ?? fields.contractNumber;
    if (!policyRef || policyRef.status !== "extracted" || !policyRef.value) {
      addWarning(warnings, reasonsForReview, "CHANGE_WITHOUT_CONTRACT_REF",
        "Změnový dokument neobsahuje referenci na existující smlouvu.",
        "extractedFields.existingPolicyNumber", "change_without_contract_ref");
    }
  }

  // ── Semantic quality gate (Phase X) ────────────────────────────────────────
  // These checks catch syntactically valid but semantically wrong extractions.

  const ef = fields;
  const supportingPrimaryTypes = new Set([
    "payslip_document",
    "income_proof_document",
    "income_confirmation",
    "corporate_tax_return",
    "self_employed_tax_or_income_document",
    "bank_statement",
    "identity_document",
    "medical_questionnaire",
    "consent_or_declaration",
  ]);

  // 1. birthDate contains personal ID pattern
  const birthVal = ef.birthDate?.value != null ? String(ef.birthDate.value).trim() : "";
  if (birthVal && /^\d{6}[\/]?\d{3,4}$/.test(birthVal.replace(/\s/g, ""))) {
    addWarning(warnings, reasonsForReview, "BIRTHDATE_CONTAINS_PERSONAL_ID",
      "Datum narození obsahuje rodné číslo — opravte mapování.",
      "extractedFields.birthDate", "birthdate_contains_personal_id");
  }

  // 2. personalId is masked in internal review
  const pidVal = ef.personalId?.value != null ? String(ef.personalId.value).trim() : "";
  if (pidVal && /\*{3,}/.test(pidVal)) {
    addWarning(warnings, reasonsForReview, "PERSONAL_ID_MASKED",
      "Rodné číslo je zamaskované v interním review — údaj musí být plný.",
      "extractedFields.personalId", "personal_id_masked");
  }

  // 3. bankAccount / iban / VS is masked
  for (const payKey of ["bankAccount", "iban", "variableSymbol", "payoutAccount", "accountForRepayment"]) {
    const pv = ef[payKey]?.value != null ? String(ef[payKey]!.value).trim() : "";
    if (pv && /\*{3,}/.test(pv)) {
      addWarning(warnings, reasonsForReview, "PAYMENT_FIELD_MASKED",
        `Pole ${payKey} je zamaskované v interním review — údaj musí být plný.`,
        `extractedFields.${payKey}`, "payment_field_masked");
    }
  }

  // 3b. Domestic account: duplicate /bank/bank suffix (e.g. 2727/2700/2700) or non-numeric VS
  const bankAccRaw = ef.bankAccount?.value != null ? String(ef.bankAccount.value).trim() : "";
  if (bankAccRaw) {
    const compact = bankAccRaw.replace(/\s/g, "");
    const deduped = dedupeCzechAccountTrailingBankCode(bankAccRaw);
    if (compact !== deduped) {
      addWarning(warnings, reasonsForReview, "ACCOUNT_NUMBER_DUPLICATE_BANK_SUFFIX",
        "Číslo účtu obsahuje zdvojený kód banky — ověřte proti originálu.",
        "extractedFields.bankAccount", "account_duplicate_bank_suffix");
    }
  }
  const vsRaw = ef.variableSymbol?.value != null ? String(ef.variableSymbol.value).trim() : "";
  if (vsRaw && !isValidPaymentVariableSymbol(vsRaw)) {
    addWarning(warnings, reasonsForReview, "VARIABLE_SYMBOL_INVALID",
      "Variabilní symbol není platný (1–10 číslic) nebo obsahuje text místo čísla.",
      "extractedFields.variableSymbol", "variable_symbol_invalid");
  }

  // 4. Client identity is missing for contract-type documents.
  // Covers: insurance (pojistník), pension/DPS (účastník), investment (investor/klient).
  // Uses fieldPresent (not fieldExtracted) to avoid false positives when the combined
  // extraction path wraps scalar values as inferred_low_confidence.
  const insuranceDocTypes = new Set([
    "life_insurance_contract", "life_insurance_final_contract", "life_insurance_investment_contract",
    "life_insurance_proposal", "nonlife_insurance_contract", "liability_insurance_offer",
    "life_insurance_change_request", "insurance_policy_change_or_service_doc",
  ]);
  const pensionAndInvestmentDocTypes = new Set([
    "pension_contract",
    "investment_subscription_document",
    "investment_service_agreement",
  ]);
  const clientMandatoryDocTypes = new Set([...insuranceDocTypes, ...pensionAndInvestmentDocTypes]);

  if (clientMandatoryDocTypes.has(primaryType)) {
    const hasClient =
      fieldPresent(ef.fullName) ||
      fieldPresent(ef.policyholder) ||
      fieldPresent(ef.clientFullName) ||
      fieldPresent(ef.firstName) ||
      fieldPresent(ef.lastName) ||
      fieldPresent(ef.policyholderName) ||
      fieldPresent(ef.investorFullName) ||
      fieldPresent(ef.participantFullName) ||
      fieldPresent(ef.borrowerName) ||
      fieldPresent(ef.customerName);
    if (!hasClient) {
      const docLabel = pensionAndInvestmentDocTypes.has(primaryType)
        ? "Klient / investor / účastník"
        : "Pojistník / klient";
      addWarning(warnings, reasonsForReview, "POLICYHOLDER_MISSING",
        `${docLabel} nebyl extrahován — dokument má klienta dle typu.`,
        "extractedFields.fullName", "policyholder_missing");
    }
  }

  // 5. Insurance doc but insured persons are empty (for multi-person docs)
  // Only warn if it's NOT a change request (which may not have insured person listed)
  const hasInsuredPersons = fieldExtracted(ef.insuredPersons) || fieldExtracted(ef.insuredPersonName) || fieldExtracted(ef.coverages);
  if (insuranceDocTypes.has(primaryType) && !hasInsuredPersons &&
      primaryType !== "life_insurance_change_request" && primaryType !== "insurance_policy_change_or_service_doc") {
    // Not a hard fail — just an info-level warning
  }

  // 6. Insurance/loan doc has explicit payment section but payments are empty
  // Uses fieldPresent (not fieldExtracted) — combined path wraps scalars as inferred_low_confidence,
  // which is still a valid present value for determining whether extraction succeeded.
  const hasPaymentData = fieldPresent(ef.totalMonthlyPremium) || fieldPresent(ef.annualPremium) ||
    fieldPresent(ef.installmentAmount) || fieldPresent(ef.premiumAmount) || fieldPresent(ef.bankAccount) ||
    fieldPresent(ef.variableSymbol);
  const productDocTypes = new Set([...insuranceDocTypes, "consumer_loan_contract", "consumer_loan_with_payment_protection", "mortgage_document"]);
  if (productDocTypes.has(primaryType) && !supportingPrimaryTypes.has(primaryType) && !hasPaymentData) {
    addWarning(warnings, reasonsForReview, "PAYMENT_DATA_MISSING",
      "Dokument je smluvního typu, ale platební údaje nebyly extrahovány.",
      undefined, "payment_data_missing");
  }

  // 7. PAYMENT ANTI-HALLUCINATION: non-payment documents must not carry write-eligible payment
  //    fields unless explicit payment instructions or explicit payment section is present.
  //
  //    Generic rule: if document is not a payment_instruction type AND the envelope has no
  //    explicit payment section signal (contentFlags.containsPaymentInstructions), then
  //    payment fields with extracted/inferred status are suspicious and must be warned.
  //
  //    This is a content-agnostic rule — not tied to any specific vendor, filename, or PDF.
  const paymentDocTypes = new Set([
    "payment_instruction",
    "investment_payment_instruction",
    "payment_schedule",
  ]);
  const nonPaymentInformativeTypes = new Set([
    "investment_modelation",
    "investment_service_agreement",
    "investment_subscription_document",
    "pension_contract",
    "precontract_information",
    "insurance_comparison",
    "financial_analysis_document",
    "life_insurance_modelation",
  ]);
  const hasExplicitPaymentSection = payload.contentFlags?.containsPaymentInstructions === true;
  const isPaymentDocType = paymentDocTypes.has(primaryType);

  if (!isPaymentDocType) {
    const paymentIdentifierFields = ["bankAccount", "iban", "accountForRepayment"] as const;
    const paymentAmountFields = ["totalMonthlyPremium", "annualPremium"] as const;
    const paymentRefFields = ["variableSymbol"] as const;

    const hasPaymentIdentifier = paymentIdentifierFields.some((k) => fieldPresent(fields[k]));
    const hasPaymentAmount = paymentAmountFields.some((k) => fieldPresent(fields[k]));
    const hasPaymentRef = paymentRefFields.some((k) => fieldPresent(fields[k]));
    const hasAnyPaymentField = hasPaymentIdentifier || (hasPaymentAmount && hasPaymentRef);

    if (hasAnyPaymentField && !hasExplicitPaymentSection) {
      if (nonPaymentInformativeTypes.has(primaryType)) {
        // Informative investment/modelation type with payment-like fields — clear warning that
        // these must NOT create payment setup in CRM without manual advisor confirmation.
        addWarning(warnings, reasonsForReview, "NON_PAYMENT_DOC_HAS_PAYMENT_FIELDS",
          "Informativní/investiční dokument obsahuje platební pole. Tato pole NESMÍ být automaticky zapsána jako platební instrukce do CRM. Poradce musí potvrdit záměr.",
          undefined, "non_payment_doc_has_payment_fields");
      } else {
        // Contract-type or unknown type: warn but don't block — could be legitimate inline payment
        // section. The gate enforcer (quality-gates.ts) will decide apply eligibility.
        addWarning(warnings, reasonsForReview, "PAYMENT_FIELDS_WITHOUT_EXPLICIT_SECTION",
          "Platební pole jsou přítomna, ale dokument neobsahuje explicitní platební sekci (contentFlags.containsPaymentInstructions není true). Zkontrolujte, zda jde o skutečné platební instrukce.",
          undefined, "payment_fields_without_explicit_section");
      }
    }
  }

  // 8. Intermediary/insurer swap detection
  const insurerVal = ef.insurer?.value != null ? String(ef.insurer.value).toLowerCase() : "";
  const intermediaryVal = ef.intermediaryName?.value != null ? String(ef.intermediaryName.value).toLowerCase() : "";
  if (insurerVal && intermediaryVal && insurerVal === intermediaryVal) {
    addWarning(warnings, reasonsForReview, "INSURER_INTERMEDIARY_DUPLICATE",
      "Pojišťovna a zprostředkovatel mají stejnou hodnotu — zkontrolujte přiřazení.",
      "extractedFields.intermediaryName", "insurer_intermediary_duplicate");
  }

  // 9. DOMAIN ROLE CORRECTNESS: investment/DPS/DIP/pension documents must not carry
  //    insurance-only role labels (policyholder, insured) for the primary client.
  //
  //    Generic rule: if the primaryType belongs to the investment/pension domain and
  //    parties contain insurance-only role keys with non-empty values, emit a warning
  //    and flag for role correction. This is not tied to any vendor or filename.
  const investmentDomainTypes = new Set([
    "pension_contract",
    "investment_subscription_document",
    "investment_service_agreement",
    "investment_modelation",
    "investment_payment_instruction",
  ]);
  if (investmentDomainTypes.has(primaryType)) {
    const parties = (payload as Record<string, unknown>).parties as Record<string, unknown> | undefined;
    const insuranceOnlyRoleKeys = ["policyholder", "insured"] as const;
    for (const roleKey of insuranceOnlyRoleKeys) {
      const roleVal = parties?.[roleKey];
      const hasRoleValue =
        roleVal != null &&
        typeof roleVal === "object" &&
        "fullName" in roleVal &&
        (roleVal as Record<string, unknown>).fullName != null &&
        String((roleVal as Record<string, unknown>).fullName).trim() !== "";
      if (hasRoleValue) {
        addWarning(
          warnings,
          reasonsForReview,
          "INVESTMENT_DOC_INSURANCE_ROLE_LABEL",
          `Investiční/penzijní dokument (${primaryType}) používá pojišťovací roli '${roleKey}'. Použijte 'investor', 'participant' nebo 'account_holder'.`,
          `parties.${roleKey}`,
          "investment_doc_insurance_role_label",
        );
      }
    }
    // Also check extractedFields for insurance-role field names
    if (fieldPresent(ef.policyholder) || fieldPresent(ef.policyholderName)) {
      addWarning(
        warnings,
        reasonsForReview,
        "INVESTMENT_DOC_INSURANCE_ROLE_LABEL",
        `Investiční/penzijní dokument (${primaryType}) má extrahované pole 'policyholder'. Pro investiční typy použijte 'investorFullName' nebo 'participantFullName'.`,
        "extractedFields.policyholder",
        "investment_doc_insurance_role_label",
      );
    }
  }

  // 9b. COMPLETENESS ADVISORY: key contractual fields missing.
  //     Generic rule: when a required/expected field is absent, emit an advisory warning
  //     instead of silently accepting a missing value or allowing hallucination.
  //     "missing is better than invented" — this is a content-agnostic guard.
  const contractualTypes = new Set([
    "life_insurance_contract",
    "life_insurance_final_contract",
    "life_insurance_investment_contract",
    "nonlife_insurance_contract",
    "consumer_loan_contract",
    "consumer_loan_with_payment_protection",
    "mortgage_document",
    "pension_contract",
    "investment_subscription_document",
  ]);
  if (contractualTypes.has(primaryType)) {
    // Start date completeness
    const hasStartDate =
      fieldPresent(ef.contractStartDate) ||
      fieldPresent(ef.policyStartDate) ||
      fieldPresent(ef.startDate) ||
      fieldPresent(ef.effectiveDate);
    if (!hasStartDate) {
      addWarning(
        warnings,
        reasonsForReview,
        "MISSING_CONTRACT_START_DATE",
        "Datum začátku smlouvy (contractStartDate / policyStartDate) nebylo nalezeno — neinventovat.",
        "extractedFields.contractStartDate",
        "missing_key_field",
      );
    }

    // Investment/DPS-specific: fund strategy + funds
    const investmentContractTypes = new Set([
      "life_insurance_investment_contract",
      "pension_contract",
      "investment_subscription_document",
    ]);
    if (investmentContractTypes.has(primaryType)) {
      const hasFundStrategy =
        fieldPresent(ef.fundStrategy) ||
        fieldPresent(ef.investmentStrategy) ||
        fieldPresent(ef.investmentProgram);
      const hasInvestmentFunds =
        fieldPresent(ef.investmentFunds) ||
        fieldPresent(ef.fundAllocation) ||
        fieldPresent(ef.proposedFunds);
      if (!hasFundStrategy) {
        addWarning(
          warnings,
          reasonsForReview,
          "MISSING_FUND_STRATEGY",
          "Investiční strategie (fundStrategy / investmentStrategy) nebyla nalezena — neinventovat.",
          "extractedFields.fundStrategy",
          "missing_key_field",
        );
      }
      if (!hasInvestmentFunds) {
        addWarning(
          warnings,
          reasonsForReview,
          "MISSING_INVESTMENT_FUNDS",
          "Investiční fondy (investmentFunds / fundAllocation) nebyly nalezeny — neinventovat.",
          "extractedFields.investmentFunds",
          "missing_key_field",
        );
      }
    }

    // Non-life: insured object
    if (primaryType === "nonlife_insurance_contract") {
      const hasInsuredObject =
        fieldPresent(ef.insuredObject) ||
        fieldPresent(ef.insuredAddress) ||
        fieldPresent(ef.vehicleInfo) ||
        fieldPresent(ef.propertyAddress);
      if (!hasInsuredObject) {
        addWarning(
          warnings,
          reasonsForReview,
          "MISSING_INSURED_OBJECT",
          "Pojistný předmět (insuredObject) nebyl nalezen — neinventovat.",
          "extractedFields.insuredObject",
          "missing_key_field",
        );
      }
    }
  }

  // 10. documentFamily fell to unknown when text clearly indicates a known family
  if (primaryType === "unsupported_or_unknown" || primaryType === "generic_financial_document") {
    addWarning(warnings, reasonsForReview, "DOCUMENT_FAMILY_UNKNOWN",
      "Typ dokumentu nebyl rozpoznán — ověřte klasifikaci.",
      "documentClassification.primaryType", "document_family_unknown");
  }

  return {
    valid: warnings.filter((w) =>
      ["PROPOSAL_MARKED_AS_CONTRACT", "PAYMENT_INSTRUCTION_AS_CONTRACT",
       "BIRTHDATE_CONTAINS_PERSONAL_ID", "PERSONAL_ID_MASKED", "PAYMENT_FIELD_MASKED"].includes(w.code)
    ).length === 0,
    warnings,
    reasonsForReview: [...new Set(reasonsForReview)],
  };
}
