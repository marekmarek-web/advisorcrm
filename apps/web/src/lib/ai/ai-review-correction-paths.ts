const EXTRACTED_FIELD_PATH_ALIASES: Record<string, string> = {
  policyHolderFullName: "policyHolder.fullName",
  policyholderFullName: "policyHolder.fullName",
  policyHolderName: "policyHolder.fullName",
  policyholderName: "policyHolder.fullName",
  clientName: "policyHolder.fullName",
  fullName: "policyHolder.fullName",
  totalMonthlyPremium: "premium.totalMonthlyPremium",
  monthlyPremium: "premium.totalMonthlyPremium",
  premiumAmount: "premium.totalMonthlyPremium",
  regularAmount: "premium.totalMonthlyPremium",
  regularPremium: "premium.totalMonthlyPremium",
  paymentFrequency: "premium.frequency",
  premiumFrequency: "premium.frequency",
  frequency: "premium.frequency",
  insuredPersons: "participants",
};

export function resolveAiReviewCorrectionFieldPath(fieldId: string): string | null {
  if (!fieldId || fieldId.startsWith("synthetic.")) return null;
  if (fieldId.startsWith("extractedFields.")) {
    const key = fieldId.slice("extractedFields.".length);
    return EXTRACTED_FIELD_PATH_ALIASES[key] ?? `extractedFields.${key}`;
  }
  if (fieldId.startsWith("documentClassification.")) return fieldId;
  if (fieldId === "publishHints.contractPublishable") return "publishIntent.shouldPublishToCrm";
  if (fieldId.startsWith("publishHints.")) return fieldId.replace(/^publishHints\./, "publishIntent.");
  if (/^participants\.\d+\./.test(fieldId)) {
    return fieldId.replace(/^participants\.(\d+)\./, "participants[$1].");
  }
  if (/^insuredPersons\.\d+\./.test(fieldId)) {
    return fieldId.replace(/^insuredPersons\.(\d+)\./, "participants[$1].");
  }
  if (/^premium\.perInsured\.\d+\./.test(fieldId)) {
    return fieldId.replace(/^premium\.perInsured\.(\d+)\./, "premium.perInsured[$1].");
  }
  return fieldId.startsWith("root.") ? fieldId.slice("root.".length) : fieldId;
}
