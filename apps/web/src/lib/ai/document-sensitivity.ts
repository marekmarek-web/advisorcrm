import type {
  DocumentReviewEnvelope,
  SectionSensitivityLabel,
  SensitivityProfile,
} from "./document-review-types";

const HEALTH_MARKERS = [
  "health",
  "medical",
  "smoking",
  "underwriting",
  "dotaznik",
];

const SPECIAL_PERSONAL_MARKERS = [
  "personalid",
  "rodnecislo",
  "rc",
  "opnumber",
  "iban",
  "accountnumber",
];

const SECTION_PATTERNS: Array<{ section: SectionSensitivityLabel; patterns: string[] }> = [
  { section: "health_section", patterns: ["health", "medical", "smoking", "questionnaire"] },
  { section: "income_section", patterns: ["income", "wage", "salary", "tax", "deduction"] },
  { section: "payment_section", patterns: ["iban", "account", "payment", "installment"] },
  { section: "investment_section", patterns: ["invest", "fund", "portfolio"] },
  { section: "personal_identity_section", patterns: ["personalid", "rodne", "birth", "opnumber"] },
  { section: "contract_core_section", patterns: ["contract", "policy", "coverage", "premium"] },
  { section: "intermediary_section", patterns: ["intermediary", "broker", "advisor"] },
];

function detectSectionSensitivity(envelope: DocumentReviewEnvelope): Record<string, SensitivityProfile> {
  const sectionSensitivity: Record<string, SensitivityProfile> = {};
  const lowerKeys = Object.keys(envelope.extractedFields).map((k) => k.toLowerCase());
  for (const item of SECTION_PATTERNS) {
    const matched = item.patterns.some((p) => lowerKeys.some((k) => k.includes(p)));
    if (!matched) continue;
    if (item.section === "health_section") {
      sectionSensitivity[item.section] = "health_data";
    } else if (item.section === "personal_identity_section") {
      sectionSensitivity[item.section] = "identity_document_data";
    } else if (item.section === "income_section" || item.section === "payment_section") {
      sectionSensitivity[item.section] = "financial_data_high";
    } else {
      sectionSensitivity[item.section] = "financial_data";
    }
  }
  return sectionSensitivity;
}

export function resolveSensitivityProfile(
  envelope: DocumentReviewEnvelope
): SensitivityProfile {
  envelope.sectionSensitivity = detectSectionSensitivity(envelope);
  const allKeys = Object.keys(envelope.extractedFields).map((k) => k.toLowerCase());
  const allText = [
    ...allKeys,
    ...Object.values(envelope.extractedFields).map((f) => (f.evidenceSnippet ?? "").toLowerCase()),
  ].join(" ");

  if (envelope.documentMeta.scannedVsDigital === "scanned" && (envelope.documentMeta.overallConfidence ?? 1) < 0.65) {
    return "high_sensitivity_scan";
  }
  if (Object.values(envelope.sectionSensitivity).includes("health_data") &&
      Object.values(envelope.sectionSensitivity).some((v) => v === "financial_data_high" || v === "financial_data")) {
    return "mixed_sensitive_document";
  }
  if (HEALTH_MARKERS.some((m) => allText.includes(m))) return "health_data";
  if (SPECIAL_PERSONAL_MARKERS.some((m) => allText.includes(m))) return "identity_document_data";
  if (envelope.documentClassification.primaryType === "bank_statement") return "financial_data_high";
  if (
    envelope.documentClassification.primaryType === "payslip_document" ||
    envelope.documentClassification.primaryType === "income_proof_document" ||
    envelope.documentClassification.primaryType === "corporate_tax_return" ||
    envelope.documentClassification.primaryType === "self_employed_tax_or_income_document"
  ) {
    return "financial_data_high";
  }
  return "standard_personal_data";
}

function maskValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const value = raw.trim();
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function maskSensitiveEnvelopeForUi(
  envelope: DocumentReviewEnvelope
): DocumentReviewEnvelope {
  const clone: DocumentReviewEnvelope = JSON.parse(JSON.stringify(envelope));
  if (!clone.extractedFields || typeof clone.extractedFields !== "object") {
    return clone;
  }
  const sensitiveKeys = [
    "personalId",
    "maskedPersonalId",
    "iban",
    "accountNumber",
    "opNumber",
    "health",
    "medical",
    "income",
    "salary",
    "wage",
    "tax",
  ];
  for (const [key, field] of Object.entries(clone.extractedFields)) {
    const isSensitive = field.sensitive || sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()));
    if (isSensitive) {
      field.value = maskValue(field.value);
      if (field.evidenceSnippet) field.evidenceSnippet = String(maskValue(field.evidenceSnippet));
      field.sensitive = true;
    }
  }
  clone.sectionSensitivity = clone.sectionSensitivity ?? {};
  if (!Object.keys(clone.sectionSensitivity).length) {
    clone.sectionSensitivity = detectSectionSensitivity(clone);
  }
  return clone;
}

