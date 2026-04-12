/**
 * Maps alternate LLM keys / nested blobs onto canonical extractedFields
 * expected by schema verification, legacy validation, and CRM draft projection.
 */

import type { DocumentReviewEnvelope, ExtractedField, PrimaryDocumentType } from "./document-review-types";
import { normalizeExtractedFieldDates, normalizeExtractedFieldFrequencies } from "./canonical-date-normalize";
import { applyFieldSourcePriorityAndEvidence } from "./field-source-priority";

function valuePresent(cell: ExtractedField | undefined): boolean {
  if (!cell) return false;
  if (
    cell.status === "missing" ||
    cell.status === "not_applicable" ||
    cell.status === "explicitly_not_selected"
  ) {
    return false;
  }
  const v = cell.value;
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "" && s !== "—";
}

function cloneCellFrom(source: ExtractedField): ExtractedField {
  return {
    value: source.value,
    status:
      source.status === "inferred_low_confidence" || source.status === "extracted"
        ? source.status
        : "extracted",
    confidence: typeof source.confidence === "number" ? source.confidence : 0.78,
    evidenceSnippet: source.evidenceSnippet,
    sourcePage: source.sourcePage,
    sensitive: source.sensitive,
  };
}

function asSearchableText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((item) => asSearchableText(item)).filter(Boolean).join("\n");
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return "";
}

function mergeFromAliases(
  ef: Record<string, ExtractedField>,
  canonical: string,
  aliases: string[]
): void {
  if (valuePresent(ef[canonical])) return;
  for (const key of aliases) {
    const src = ef[key];
    if (valuePresent(src)) {
      ef[canonical] = cloneCellFrom(src);
      return;
    }
  }
}

function formatUnknownValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    return v
      .map((x) => formatUnknownValue(x))
      .filter(Boolean)
      .join("; ");
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of ["strategy", "name", "label", "description", "type", "allocation", "funds"]) {
      if (o[k] != null) parts.push(`${k}: ${formatUnknownValue(o[k])}`);
    }
    if (parts.length) return parts.join(" · ");
    try {
      const s = JSON.stringify(v);
      return s.length > 280 ? `${s.slice(0, 277)}…` : s;
    } catch {
      return "";
    }
  }
  return String(v);
}

/** Required schema field for investment_subscription_document — models often omit it on DIP PDFs. */
function ensureProductTypeForSubscriptionDocument(ef: Record<string, ExtractedField>): void {
  if (valuePresent(ef.productType)) return;
  const pn = String(ef.productName?.value ?? "").toLowerCase();
  if (
    pn.includes("dip") ||
    pn.includes("dlouhodobý investiční") ||
    pn.includes("dlouhodoby investicni") ||
    pn.includes("amundi platforma")
  ) {
    ef.productType = {
      value: "DIP",
      status: "inferred_low_confidence",
      confidence: 0.72,
    };
  }
}

function deriveInvestmentStrategyFromNested(ef: Record<string, ExtractedField>): void {
  if (valuePresent(ef.investmentStrategy)) return;
  const nestedKeys = [
    "investmentDetails",
    "investmentProfile",
    "fundDetails",
    "portfolioAllocation",
    "proposedFunds",
    "investmentFundName",
    "fundName",
    "selectedFund",
    "recommendedFund",
    "fondFondu",
    "investmentOption",
  ];
  for (const nk of nestedKeys) {
    const cell = ef[nk];
    if (!cell || cell.value == null) continue;
    const raw = cell.value;
    if (typeof raw === "string") {
      const text = raw.trim();
      if (text) {
        ef.investmentStrategy = {
          value: text,
          status: cell.status === "inferred_low_confidence" ? "inferred_low_confidence" : "extracted",
          confidence: cell.confidence ?? 0.72,
          evidenceSnippet: cell.evidenceSnippet,
        };
        return;
      }
    }
    if (typeof raw === "object") {
      const text = formatUnknownValue(raw).trim();
      if (text) {
        ef.investmentStrategy = {
          value: text,
          status: cell.status === "inferred_low_confidence" ? "inferred_low_confidence" : "extracted",
          confidence: cell.confidence ?? 0.72,
          evidenceSnippet: cell.evidenceSnippet,
        };
        return;
      }
    }
  }
}

function salvageCanonicalFieldsFromTextishCells(
  ef: Record<string, ExtractedField>,
  opts?: { skipContractNumberSalvage?: boolean }
): void {
  const chunks = Object.values(ef)
    .flatMap((cell) => [asSearchableText(cell?.value), cell?.evidenceSnippet ?? ""])
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length === 0) return;
  const blob = chunks.join("\n");

  if (!valuePresent(ef.insurer)) {
    const insurerMatch = blob.match(
      /\b(Generali Česká pojišťovna(?:\s+a\.s\.)?|Generali|Kooperativa|UNIQA|Allianz|NN Životní pojišťovna|ČSOB Pojišťovna|ČPP|Simplea|MAXIMA pojišťovna(?:,?\s+a\.s\.)?|Pillow pojišťovna(?:,?\s+a\.s\.)?|Pillow)\b/i
    );
    if (insurerMatch) {
      ef.insurer = {
        value: insurerMatch[1],
        status: "inferred_low_confidence",
        confidence: 0.66,
      };
    }
  }

  if (!valuePresent(ef.productName)) {
    const productMatch =
      blob.match(/\b(Bel Mondo(?:\s+\d+)?)\b/i) ??
      blob.match(/(?:produkt|plan|produktová řada|název produktu)[:\s]*([^\n,]{3,80})/i);
    if (productMatch?.[1]) {
      ef.productName = {
        value: productMatch[1].trim(),
        status: "inferred_low_confidence",
        confidence: 0.64,
      };
    }
  }

  if (!opts?.skipContractNumberSalvage && !valuePresent(ef.contractNumber)) {
    const contractMatch = blob.match(
      /(?:pojistná smlouva(?:\s+číslo)?|číslo smlouvy|číslo pojistné smlouvy|contract number|policy number)[:\s]*([A-Z0-9\/-]{5,})/i
    );
    if (contractMatch?.[1]) {
      const candidate = contractMatch[1].trim();
      const existingModelationId = ef.modelationId?.value != null ? String(ef.modelationId.value) : "";
      if (candidate !== existingModelationId) {
        ef.contractNumber = {
          value: candidate,
          status: "inferred_low_confidence",
          confidence: 0.68,
        };
      }
    }
  }

  if (!valuePresent(ef.policyStartDate)) {
    const startDateMatch = blob.match(
      /(?:počátek pojištění|počátek smlouvy|start pojištění|účinnost od|effective date)[:\s]*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i
    );
    if (startDateMatch?.[1]) {
      ef.policyStartDate = {
        value: startDateMatch[1].trim(),
        status: "inferred_low_confidence",
        confidence: 0.68,
      };
    }
  }

  if (!valuePresent(ef.investmentStrategy)) {
    const strategyMatch = blob.match(
      /(?:investiční strategie|strategie investování|strategie)[:\s]*([^\n]{3,120})/i
    );
    if (strategyMatch?.[1]) {
      ef.investmentStrategy = {
        value: strategyMatch[1].trim(),
        status: "inferred_low_confidence",
        confidence: 0.6,
      };
    } else {
      const fondFonduMatch = blob.match(/\b(Fond\s+fondů[^\n]{3,120})/i);
      if (fondFonduMatch?.[1]) {
        ef.investmentStrategy = {
          value: fondFonduMatch[1].trim(),
          status: "inferred_low_confidence",
          confidence: 0.58,
        };
      }
    }
  }
}

/**
 * Fill composite required keys used in document-schema-registry.
 * Priority: contractNumber > proposalNumber > modelationId > weaker aliases.
 * modelationId is never silently promoted to contractNumber.
 */
function mergeCompositeReferenceFields(ef: Record<string, ExtractedField>): void {
  const strongContractAliases = [
    "contractNumber",
    "policyNumber",
    "policyNo",
    "existingPolicyNumber",
    "smlouvaCislo",
  ];
  const weakerAliases = [
    "proposalNumber",
    "referenceNumber",
    "businessCaseNumber",
  ];
  const orderedForComposite = [...strongContractAliases, ...weakerAliases, "modelationId"];

  if (!valuePresent(ef.proposalNumber_or_contractNumber)) {
    for (const key of orderedForComposite) {
      const src = ef[key];
      if (valuePresent(src)) {
        ef.proposalNumber_or_contractNumber = cloneCellFrom(src);
        break;
      }
    }
  }
  if (!valuePresent(ef.contractNumber_or_proposalNumber)) {
    for (const key of orderedForComposite) {
      const src = ef[key];
      if (valuePresent(src)) {
        ef.contractNumber_or_proposalNumber = cloneCellFrom(src);
        break;
      }
    }
  }
  if (!valuePresent(ef.existingPolicyNumber_or_reference)) {
    mergeFromAliases(ef, "existingPolicyNumber_or_reference", [
      "existingPolicyNumber",
      "policyNumber",
      "contractNumber",
      "referenceNumber",
      "policyReference",
    ]);
  }
}

function pullFromFinancialTerms(envelope: DocumentReviewEnvelope): void {
  const ef = envelope.extractedFields;
  const ft = envelope.financialTerms ?? {};
  const primary = envelope.documentClassification.primaryType;
  const skipContractNumber =
    primary === "life_insurance_modelation" || primary === "investment_modelation";

  for (const [k, v] of Object.entries(ft)) {
    if (v == null) continue;
    const lk = k.toLowerCase();
    const str = typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
    if (!str) continue;

    if (
      !valuePresent(ef.insurer) &&
      (lk.includes("insurer") || lk.includes("pojistov") || lk.includes("institution"))
    ) {
      ef.insurer = { value: str, status: "extracted", confidence: 0.7 };
    }
    if (!valuePresent(ef.productName) && (lk.includes("product") || lk.includes("produkt"))) {
      ef.productName = { value: str, status: "extracted", confidence: 0.7 };
    }
    if (
      !skipContractNumber &&
      !valuePresent(ef.contractNumber) &&
      (lk.includes("contract") || lk.includes("policy") || lk.includes("smlouv"))
    ) {
      ef.contractNumber = { value: str, status: "extracted", confidence: 0.7 };
    }
    if (!valuePresent(ef.totalMonthlyPremium) && (lk.includes("premium") || lk.includes("pojistn"))) {
      ef.totalMonthlyPremium = { value: str, status: "extracted", confidence: 0.7 };
    }
    if (
      !valuePresent(ef.bankAccount) &&
      (lk.includes("account") || lk.includes("ucet") || lk.includes("účet"))
    ) {
      ef.bankAccount = { value: str, status: "extracted", confidence: 0.7 };
    }
    if (!valuePresent(ef.variableSymbol) && (lk.includes("variable") || lk.includes("variabil"))) {
      ef.variableSymbol = { value: str, status: "extracted", confidence: 0.7 };
    }
  }
}

function applyPrimaryTypeSpecificAliases(primary: PrimaryDocumentType, ef: Record<string, ExtractedField>): void {
  switch (primary) {
    case "consumer_loan_contract":
    case "consumer_loan_with_payment_protection":
      mergeFromAliases(ef, "lender", [
        "bankName",
        "creditor",
        "institutionName",
        "loanProvider",
        "financialInstitution",
        "veritel",
        "poskytovatelUveru",
      ]);
      mergeFromAliases(ef, "loanAmount", [
        "principal",
        "creditAmount",
        "totalLoanAmount",
        "borrowedAmount",
        "loanPrincipal",
        "vysaUveru",
        "celkovaVyseUveru",
        "limitUveru",
        // ČSOB and other Czech bank specific field names
        "vyseUveru",
        "celkovyLimitUveru",
        "hlavniJistina",
        "jistina",
        "celkoveZapujceneJistiny",
        "totalCredit",
        "loanCapital",
        "uverovaJistina",
        "spotrebitelskiUver",
        "uverovyLimit",
        "uverCastka",
      ]);
      mergeFromAliases(ef, "installmentAmount", [
        "monthlyInstallment",
        "monthlyPayment",
        "installment",
        "regularPayment",
        "annuityPayment",
        "mesicniSplatka",
        "vyseAnuitniSplatky",
        "vyseSpLatky",
      ]);
      mergeFromAliases(ef, "installmentCount", [
        "numberOfInstallments",
        "numberOfPayments",
        "repaymentPeriod",
        "termMonths",
        "loanTermMonths",
        "numberOfMonths",
        "pocetSplatek",
        "pocetMesicnichSplatek",
        "pocetAnuitnichSplatek",
        "pocetPlateb",
        // ČSOB and other Czech bank specific
        "dobaSplaceniMesice",
        "dobaSplaceni",
        "dobaUveru",
        "pocetSplatkove",
        "splatkovychObdobi",
      ]);
      mergeFromAliases(ef, "interestRate", [
        "nominalInterestRate",
        "annualInterestRate",
        "urokSazba",
        "urokoveRocniSazba",
        "rocniUrokovaSazba",
        "debitInterestRate",
        "fixedInterestRate",
      ]);
      mergeFromAliases(ef, "rpsn", ["apr", "RPSN", "rocniProcentniSazbaNavkladu", "annualPercentageRate"]);
      mergeFromAliases(ef, "contractNumber", [
        "loanContractNumber",
        "cisloSmlouvy",
        "smlouvaCislo",
        "contractId",
        "uverovaSmlCislo",
        "uverovaSmluvaCislo",
      ]);
      mergeFromAliases(ef, "borrowerName", [
        "dluznik",
        "borrower",
        "clientFullName",
        "fullName",
      ]);
      mergeFromAliases(ef, "fullName", [
        "borrowerName",
        "dluznik",
        "borrower",
        "clientFullName",
      ]);
      mergeFromAliases(ef, "accountForRepayment", [
        "bankAccount",
        "relatedBankAccount",
        "repaymentAccount",
        "cisloUctuProSplaceni",
        "splatkovyUcet",
      ]);
      mergeFromAliases(ef, "startDate", [
        "disbursementDate",
        "contractDate",
        "datumUzavreniSmlouvy",
        "policyStartDate",
        "effectiveDate",
      ]);
      mergeFromAliases(ef, "intermediaryName", [
        "advisorName",
        "brokerName",
        "zprostredkovatel",
        "zprostredkovatelUveru",
        "intermediary",
        "agentName",
      ]);
      mergeFromAliases(ef, "intermediaryCompany", [
        "brokerCompany",
        "intermediaryFirm",
        "zprostredkovatelFirma",
      ]);
      break;
    case "mortgage_document":
      mergeFromAliases(ef, "lender", [
        "bankName",
        "creditor",
        "institutionName",
        "mortgageBank",
        "veritel",
        "hypotecniBanka",
        "poskytovatelHypoteky",
      ]);
      mergeFromAliases(ef, "documentStatus", [
        "documentType",
        "documentKind",
        "agreementType",
        "contractStatus",
        "druhSmlouvy",
        "stavDokumentu",
      ]);
      mergeFromAliases(ef, "loanAmount", [
        "principal",
        "mortgageAmount",
        "creditAmount",
        "vysaHypotecnihoUveru",
        "vysaUveru",
        "celkovaVyseUveru",
      ]);
      mergeFromAliases(ef, "installmentAmount", [
        "monthlyInstallment",
        "monthlyPayment",
        "installment",
        "regularPayment",
        "annuityPayment",
        "mesicniSplatka",
        "vyseAnuitniSplatky",
      ]);
      mergeFromAliases(ef, "installmentCount", [
        "numberOfInstallments",
        "numberOfPayments",
        "repaymentPeriod",
        "termMonths",
        "pocetSplatek",
        "pocetMesicnichSplatek",
        "pocetAnuitnichSplatek",
      ]);
      mergeFromAliases(ef, "interestRate", [
        "nominalInterestRate",
        "annualInterestRate",
        "urokoveRocniSazba",
        "rocniUrokovaSazba",
        "fixedInterestRate",
        "debitInterestRate",
      ]);
      mergeFromAliases(ef, "rpsn", ["apr", "RPSN", "rocniProcentniSazbaNavkladu"]);
      mergeFromAliases(ef, "contractNumber", [
        "loanContractNumber",
        "cisloSmlouvy",
        "smlouvaCislo",
        "contractId",
        "hypotekaSmlouvaCislo",
      ]);
      mergeFromAliases(ef, "borrowerName", [
        "dluznik",
        "borrower",
        "clientFullName",
        "fullName",
      ]);
      mergeFromAliases(ef, "fullName", [
        "borrowerName",
        "dluznik",
        "borrower",
        "clientFullName",
      ]);
      // coBorrowers / spoludluznik
      mergeFromAliases(ef, "coBorrowerName", [
        "spoludluznik",
        "coBorrower",
        "coApplicant",
        "coApplicantName",
        "spoludluznikJmeno",
      ]);
      mergeFromAliases(ef, "startDate", [
        "disbursementDate",
        "contractDate",
        "datumUzavreniSmlouvy",
        "policyStartDate",
        "effectiveDate",
      ]);
      mergeFromAliases(ef, "maturityDate", [
        "endDate",
        "policyEndDate",
        "datumSplatnosti",
        "datumUkonceni",
        "loanEndDate",
      ]);
      mergeFromAliases(ef, "intermediaryName", [
        "advisorName",
        "brokerName",
        "zprostredkovatel",
        "intermediary",
      ]);
      break;
    case "pension_contract":
      // Pension company: promote to `provider` so it shows with the correct label ("Poskytovatel").
      // Also populate `institutionName` as generic fallback for display.
      mergeFromAliases(ef, "provider", [
        "institutionName",
        "insurer",
        "pensionProvider",
        "pensionCompany",
        "penzijniSpolecnost",
        "fundManager",
        "administrator",
        "employerName",
      ]);
      mergeFromAliases(ef, "institutionName", [
        "provider",
        "insurer",
        "pensionProvider",
        "pensionCompany",
      ]);
      // For pension contracts, `insurer` holds the pension company name which was extracted under
      // the insurance vocabulary. Promote its value to `provider`, then suppress `insurer` so
      // the UI does not show "Pojišťovna" for a pension company.
      if (valuePresent(ef.insurer) && !valuePresent(ef.provider)) {
        ef.provider = { ...ef.insurer! };
      }
      if (valuePresent(ef.insurer)) {
        // Suppress insurer display for pension contracts — not an insurance company
        ef.insurer = { value: null, status: "not_applicable" as const, confidence: 1 };
      }
      mergeFromAliases(ef, "participantFullName", [
        "fullName",
        "clientFullName",
        "accountHolderName",
        "memberName",
        "ucastnik",
        "klient",
      ]);
      // Ensure fullName is also populated for display/validation when participantFullName is set
      mergeFromAliases(ef, "fullName", [
        "participantFullName",
        "clientFullName",
        "accountHolderName",
        "memberName",
      ]);
      mergeFromAliases(ef, "startDate", [
        "policyStartDate",
        "effectiveDate",
        "contractStartDate",
        "participationStartDate",
        "datumVznikuSmlouvy",
      ]);
      // Pension-specific payment fields: monthly contribution → totalMonthlyPremium for display
      mergeFromAliases(ef, "totalMonthlyPremium", [
        "contributionParticipant",
        "mesicniPrispevek",
        "monthlyContribution",
        "regularContribution",
        "prispevekUcastnika",
      ]);
      // Suppress investmentPremium display for pensions — use totalMonthlyPremium instead
      if (valuePresent(ef.investmentPremium) && !valuePresent(ef.totalMonthlyPremium)) {
        ef.totalMonthlyPremium = { ...ef.investmentPremium! };
      }
      if (valuePresent(ef.investmentPremium)) {
        ef.investmentPremium = { value: null, status: "not_applicable" as const, confidence: 1 };
      }
      mergeFromAliases(ef, "bankAccount", [
        "paymentAccount",
        "ucetProPlatbu",
        "cisloUctuDPS",
        "cisloUctu",
        "accountNumber",
      ]);
      deriveInvestmentStrategyFromNested(ef);
      break;
    case "investment_modelation":
    case "investment_service_agreement":
    case "investment_subscription_document":
      mergeFromAliases(ef, "provider", [
        "institutionName",
        "insurer",
        "platform",
        "fundManager",
        "assetManager",
        "investicniSpolecnost",
        "spravce",
      ]);
      mergeFromAliases(ef, "investorFullName", [
        "fullName",
        "clientFullName",
        "investorName",
        "klient",
        "ucastnik",
        "investor",
      ]);
      mergeFromAliases(ef, "fullName", [
        "investorFullName",
        "clientFullName",
        "investorName",
        "klient",
      ]);
      mergeFromAliases(ef, "isin", [
        "isinCode",
        "isinCenneho",
        "isinPodfondu",
        "cennyPapir",
      ]);
      mergeFromAliases(ef, "intendedInvestment", [
        "investmentAmount",
        "contributionAmount",
        "investicniCastka",
        "zamislenVyseInvestice",
        "zamyslenaInvestice",
      ]);
      mergeFromAliases(ef, "entryFeePercent", [
        "vstupniPoplatek",
        "poplatekVstupni",
        "entryFee",
        "frontendFeePercent",
        "subscriptionFeePercent",
      ]);
      mergeFromAliases(ef, "amountToPay", [
        "castkaKUhrade",
        "platba",
        "totalAmountDue",
        "celkovaCastka",
        "amountDue",
      ]);
      mergeFromAliases(ef, "contractNumber", [
        "accountNumber",
        "investicniUcet",
        "cisloSmlouvy",
        "cisloUctu",
        "smlouvaCislo",
      ]);
      mergeFromAliases(ef, "intermediaryName", [
        "advisorName",
        "brokerName",
        "zprostredkovatel",
        "investicniPoradce",
        "intermediary",
      ]);
      mergeFromAliases(ef, "startDate", [
        "contractDate",
        "subscriptionDate",
        "datumUzavreni",
        "policyStartDate",
        "effectiveDate",
      ]);
      mergeFromAliases(ef, "accountOrReference", [
        "bankAccount",
        "variableSymbol",
        "accountNumber",
        "contractNumber",
        "investicniUcet",
        "cisloUctu",
      ]);
      deriveInvestmentStrategyFromNested(ef);
      mergeFromAliases(ef, "productType", [
        "investmentStrategy",
        "productCategory",
        "productKind",
        "documentFamily",
        "subscriptionType",
        "fundType",
      ]);
      if (primary === "investment_subscription_document") {
        ensureProductTypeForSubscriptionDocument(ef);
      }
      break;

    case "generic_financial_document":
      // Leasing / business financing docs are mapped to generic_financial_document
      mergeFromAliases(ef, "lender", [
        "financingProvider",
        "leasingProvider",
        "pronajimatel",
        "veritel",
        "leasingCompany",
        "leasingova_spolecnost",
        "financingCompany",
      ]);
      mergeFromAliases(ef, "customer", [
        "customerName",
        "zakaznik",
        "klient",
        "prijemce",
        "dluznik",
        "leasingTenant",
        "lessee",
        "lesseeName",
      ]);
      mergeFromAliases(ef, "lesseeName", [
        "customer",
        "customerName",
        "lessee",
        "zakaznik",
        "klient",
      ]);
      mergeFromAliases(ef, "fullName", [
        "customer",
        "customerName",
        "zakaznik",
        "representedBy",
        "customerFullName",
      ]);
      mergeFromAliases(ef, "contractNumber", [
        "leasingContractNumber",
        "cisloLeasingoveSmalouvy",
        "cisloSmlouvy",
        "smlouvaCislo",
        "contractId",
        "financingContractNumber",
      ]);
      mergeFromAliases(ef, "totalFinancedAmount", [
        "loanAmount",
        "financedAmount",
        "leasingAmount",
        "celkoveFinancovani",
        "celkovaCena",
        "vyseFinancovani",
      ]);
      mergeFromAliases(ef, "loanAmount", [
        "totalFinancedAmount",
        "financedAmount",
        "leasingAmount",
        "celkoveCena",
      ]);
      mergeFromAliases(ef, "installmentAmount", [
        "monthlyInstallment",
        "monthlyPayment",
        "leasingInstallment",
        "mesicniSplatka",
        "splatka",
        "regularPayment",
      ]);
      mergeFromAliases(ef, "installmentCount", [
        "duration",
        "leasingTerm",
        "numberOfInstallments",
        "pocetSplatek",
        "dobaFinancovani",
      ]);
      mergeFromAliases(ef, "firstInstallmentDate", [
        "firstRepaymentDate",
        "datumPrvniSplatky",
        "startDate",
      ]);
      mergeFromAliases(ef, "startDate", [
        "firstDrawdownDate",
        "datumZahajeni",
        "contractDate",
        "effectiveDate",
      ]);
      mergeFromAliases(ef, "financedObject", [
        "subjectOfFinancing",
        "predmetFinancovani",
        "vehicleDescription",
        "vehicle",
        "equipment",
        "leasedObject",
      ]);
      mergeFromAliases(ef, "vin", [
        "vinNumber",
        "serialNumber",
        "vyrobniCislo",
        "identificationNumber",
      ]);
      mergeFromAliases(ef, "downPayment", [
        "firstPayment",
        "akontace",
        "vlastniZdroje",
        "mimoradnaSplatka",
        "ownResources",
      ]);
      mergeFromAliases(ef, "registrationPlate", [
        "spz",
        "spzNumber",
        "licensePlate",
        "ecv",
        "registrationNumber",
        "statniZnacka",
      ]);
      mergeFromAliases(ef, "intermediaryName", [
        "advisorName",
        "brokerName",
        "zprostredkovatel",
        "intermediary",
      ]);
      break;
    // ─── Main insurance document types ─────────────────────────────────────────
    // The legacy insuranceProposalModelation prompt only sets fullName from client.fullName;
    // it never sets the separate `policyholder` field. The combined/nonLife paths may
    // return `policyholder` explicitly or as a nested parties object that resolves to null.
    // Rule: explicit policyholder in the document MUST survive regardless of lifecycleStatus.
    // Proposal / non_final affects DOCUMENT STATUS only — never nullifies an explicit role.
    case "life_insurance_proposal":
    case "life_insurance_contract":
    case "life_insurance_final_contract":
    case "life_insurance_investment_contract":
    case "nonlife_insurance_contract":
    case "liability_insurance_offer":
      // Bidirectional policyholder ↔ fullName sync.
      mergeFromAliases(ef, "policyholder", [
        "fullName",
        "clientFullName",
        "policyholderName",
        "pojistnik",
        "klient",
      ]);
      mergeFromAliases(ef, "fullName", [
        "policyholder",
        "policyholderName",
        "pojistnik",
        "clientFullName",
      ]);
      // Insured person fallback: if insuredPersonName is not separately extracted,
      // use policyholder / fullName (common for single-person proposals and non-life docs).
      // "Pojištěný je shodný s pojistníkem" semantic — also handled in combined-extraction prompt.
      mergeFromAliases(ef, "insuredPersonName", [
        "insured",
        "pojisteny",
        "policyholder",
        "fullName",
      ]);
      mergeFromAliases(ef, "insurer", [
        "pojistitel",
        "pojistovna",
        "insuranceCompany",
        "issuer",
      ]);
      break;

    case "payment_instruction":
    case "investment_payment_instruction":
      mergeFromAliases(ef, "provider", ["institutionName", "insurer", "payerBank", "recipientName"]);
      mergeFromAliases(ef, "contractReference", ["contractNumber", "policyNumber", "referenceNumber"]);
      break;

    case "insurance_policy_change_or_service_doc":
    case "life_insurance_change_request":
      mergeFromAliases(ef, "existingPolicyNumber", [
        "contractNumber",
        "policyNumber",
        "policyNo",
        "cisloSmlouvy",
        "pojistnaSmlouvaCislo",
        "existingContractNumber",
        "pojistnaSmlouvaC",
        "smlouvaCislo",
        "documentNumber",
        "referenceNumber",
      ]);
      mergeFromAliases(ef, "contractNumber", [
        "existingPolicyNumber",
        "policyNumber",
        "pojistnaSmlouvaCislo",
      ]);
      mergeFromAliases(ef, "insurer", [
        "pojistitel",
        "pojistovna",
        "insuranceCompany",
        "issuer",
      ]);
      mergeFromAliases(ef, "fullName", [
        "policyholder",
        "pojistnik",
        "klient",
        "clientFullName",
        "insuredPerson",
      ]);
      mergeFromAliases(ef, "effectiveDate", [
        "amendmentDate",
        "requestDate",
        "datumZmeny",
        "datumPodani",
        "validFrom",
        "changeDate",
        "datumUcinnosti",
      ]);
      mergeFromAliases(ef, "requestedChanges", [
        "description",
        "changedFields",
        "requestDescription",
        "changeDescription",
        "pozadovaneZmeny",
      ]);
      // Payment fields — change docs often contain full payment section (annual premium, installment, account)
      mergeFromAliases(ef, "annualPremium", [
        "rocniPojistne",
        "annualInsurancePremium",
        "celkoveRocniPojistne",
        "totalAnnualPremium",
        "premiumAnnual",
        "rocnePojistne",
      ]);
      mergeFromAliases(ef, "totalMonthlyPremium", [
        "installmentAmount",
        "vyseSplatky",
        "splatka",
        "mesicniSplatka",
        "paymentAmount",
        "premiumInstallment",
        "monthlyInstallment",
      ]);
      mergeFromAliases(ef, "bankAccount", [
        "cisloUctu",
        "accountNumber",
        "paymentAccountNumber",
        "bankPaymentInfo",
        "ucetCislo",
      ]);
      mergeFromAliases(ef, "variableSymbol", [
        "variabilniSymbol",
        "vs",
        "variableCode",
      ]);
      mergeFromAliases(ef, "paymentFrequency", [
        "frekvencePlaceni",
        "platebniFrekvence",
        "payFrequency",
        "frequency",
      ]);
      break;

    case "corporate_tax_return":
    case "payslip_document":
    case "bank_statement":
      // Institution / employer side (payslip employer, tax company, bank) — before person-name aliases
      mergeFromAliases(ef, "institutionName", [
        "employer",
        "employerName",
        "companyName",
        "taxpayerName",
      ]);
      mergeFromAliases(ef, "fullName", [
        "employee",
        "employeeName",
        "employee_name",
        "clientName",
        "accountHolder",
        "ownerName",
      ]);
      mergeFromAliases(ef, "grossPay", [
        "hrubaMzda",
        "grossSalary",
        "grossWage",
        "grossAmount",
        "grossIncome",
      ]);
      mergeFromAliases(ef, "netPay", [
        "cistaMzda",
        "netSalary",
        "netWage",
        "netAmount",
        "castkaKVyplate",
        "netIncome",
      ]);
      mergeFromAliases(ef, "payPeriod", [
        "periodLabel",
        "period",
        "payPeriodLabel",
        "statementPeriod",
        "mzdoveObdobi",
      ]);
      mergeFromAliases(ef, "payoutAccount", [
        "bankAccount",
        "accountForPayment",
        "vyplatniUcet",
        "ucetProVyplatu",
      ]);
      mergeFromAliases(ef, "bankAccount", [
        "payoutAccount",
        "payout_account",
        "accountForPayment",
        "vyplatniUcet",
        "ucetProVyplatu",
      ]);
      mergeFromAliases(ef, "companyName", [
        "employer",
        "institutionName",
        "taxpayerName",
        "zamestnavatel",
      ]);
      // Tax-return specific: IČO/DIČ and tax period
      mergeFromAliases(ef, "companyId", ["ico", "ic", "icoNumber", "businessId"]);
      mergeFromAliases(ef, "taxId", ["dic", "dicNumber", "vatId"]);
      mergeFromAliases(ef, "taxPeriod", ["taxPeriodLabel", "danoveObdobi", "taxYear", "zdanovaciObdobi"]);
      break;

    default:
      break;
  }
}

/**
 * Mutates `envelope.extractedFields` in place (and reads `financialTerms`).
 * Call early in finalize paths, before verification and legacy validation.
 */
/**
 * Maps descriptive/Czech/free-form field keys that LLMs sometimes emit
 * onto their canonical extractedFields equivalents.
 * These are applied BEFORE alias normalizations so downstream logic sees canonical keys.
 */
const DESCRIPTIVE_KEY_MAP: Record<string, string> = {
  // Czech descriptive keys (common in combined extraction outputs)
  "Klient / dlužník": "fullName",
  "Klient/dlužník": "fullName",
  "Klient": "fullName",
  "Dlužník": "borrowerName",
  "Pojistník": "fullName",
  "Spoludlužník": "coBorrowerName",
  "Smlouva / úvěr": "contractNumber",
  "Smlouva": "contractNumber",
  "Číslo smlouvy": "contractNumber",
  "Číslo návrhu": "proposalNumber",
  "Číslo úvěru": "contractNumber",
  "Platby pojistné": "totalMonthlyPremium",
  "Platby": "totalMonthlyPremium",
  "Měsíční splátka": "installmentAmount",
  "Výše úvěru": "loanAmount",
  "Roční pojistné": "annualPremium",
  "Pojistná smlouva": "contractNumber",
  "Pojišťovna": "insurer",
  "Pojistitel": "insurer",
  "Banka / věřitel": "lender",
  "Banka": "lender",
  "Věřitel": "lender",
  "Investiční smlouva / úpis": "contractNumber",
  "Investiční strategie": "investmentStrategy",
  "Produkt": "productName",
  "Rizika a připojištění": "coverages",
  "Druhý pojištěný": "secondInsuredName",
  "2. pojištěný": "secondInsuredName",
  "Zprostředkovatel": "intermediaryName",
  "Makléř": "intermediaryName",
  "Pojišťovací zprostředkovatel": "intermediaryName",
  "Pojistník/pojištěný": "fullName",
  "Pojistník / Pojištěný": "fullName",
  "Pojištěný a oprávněná osoba": "insuredPersonName",
  "Oprávněná osoba": "beneficiary",
  "Obmyšlená osoba": "beneficiary",
  // English descriptive keys
  "client": "fullName",
  "client_name": "fullName",
  "borrower": "borrowerName",
  "borrower_name": "borrowerName",
  "insurer_name": "insurer",
  "institution": "institutionName",
  "contract": "contractNumber",
  "contract_number": "contractNumber",
  "policy_number": "contractNumber",
  "payment": "totalMonthlyPremium",
  "payments": "totalMonthlyPremium",
  "monthly_payment": "installmentAmount",
  "loan_amount": "loanAmount",
  "annual_premium": "annualPremium",
  "coverages": "coverages",
  "risks": "coverages",
};

export function applyExtractedFieldAliasNormalizations(envelope: DocumentReviewEnvelope): void {
  const ef = envelope.extractedFields;
  if (!ef || typeof ef !== "object") return;

  // Remap descriptive/Czech/free-form keys onto canonical keys (first-write wins)
  for (const [descriptiveKey, canonicalKey] of Object.entries(DESCRIPTIVE_KEY_MAP)) {
    if (descriptiveKey in ef && !(canonicalKey in ef)) {
      (ef as Record<string, unknown>)[canonicalKey] = (ef as Record<string, unknown>)[descriptiveKey];
    }
  }

  const primary = envelope.documentClassification.primaryType;

  const isLoanOrMortgage =
    primary === "mortgage_document" ||
    primary === "consumer_loan_contract" ||
    primary === "consumer_loan_with_payment_protection";

  // Leasing/financing docs: bank/lender must NOT be labeled insurer
  const isLeasingOrFinancing = primary === "generic_financial_document";

  // For loan/mortgage/leasing: DO NOT promote institutionName → insurer (bank/lender is not an insurer).
  // For insurance docs: apply the normal alias so insurer is always populated.
  if (!isLoanOrMortgage && !isLeasingOrFinancing) {
    mergeFromAliases(ef, "insurer", [
      "institutionName",
      "insuranceCompany",
      "pojistitel",
      "pojistovna",
      "insurerName",
      "carrier",
      "providerName",
      "institution",
    ]);
    mergeFromAliases(ef, "institutionName", ["insurer", "pojistovna", "insuranceCompany", "pojistitel"]);
  }

  mergeFromAliases(ef, "productName", [
    "product",
    "productTitle",
    "planName",
    "nazevProduktu",
    "productLine",
    "productLabel",
    "planLabel",
    "contractName",
  ]);

  const isModelationDoc =
    primary === "life_insurance_modelation" || primary === "investment_modelation";

  // For proposals: do NOT auto-promote proposalNumber → contractNumber.
  // The LLM should explicitly set contractNumber only if it sees a finalized contract number.
  const isProposalDoc = primary === "life_insurance_proposal";

  if (!isModelationDoc && !isProposalDoc) {
    mergeFromAliases(ef, "contractNumber", [
      "policyNumber",
      "policyNo",
      "smlouvaCislo",
      "contractRef",
      "referenceNumber",
      "existingPolicyNumber",
      "contractId",
      "policyId",
      "pojistnaSmlouvaCislo",
      "contractNumberOrPolicyNumber",
    ]);
  } else if (!isModelationDoc) {
    // For proposals: only copy from explicitly final-contract-type aliases (never from proposalNumber)
    mergeFromAliases(ef, "contractNumber", [
      "policyNumber",
      "policyNo",
      "pojistnaSmlouvaCislo",
    ]);
  }

  mergeFromAliases(ef, "modelationId", ["modelationNumber", "modelationReference"]);

  mergeFromAliases(ef, "policyStartDate", [
    "effectiveDate",
    "policyEffectiveDate",
    "coverageStartDate",
    "insuranceStartDate",
    "commencementDate",
    "startOfInsurance",
    "insuranceCommencementDate",
    "policyCommencementDate",
    "contractStartDate",
    "datumPocatkuPojisteni",
  ]);

  mergeFromAliases(ef, "policyEndDate", [
    "insuranceEndDate",
    "coverageEndDate",
    "policyTerminationDate",
    "endOfInsurance",
  ]);

  mergeFromAliases(ef, "investmentStrategy", [
    "investmentStrategies",
    "strategyDescription",
    "fundStrategy",
    "allocationSummary",
    "fundAllocationSummary",
    "investmentApproach",
    "assetsOrFunds",
    "strategy",
    "investmentProfileName",
    "portfolioStrategy",
  ]);

  mergeFromAliases(ef, "totalMonthlyPremium", [
    "monthlyPremium",
    "premiumMonthly",
    "celkoveMesicniPojistne",
    "totalPremium",
    "regularPremium",
    "combinedPremium",
  ]);

  mergeFromAliases(ef, "premiumAmount", ["totalMonthlyPremium", "monthlyPremium", "riskPremium"]);

  mergeFromAliases(ef, "paymentFrequency", [
    "premiumFrequency",
    "premiumPaymentFrequency",
    "billingFrequency",
    "frequency",
  ]);

  mergeFromAliases(ef, "variableSymbol", ["vs", "varSymbol", "variable_symbol"]);

  mergeFromAliases(ef, "bankAccount", [
    "recipientAccount",
    "paymentAccount",
    "payoutAccount",
    "payout_account",
    "domesticAccount",
    "cisloUctu",
    "accountNumberFormatted",
    "insurerAccount",
  ]);

  mergeFromAliases(ef, "iban", ["ibanMasked"]);

  mergeFromAliases(ef, "secondInsuredName", [
    "secondInsured",
    "additionalInsuredName",
    "insuredPerson2",
    "druhyPojisteny",
    "druhaPojistena",
  ]);

  mergeFromAliases(ef, "intermediaryName", [
    "advisorName",
    "brokerName",
    "zprostredkovatel",
    "intermediary",
    "agentName",
    "makler",
  ]);

  mergeFromAliases(ef, "intermediaryCompany", [
    "brokerCompany",
    "intermediaryFirm",
    "zprostredkovatelFirma",
    "agentCompany",
  ]);

  mergeFromAliases(ef, "intermediaryCode", [
    "brokerCode",
    "agentCode",
    "zprostredkovatelKod",
    "kodZprostredkovatele",
  ]);

  mergeFromAliases(ef, "accountForRepayment", [
    "repaymentAccount",
    "cisloUctuProSplaceni",
    "splatkovyUcet",
  ]);

  mergeFromAliases(ef, "documentStatus", ["status", "contractStatus", "documentState", "agreementStatus"]);

  mergeFromAliases(ef, "insuredObject", [
    "subjectOfInsurance",
    "insuredItem",
    "insuredProperty",
    "vehicleInfo",
    "predmetPojisteni",
    "pojistenaVec",
    "pojistenaPredmet",
    "insuredSubject",
    "coverageObject",
    "pojistenyPredmet",
  ]);

  deriveInvestmentStrategyFromNested(ef);
  mergeCompositeReferenceFields(ef);
  pullFromFinancialTerms(envelope);
  applyPrimaryTypeSpecificAliases(primary, ef);
  salvageCanonicalFieldsFromTextishCells(ef, {
    skipContractNumberSalvage: isModelationDoc,
  });
  normalizeExtractedFieldDates(ef);
  normalizeExtractedFieldFrequencies(ef);
  // Evidence tagging and source priority enforcement:
  // - Tags each field with evidenceTier + sourceKind
  // - Prevents client fields from containing institution names
  // - Prevents intermediary from containing institution signatories
  // - Resolves fullName / firstName / lastName deduplication
  applyFieldSourcePriorityAndEvidence(envelope);
}
