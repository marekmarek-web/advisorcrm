import type { DocumentReviewEnvelope } from "./document-review-types";

function fieldExtracted(f: { value?: unknown; status?: string } | undefined): boolean {
  return Boolean(f && f.status === "extracted" && f.value != null && String(f.value).trim() !== "");
}

function partyLooksLikePersonOrClient(v: unknown): boolean {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const keys = ["fullName", "name", "firstName", "lastName", "email", "birthDate", "personalId", "role"];
  return keys.some((k) => o[k] != null && String(o[k]).trim() !== "");
}

function partyLooksLikeAdvisor(v: unknown): boolean {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const r = String(o.role ?? o.type ?? "").toLowerCase();
  if (r.includes("advisor") || r.includes("broker") || r.includes("intermediary") || r.includes("zprostředkov")) {
    return true;
  }
  return (
    o.advisorName != null ||
    o.brokerName != null ||
    o.intermediaryName != null ||
    o.companyName != null
  );
}

/**
 * Strengthens contentFlags and optional documentMeta from extracted fields, parties, and financialTerms
 * so validation/UI do not miss payments or client data that sit outside the legacy flat keys.
 */
export function deriveEnvelopeFlags(data: DocumentReviewEnvelope): void {
  const ef = data.extractedFields ?? {};
  if (!data.contentFlags) {
    data.contentFlags = {
      isFinalContract: false,
      isProposalOnly: false,
      containsPaymentInstructions: false,
      containsClientData: false,
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    };
  }
  const flags = data.contentFlags;

  const paymentKeys = [
    "bankAccount",
    "iban",
    "accountNumber",
    "variableSymbol",
    "specificSymbol",
    "regularAmount",
    "oneOffAmount",
    "totalMonthlyPremium",
    "premiumAmount",
    "installmentAmount",
    "paymentFrequency",
    "premiumFrequency",
  ];
  if (paymentKeys.some((k) => fieldExtracted(ef[k as keyof typeof ef]))) {
    flags.containsPaymentInstructions = true;
  }

  const ft = data.financialTerms ?? {};
  const ftPaymentHints = ["iban", "accountNumber", "variableSymbol", "premium", "amount", "payment"];
  for (const [k, v] of Object.entries(ft)) {
    const lk = k.toLowerCase();
    if (ftPaymentHints.some((h) => lk.includes(h)) && v != null && String(v).trim() !== "") {
      flags.containsPaymentInstructions = true;
      break;
    }
  }

  const clientKeys = [
    "fullName",
    "clientFullName",
    "firstName",
    "lastName",
    "birthDate",
    "maskedPersonalId",
    "personalId",
    "email",
    "phone",
    "clientEmail",
    "clientPhone",
    "permanentAddress",
    "address",
  ];
  if (clientKeys.some((k) => fieldExtracted(ef[k as keyof typeof ef]))) {
    flags.containsClientData = true;
  }

  const parties = data.parties ?? {};
  let partyClient = false;
  let partyAdvisor = false;
  for (const v of Object.values(parties)) {
    if (partyLooksLikePersonOrClient(v)) partyClient = true;
    if (partyLooksLikeAdvisor(v)) partyAdvisor = true;
  }
  if (partyClient) flags.containsClientData = true;
  if (partyAdvisor) flags.containsAdvisorData = true;

  const advisorKeys = ["advisorName", "brokerName", "intermediaryName"];
  if (advisorKeys.some((k) => fieldExtracted(ef[k as keyof typeof ef]))) {
    flags.containsAdvisorData = true;
  }

  const sectionCount = [
    Object.keys(ef).length > 0,
    Object.keys(parties).length > 0,
    (data.productsOrObligations?.length ?? 0) > 0,
    Object.keys(data.financialTerms ?? {}).length > 0,
    Object.keys(data.serviceTerms ?? {}).length > 0,
    (data.evidence?.length ?? 0) > 0,
  ].filter(Boolean).length;
  if (sectionCount >= 3) {
    flags.containsMultipleDocumentSections = true;
  }

  if (
    data.documentMeta &&
    typeof data.documentMeta.overallConfidence !== "number" &&
    typeof data.dataCompleteness?.score === "number"
  ) {
    data.documentMeta.overallConfidence = data.dataCompleteness.score;
  }
}
