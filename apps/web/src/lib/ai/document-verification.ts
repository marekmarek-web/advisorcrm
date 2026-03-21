import type {
  DataCompleteness,
  DocumentReviewEnvelope,
  ExtractedField,
  ReviewWarning,
} from "./document-review-types";
import type { DocumentSchemaDefinition } from "./document-schema-registry";

function getField(
  fields: Record<string, ExtractedField>,
  key: string
): ExtractedField | undefined {
  return fields[key] ?? fields[key.replace(/^extractedFields\./, "")];
}

function isSatisfied(field: ExtractedField | undefined): boolean {
  if (!field) return false;
  if (field.status === "not_applicable") return true;
  if (field.status === "explicitly_not_selected") return true;
  if (field.status === "extracted" || field.status === "inferred_low_confidence") {
    return field.value !== null && field.value !== undefined && String(field.value).trim() !== "";
  }
  return false;
}

function hasLowEvidence(field: ExtractedField | undefined): boolean {
  if (!field) return true;
  return typeof field.confidence !== "number" || field.confidence < 0.55 || !field.evidenceSnippet;
}

export type VerificationResult = {
  envelope: DocumentReviewEnvelope;
  warnings: ReviewWarning[];
  reasonsForReview: string[];
  completeness: DataCompleteness;
};

export function runVerificationPass(
  envelope: DocumentReviewEnvelope,
  schemaDefinition: DocumentSchemaDefinition
): VerificationResult {
  const warnings: ReviewWarning[] = [...envelope.reviewWarnings];
  const reasons = new Set<string>();
  const fields = envelope.extractedFields;

  let requiredSatisfied = 0;
  for (const key of schemaDefinition.extractionRules.required) {
    const field = getField(fields, key);
    if (isSatisfied(field)) {
      requiredSatisfied += 1;
      if (hasLowEvidence(field)) {
        warnings.push({
          code: "LOW_EVIDENCE_REQUIRED",
          message: `Pole ${key} má slabou evidenci.`,
          field: key,
          severity: "warning",
        });
        reasons.add("low_evidence_required");
      }
    } else {
      warnings.push({
        code: "MISSING_REQUIRED_FIELD",
        message: `Chybí povinné pole ${key}.`,
        field: key,
        severity: "critical",
      });
      reasons.add("missing_required_data");
      if (!field) {
        fields[key.replace(/^extractedFields\./, "")] = {
          value: undefined,
          status: "missing",
          confidence: 0,
        };
      }
    }
  }

  let optionalExtracted = 0;
  for (const key of schemaDefinition.extractionRules.optional) {
    if (isSatisfied(getField(fields, key))) optionalExtracted += 1;
  }

  let notApplicableCount = 0;
  for (const field of Object.values(fields)) {
    if (field.status === "not_applicable") notApplicableCount += 1;
  }

  // Lifecycle sanity checks
  const primaryType = envelope.documentClassification.primaryType;
  const lifecycle = envelope.documentClassification.lifecycleStatus;
  const intent = envelope.documentClassification.documentIntent;
  const isOfferish = lifecycle === "offer" || lifecycle === "proposal" || lifecycle === "comparison" || lifecycle === "modelation";
  if (primaryType === "life_insurance_final_contract" && isOfferish) {
    warnings.push({
      code: "LIFECYCLE_CONFLICT",
      message: "Final contract dokument má lifecycle, který odpovídá nabídce/projekci.",
      severity: "critical",
    });
    reasons.add("proposal_not_final_contract");
  }
  if (
    (primaryType === "life_insurance_modelation" || primaryType === "life_insurance_proposal") &&
    lifecycle === "final_contract"
  ) {
    warnings.push({
      code: "LIFECYCLE_CONFLICT",
      message: "Modelace/návrh nesmí být označen jako final_contract bez explicitního důkazu.",
      severity: "critical",
    });
    reasons.add("proposal_not_final_contract");
  }

  const noProductCreationTypes = new Set([
    "payslip_document",
    "income_proof_document",
    "corporate_tax_return",
    "self_employed_tax_or_income_document",
    "income_confirmation",
    "bank_statement",
  ]);
  if (noProductCreationTypes.has(primaryType) && intent === "creates_new_product") {
    warnings.push({
      code: "INTENT_CONFLICT_NO_PRODUCT_CREATION",
      message: "Tento typ dokumentu nemá vytvářet nový produkt. Vyžaduje manuální kontrolu intentu.",
      severity: "critical",
    });
    reasons.add("intent_conflict");
  }

  if (
    (primaryType === "life_insurance_change_request" || primaryType === "insurance_policy_change_or_service_doc") &&
    envelope.candidateMatches.matchedContracts.length === 0
  ) {
    warnings.push({
      code: "CHANGE_REQUEST_MISSING_EXISTING_CONTRACT",
      message: "Změnová žádost nemá spolehlivý match na existující smlouvu.",
      severity: "critical",
    });
    reasons.add("missing_existing_contract_match");
  }

  if (envelope.documentMeta.scannedVsDigital === "scanned" && (envelope.documentMeta.overallConfidence ?? 0.6) > 0.9) {
    warnings.push({
      code: "SCAN_CONFIDENCE_SUSPICIOUS",
      message: "Naskenovaný dokument má podezřele vysokou jistotu.",
      severity: "warning",
    });
    reasons.add("low_ocr_quality");
  }

  const completenessScore =
    schemaDefinition.extractionRules.required.length === 0
      ? 1
      : requiredSatisfied / schemaDefinition.extractionRules.required.length;

  const completeness: DataCompleteness = {
    requiredTotal: schemaDefinition.extractionRules.required.length,
    requiredSatisfied,
    optionalExtracted,
    notApplicableCount,
    score: Math.max(0, Math.min(1, completenessScore)),
  };

  envelope.reviewWarnings = warnings;
  envelope.dataCompleteness = completeness;
  return {
    envelope,
    warnings,
    reasonsForReview: [...reasons],
    completeness,
  };
}

