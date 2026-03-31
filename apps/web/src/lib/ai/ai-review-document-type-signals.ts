import type { ClassificationResult, ContractDocumentType } from "./document-classification";
import type { DocumentReviewEnvelope, ExtractedField } from "./document-review-types";

function hasUsableFieldValue(field: ExtractedField | undefined): boolean {
  if (!field) return false;
  if (field.status === "missing" || field.status === "not_applicable" || field.status === "explicitly_not_selected") {
    return false;
  }
  return field.value != null && String(field.value).trim() !== "";
}

export function resolveHybridInvestmentDocumentType(
  documentType: ContractDocumentType,
  envelope: Pick<DocumentReviewEnvelope, "extractedFields">,
  classification: ClassificationResult
): ContractDocumentType {
  if (documentType !== "life_insurance_modelation") return documentType;
  const ef = envelope.extractedFields ?? {};
  const contractSignalCount = [
    ef.insurer,
    ef.productName,
    ef.contractNumber,
    ef.policyStartDate,
  ].filter(hasUsableFieldValue).length;
  const subtype = String(classification.subtype ?? "").toLowerCase();
  const investmentish =
    subtype.includes("investment") ||
    hasUsableFieldValue(ef.investmentStrategy) ||
    hasUsableFieldValue(ef.investmentFunds) ||
    hasUsableFieldValue(ef.fundAllocation);
  const hasModelationId = hasUsableFieldValue(ef.modelationId);
  return investmentish && contractSignalCount >= 3 && !hasModelationId
    ? "life_insurance_investment_contract"
    : documentType;
}
