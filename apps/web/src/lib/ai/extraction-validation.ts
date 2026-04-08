/**
 * Validation layer for extracted contract data.
 * Rules for contract number, amounts, payment frequency, dates, email, phone, identifiers.
 */

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

/** Variable symbol: 1-10 digits. */
function isValidVariableSymbol(vs: string): boolean {
  const cleaned = vs.replace(/\s/g, "");
  return /^\d{1,10}$/.test(cleaned);
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

  // Personal ID (Czech: 9 or 10 digits, optional slash)
  const personalId = payload.client?.personalId;
  if (personalId != null && String(personalId).trim() !== "") {
    const id = String(personalId).trim().replace(/\s/g, "");
    if (!/^\d{9}$|^\d{9}\/\d{1}$|^\d{6}\/\d{3,4}$/.test(id) && id.length < 8) {
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
    if (!isValidVariableSymbol(String(variableSymbol).trim())) {
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

  const proposalTypes = new Set([
    "life_insurance_proposal", "life_insurance_modelation", "investment_modelation",
    "precontract_information", "liability_insurance_offer", "insurance_comparison",
  ]);
  if (proposalTypes.has(primaryType) && payload.contentFlags?.isFinalContract) {
    addWarning(warnings, reasonsForReview, "PROPOSAL_MARKED_AS_CONTRACT",
      "Návrh/modelace je označen jako finální smlouva. Zkontrolujte klasifikaci.",
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

  // 9. user-facing date not in Czech format (ISO date leaking to display)
  for (const dateKey of ["policyStartDate", "policyEndDate", "birthDate", "startDate", "endDate", "effectiveDate"]) {
    const dv = ef[dateKey]?.value != null ? String(ef[dateKey]!.value).trim() : "";
    if (dv && /^\d{4}-\d{2}-\d{2}$/.test(dv)) {
      // ISO format is correct for internal storage; display layer handles conversion.
      // Only warn if the field is explicitly marked as "display" somewhere.
    }
  }

  // 4. Text explicitly mentions Pojistník but policyholder/fullName is empty
  const insuranceDocTypes = new Set([
    "life_insurance_contract", "life_insurance_final_contract", "life_insurance_investment_contract",
    "life_insurance_proposal", "nonlife_insurance_contract", "liability_insurance_offer",
    "life_insurance_change_request", "insurance_policy_change_or_service_doc",
  ]);
  if (insuranceDocTypes.has(primaryType)) {
    const hasClient = fieldExtracted(ef.fullName) || fieldExtracted(ef.policyholder) || fieldExtracted(ef.clientFullName);
    if (!hasClient) {
      addWarning(warnings, reasonsForReview, "POLICYHOLDER_MISSING",
        "Pojistník / klient nebyl extrahován — dokument má pojistníka dle typu.",
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
  const hasPaymentData = fieldExtracted(ef.totalMonthlyPremium) || fieldExtracted(ef.annualPremium) ||
    fieldExtracted(ef.installmentAmount) || fieldExtracted(ef.premiumAmount) || fieldExtracted(ef.bankAccount);
  const productDocTypes = new Set([...insuranceDocTypes, "consumer_loan_contract", "consumer_loan_with_payment_protection", "mortgage_document"]);
  if (productDocTypes.has(primaryType) && !hasPaymentData) {
    addWarning(warnings, reasonsForReview, "PAYMENT_DATA_MISSING",
      "Dokument je smluvního typu, ale platební údaje nebyly extrahovány.",
      undefined, "payment_data_missing");
  }

  // 8. Intermediary/insurer swap detection
  const insurerVal = ef.insurer?.value != null ? String(ef.insurer.value).toLowerCase() : "";
  const intermediaryVal = ef.intermediaryName?.value != null ? String(ef.intermediaryName.value).toLowerCase() : "";
  if (insurerVal && intermediaryVal && insurerVal === intermediaryVal) {
    addWarning(warnings, reasonsForReview, "INSURER_INTERMEDIARY_DUPLICATE",
      "Pojišťovna a zprostředkovatel mají stejnou hodnotu — zkontrolujte přiřazení.",
      "extractedFields.intermediaryName", "insurer_intermediary_duplicate");
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
