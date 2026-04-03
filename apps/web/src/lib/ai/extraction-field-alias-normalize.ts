/**
 * Maps alternate LLM keys / nested blobs onto canonical extractedFields
 * expected by schema verification, legacy validation, and CRM draft projection.
 */

import type { DocumentReviewEnvelope, ExtractedField, PrimaryDocumentType } from "./document-review-types";
import { normalizeExtractedFieldDates } from "./canonical-date-normalize";

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

function deriveInvestmentStrategyFromNested(ef: Record<string, ExtractedField>): void {
  if (valuePresent(ef.investmentStrategy)) return;
  const nestedKeys = [
    "investmentDetails",
    "investmentProfile",
    "fundDetails",
    "portfolioAllocation",
    "proposedFunds",
  ];
  for (const nk of nestedKeys) {
    const cell = ef[nk];
    if (!cell || cell.value == null) continue;
    const raw = cell.value;
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
      /\b(Generali Česká pojišťovna(?:\s+a\.s\.)?|Generali|Kooperativa|UNIQA|Allianz|NN Životní pojišťovna|ČSOB Pojišťovna|ČPP|Simplea)\b/i
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
        "insurer",
        "loanProvider",
        "financialInstitution",
      ]);
      mergeFromAliases(ef, "loanAmount", [
        "principal",
        "creditAmount",
        "totalLoanAmount",
        "borrowedAmount",
        "loanPrincipal",
      ]);
      mergeFromAliases(ef, "installmentAmount", [
        "monthlyInstallment",
        "monthlyPayment",
        "installment",
        "regularPayment",
        "annuityPayment",
      ]);
      mergeFromAliases(ef, "accountForRepayment", ["bankAccount", "relatedBankAccount", "repaymentAccount"]);
      break;
    case "mortgage_document":
      mergeFromAliases(ef, "lender", ["bankName", "creditor", "institutionName", "insurer", "mortgageBank"]);
      mergeFromAliases(ef, "documentStatus", ["documentType", "documentKind", "agreementType", "contractStatus"]);
      mergeFromAliases(ef, "loanAmount", ["principal", "mortgageAmount", "creditAmount"]);
      break;
    case "pension_contract":
      mergeFromAliases(ef, "provider", [
        "institutionName",
        "insurer",
        "pensionProvider",
        "fundManager",
        "administrator",
        "employerName",
      ]);
      mergeFromAliases(ef, "participantFullName", [
        "fullName",
        "clientFullName",
        "accountHolderName",
        "memberName",
      ]);
      mergeFromAliases(ef, "startDate", [
        "policyStartDate",
        "effectiveDate",
        "contractStartDate",
        "participationStartDate",
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
      ]);
      break;
    case "payment_instruction":
    case "investment_payment_instruction":
      mergeFromAliases(ef, "provider", ["institutionName", "insurer", "payerBank", "recipientName"]);
      mergeFromAliases(ef, "contractReference", ["contractNumber", "policyNumber", "referenceNumber"]);
      break;
    default:
      break;
  }
}

/**
 * Mutates `envelope.extractedFields` in place (and reads `financialTerms`).
 * Call early in finalize paths, before verification and legacy validation.
 */
export function applyExtractedFieldAliasNormalizations(envelope: DocumentReviewEnvelope): void {
  const ef = envelope.extractedFields;
  if (!ef || typeof ef !== "object") return;

  const primary = envelope.documentClassification.primaryType;

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

  if (!isModelationDoc) {
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
    "domesticAccount",
    "cisloUctu",
    "accountNumberFormatted",
    "insurerAccount",
  ]);

  mergeFromAliases(ef, "iban", ["ibanMasked"]);

  mergeFromAliases(ef, "documentStatus", ["status", "contractStatus", "documentState", "agreementStatus"]);

  mergeFromAliases(ef, "insuredObject", ["subjectOfInsurance", "insuredItem", "insuredProperty", "vehicleInfo"]);

  deriveInvestmentStrategyFromNested(ef);
  mergeCompositeReferenceFields(ef);
  pullFromFinancialTerms(envelope);
  applyPrimaryTypeSpecificAliases(primary, ef);
  salvageCanonicalFieldsFromTextishCells(ef, {
    skipContractNumberSalvage: isModelationDoc,
  });
  normalizeExtractedFieldDates(ef);
}
