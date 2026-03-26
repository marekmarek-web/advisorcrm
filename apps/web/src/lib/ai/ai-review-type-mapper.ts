import type { ClassificationResult } from "./document-classification";
import type { AiClassifierOutput } from "./ai-review-classifier";
import type { DocumentIntent, DocumentLifecycleStatus, PrimaryDocumentType } from "./document-review-types";

function n(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function lifecycleFromDocType(dt: string): DocumentLifecycleStatus {
  const d = n(dt);
  if (d === "contract") return "final_contract";
  if (d === "proposal" || d === "offer") return "proposal";
  if (d === "modelation") return "modelation";
  if (d === "amendment") return "policy_change_request";
  if (d === "statement") return "statement";
  if (d === "payment_instructions") return "confirmation";
  return "unknown";
}

function intentFromClassifier(c: AiClassifierOutput): DocumentIntent {
  if (n(c.recommendedRoute) === "manual_review" || n(c.businessIntent) === "manual_review_only") {
    return "manual_review_required";
  }
  const dt = n(c.documentType);
  if (dt === "proposal" || dt === "modelation") return "illustrative_only";
  if (dt === "amendment") return "modifies_existing_product";
  if (dt === "contract") return "creates_new_product";
  return "reference_only";
}

export function mapAiClassifierToPrimaryType(c: AiClassifierOutput): PrimaryDocumentType {
  const dt = n(c.documentType);
  const fam = n(c.productFamily);
  const sub = n(c.productSubtype);

  if (dt === "payment_instructions") return "payment_instruction";
  if (fam === "life_insurance" && dt === "contract") return "life_insurance_contract";
  if (fam === "non_life_insurance" && dt === "contract") return "nonlife_insurance_contract";
  if (fam === "investment" && dt === "contract") return "investment_service_agreement";
  if (fam === "pp" || fam === "dps") {
    if (dt === "contract" || dt === "amendment") return "pension_contract";
  }
  if (fam === "dip" && (dt === "contract" || dt === "amendment")) return "generic_financial_document";
  if (fam === "building_savings" && (dt === "contract" || dt === "amendment")) return "generic_financial_document";
  if (fam === "loan" && dt === "contract") return "consumer_loan_contract";
  if (fam === "mortgage" && dt === "contract") return "mortgage_document";
  if (dt === "statement" || dt === "supporting_document") return "bank_statement";
  if (fam === "legacy_financial_product") return "generic_financial_document";
  if (dt === "termination_document") return "generic_financial_document";
  if (dt === "consent_or_identification_document") return "consent_or_declaration";
  if (dt === "confirmation_document") return "income_confirmation";
  if (sub.includes("car") && dt === "contract") return "nonlife_insurance_contract";
  return "generic_financial_document";
}

export function mapAiClassifierToClassificationResult(c: AiClassifierOutput): ClassificationResult {
  const primaryType = mapAiClassifierToPrimaryType(c);
  return {
    primaryType,
    subtype: c.productSubtype || "unknown",
    lifecycleStatus: lifecycleFromDocType(c.documentType),
    documentIntent: intentFromClassifier(c),
    confidence: c.confidence,
    reasons: [...(c.reasons ?? []), ...c.warnings],
  };
}
