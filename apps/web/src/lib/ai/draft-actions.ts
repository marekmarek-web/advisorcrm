import type { ExtractedContractSchema } from "./extraction-schemas";
import type { DraftActionBase, DraftActionType } from "./review-queue";
import type { DocumentReviewEnvelope } from "./document-review-types";
import { resolveDocumentSchema } from "./document-schema-router";
import {
  computeDraftPremiums,
  computeDraftPremiumsFromEnvelope,
  pickFirstAmount,
} from "./contract-draft-premiums";
import { buildCanonicalPaymentPayload, buildCanonicalPaymentPayloadFromRaw } from "./payment-field-contract";

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toText(value: unknown): string {
  return hasText(value) ? value.trim() : "";
}

function splitFullName(fullName: string): { firstName?: string; lastName?: string } {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  if (!cleaned) return {};
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts.slice(1).join(" "),
    lastName: parts[0],
  };
}

function normalizeSegmentHintText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferNonLifeSegment(hints?: { subtype?: string | null; productName?: string | null; insurer?: string | null }): string {
  const blob = [
    normalizeSegmentHintText(hints?.subtype),
    normalizeSegmentHintText(hints?.productName),
    normalizeSegmentHintText(hints?.insurer),
  ]
    .filter(Boolean)
    .join(" ");
  if (!blob) return "MAJ";
  if (
    /\b(povinne ruceni|povko|odpovednost z provozu vozidla|odpovednost vozidla|vozidla)\b/.test(blob)
  ) {
    return "AUTO_PR";
  }
  if (/\b(havarijni|havarijni pojisteni|kasko|casco)\b/.test(blob)) {
    return "AUTO_HAV";
  }
  if (/\b(odpovednost|odpovednostni)\b/.test(blob)) {
    return "ODP";
  }
  if (/\b(podnikat|firma|business|podnikatelske pojisteni)\b/.test(blob)) {
    return "FIRMA_POJ";
  }
  if (/\b(majet|domacnost|domov|nemovitost|property|household|home)\b/.test(blob)) {
    return "MAJ";
  }
  return "MAJ";
}

/** Maps document primary type to CRM contract segment code. */
export function resolveSegmentFromType(
  primaryType: string,
  hints?: { subtype?: string | null; productName?: string | null; insurer?: string | null }
): string {
  const map: Record<string, string> = {
    life_insurance_final_contract: "ZP",
    life_insurance_contract: "ZP",
    life_insurance_investment_contract: "ZP",
    life_insurance_proposal: "ZP",
    life_insurance_change_request: "ZP",
    life_insurance_modelation: "ZP",
    nonlife_insurance_contract: "MAJ",
    liability_insurance_offer: "ODP",
    consumer_loan_contract: "UVER",
    consumer_loan_with_payment_protection: "UVER",
    mortgage_document: "HYPO",
    pension_contract: "DPS",
    investment_service_agreement: "INV",
    investment_subscription_document: "INV",
    investment_modelation: "INV",
    motor_insurance_contract: "AUTO_PR",
    vehicle_insurance_contract: "AUTO_HAV",
    travel_insurance_contract: "CEST",
    travel_insurance: "CEST",
    business_insurance_contract: "FIRMA_POJ",
  };
  if (primaryType === "nonlife_insurance_contract") {
    return inferNonLifeSegment(hints);
  }
  return map[primaryType] ?? inferNonLifeSegment(hints);
}

/** Structured payment setup object for the client portal. */
export type PaymentSetupPayload = {
  obligationName: string;
  paymentType: string;
  provider: string;
  contractReference: string;
  recipientAccount: string;
  iban: string;
  variableSymbol: string;
  specificSymbol: string;
  amount: string;
  currency: string;
  frequency: string;
  firstDueDate: string;
  clientNote: string;
};

export function buildCreateClientDraft(extracted: ExtractedContractSchema): DraftActionBase {
  const c = extracted.client;
  return {
    type: "create_client",
    label: "Vytvořit klienta",
    payload: {
      firstName: c?.firstName ?? "",
      lastName: c?.lastName ?? "",
      fullName: c?.fullName,
      email: c?.email,
      phone: c?.phone,
      birthDate: c?.birthDate,
      personalId: c?.personalId,
      companyId: c?.companyId,
      address: c?.address,
    },
  };
}

export function buildCreateContractDraft(extracted: ExtractedContractSchema): DraftActionBase {
  const primary = String(extracted.documentType ?? "");
  const segment = resolveSegmentFromType(primary || "life_insurance_contract", {
    subtype: primary,
    productName: extracted.productName ?? null,
    insurer: extracted.institutionName ?? null,
  });
  const { premiumAmount, premiumAnnual } = computeDraftPremiums(segment, extracted);
  return {
    type: "create_contract",
    label: "Vytvořit smlouvu v CRM",
    payload: {
      contractNumber: extracted.contractNumber,
      institutionName: extracted.institutionName,
      productName: extracted.productName,
      effectiveDate: extracted.effectiveDate,
      expirationDate: extracted.expirationDate,
      documentType: extracted.documentType,
      segment,
      premiumAmount,
      premiumAnnual,
    },
  };
}

export function buildCreatePaymentDraft(extracted: ExtractedContractSchema): DraftActionBase {
  const p = extracted.paymentDetails;
  return {
    type: "create_payment",
    label: "Návrh platby",
    payload: {
      amount: p?.amount,
      currency: p?.currency,
      frequency: p?.frequency,
      iban: p?.iban,
      accountNumber: p?.accountNumber,
      bankCode: p?.bankCode,
      variableSymbol: p?.variableSymbol,
      firstPaymentDate: p?.firstPaymentDate,
    },
  };
}

export function buildCreateTaskDraft(extracted: ExtractedContractSchema): DraftActionBase {
  const contractRef = extracted.contractNumber
    ? `č. ${extracted.contractNumber}`
    : null;
  const productPart = extracted.productName ?? extracted.documentType ?? "Dokument";
  const institutionPart = extracted.institutionName ? ` (${extracted.institutionName})` : "";
  const refPart = contractRef ? ` — ${contractRef}` : "";
  const title = `Dokončit zpracování smlouvy: ${productPart}${institutionPart}${refPart}`;
  return {
    type: "create_task",
    label: "Vytvořit úkol: dokončit zpracování smlouvy",
    payload: {
      title,
      notes: extracted.notes?.join("\n"),
      contractNumber: extracted.contractNumber,
    },
  };
}

export function buildDraftEmailSuggestion(extracted: ExtractedContractSchema): DraftActionBase {
  const c = extracted.client;
  return {
    type: "draft_email",
    label: "Návrh e-mailu",
    payload: {
      to: c?.email,
      subject: extracted.contractNumber
        ? `Smlouva ${extracted.contractNumber}`
        : "Smlouva – doplnění údajů",
      bodyPlaceholder: extracted.notes?.join("\n"),
    },
  };
}

/**
 * Build all draft actions for an extracted contract. No DB write.
 */
export function buildLegacyDraftActions(extracted: ExtractedContractSchema): DraftActionBase[] {
  const actions: DraftActionBase[] = [
    buildCreateClientDraft(extracted),
    buildCreateContractDraft(extracted),
    buildCreatePaymentDraft(extracted),
    buildCreateTaskDraft(extracted),
    buildDraftEmailSuggestion(extracted),
  ];
  return actions;
}

function fieldValue(envelope: DocumentReviewEnvelope, key: string): unknown {
  const direct = envelope.extractedFields[key];
  if (direct) return direct.value;
  const stripped = key.replace(/^extractedFields\./, "");
  return envelope.extractedFields[stripped]?.value;
}

function extractPrimaryClientFromEnvelope(envelope: DocumentReviewEnvelope): NonNullable<ExtractedContractSchema["client"]> {
  const fields = envelope.extractedFields ?? {};
  const parties = envelope.parties ?? {};
  const partyList = Array.isArray(parties)
    ? parties.filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    : Object.values(parties).filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null);

  const policyholderParty =
    partyList.find((party) => String(party.role ?? "").toLowerCase().includes("policyholder")) ??
    partyList.find((party) => String(party.role ?? "").toLowerCase().includes("insured")) ??
    null;

  const fullName =
    toText(policyholderParty?.fullName) ||
    toText(policyholderParty?.name) ||
    toText(fields.fullName?.value) ||
    toText(fields.clientFullName?.value) ||
    toText(fields.policyholderName?.value) ||
    toText(fields.proposerName?.value);

  const splitName = splitFullName(fullName);

  return {
    fullName: fullName || undefined,
    firstName:
      toText(policyholderParty?.firstName) ||
      toText(fields.firstName?.value) ||
      splitName.firstName,
    lastName:
      toText(policyholderParty?.lastName) ||
      toText(fields.lastName?.value) ||
      splitName.lastName,
    birthDate:
      toText(policyholderParty?.birthDate) ||
      toText(fields.birthDate?.value),
    personalId:
      toText(policyholderParty?.personalId) ||
      toText(fields.maskedPersonalId?.value) ||
      toText(fields.personalId?.value),
    companyId:
      toText(policyholderParty?.companyId) ||
      toText(fields.companyId?.value),
    email:
      toText(policyholderParty?.email) ||
      toText(fields.email?.value),
    phone:
      toText(policyholderParty?.phone) ||
      toText(fields.phone?.value),
    address:
      toText(policyholderParty?.address) ||
      toText(fields.address?.value) ||
      toText(fields.permanentAddress?.value),
  };
}

function toLegacyProjection(envelope: DocumentReviewEnvelope): ExtractedContractSchema {
  const primaryClient = extractPrimaryClientFromEnvelope(envelope);
  const lifecycle = envelope.documentClassification.lifecycleStatus;
  const isNonFinal =
    lifecycle === "proposal" || lifecycle === "modelation" || lifecycle === "illustration" || lifecycle === "offer";
  const contractNum = String(fieldValue(envelope, "contractNumber") ?? "");
  const resolvedContractNumber = isNonFinal && !contractNum ? "" : contractNum;
  return {
    documentType: envelope.documentClassification.primaryType,
    contractNumber: resolvedContractNumber,
    institutionName: String(
      fieldValue(envelope, "insurer") ??
        fieldValue(envelope, "institutionName") ??
        fieldValue(envelope, "lender") ??
        fieldValue(envelope, "bankName") ??
        ""
    ),
    productName: String(fieldValue(envelope, "productName") ?? ""),
    client: {
      fullName: primaryClient.fullName ?? "",
      firstName: primaryClient.firstName ?? "",
      lastName: primaryClient.lastName ?? "",
      birthDate: primaryClient.birthDate ?? "",
      personalId: primaryClient.personalId ?? "",
      companyId: primaryClient.companyId ?? "",
      email: primaryClient.email ?? "",
      phone: primaryClient.phone ?? "",
      address: primaryClient.address ?? "",
    },
    paymentDetails: {
      amount:
        pickFirstAmount(
          fieldValue(envelope, "totalMonthlyPremium"),
          fieldValue(envelope, "premiumAmount"),
          fieldValue(envelope, "regularAmount"),
          fieldValue(envelope, "premium"),
          fieldValue(envelope, "monthlyPremium"),
          fieldValue(envelope, "annualPremium"),
          fieldValue(envelope, "loanAmount"),
          fieldValue(envelope, "installmentAmount"),
          fieldValue(envelope, "amount")
        ) ?? undefined,
      currency: String(fieldValue(envelope, "currency") ?? ""),
      frequency: String(fieldValue(envelope, "paymentFrequency") ?? ""),
      iban: String(fieldValue(envelope, "ibanMasked") ?? fieldValue(envelope, "iban") ?? ""),
      accountNumber: String(
        fieldValue(envelope, "bankAccount") ??
          fieldValue(envelope, "accountNumberMasked") ??
          fieldValue(envelope, "accountNumber") ??
          ""
      ),
      bankCode: String(fieldValue(envelope, "bankCode") ?? ""),
      variableSymbol: String(fieldValue(envelope, "variableSymbol") ?? ""),
      firstPaymentDate: String(fieldValue(envelope, "firstInstallmentDate") ?? ""),
    },
    effectiveDate: String(
      fieldValue(envelope, "policyStartDate") ??
        fieldValue(envelope, "effectiveDate") ??
        fieldValue(envelope, "disbursementDate") ??
        fieldValue(envelope, "startDate") ??
        ""
    ),
    expirationDate: String(fieldValue(envelope, "policyEndDate") ?? fieldValue(envelope, "lastInstallmentDate") ?? ""),
    notes: (envelope.reviewWarnings ?? []).map((w) => w.message),
    missingFields: [],
    confidence: envelope.documentMeta?.overallConfidence ?? envelope.documentClassification?.confidence ?? 0,
    needsHumanReview: (envelope.reviewWarnings ?? []).some((w) => w.severity === "critical"),
  };
}

/**
 * Build the payment setup draft from the canonical payment contract.
 * Accepts either a live envelope or an already-built canonical payload
 * (used by Phase 3B when regenerating drafts from corrected payloads).
 */
export function buildPaymentSetupDraft(
  envelopeOrPayload: DocumentReviewEnvelope | null,
  canonicalOverride?: Record<string, string>,
): DraftActionBase {
  const cp = canonicalOverride ?? (envelopeOrPayload ? buildCanonicalPaymentPayload(envelopeOrPayload) : {});
  const fv = (key: string) => String(fieldValue(envelopeOrPayload!, key) ?? "");
  return {
    type: "create_payment_setup",
    label: "Vytvořit platební údaje do portálu",
    payload: {
      obligationName: cp.productName || cp.provider || "Platba",
      paymentType: cp.paymentFrequency ? "regular" : "other",
      provider: cp.provider || "",
      productName: cp.productName || "",
      beneficiaryName: cp.beneficiaryName || "",
      payerName: envelopeOrPayload ? (fv("fullName") || fv("clientFullName")) : "",
      contractReference: cp.contractReference || "",
      recipientAccount: cp.accountNumber || "",
      iban: cp.iban || "",
      bankCode: cp.bankCode || "",
      variableSymbol: cp.variableSymbol || "",
      specificSymbol: cp.specificSymbol || "",
      constantSymbol: cp.constantSymbol || "",
      regularAmount: cp.amount || "",
      oneOffAmount: "",
      currency: cp.currency || "CZK",
      frequency: cp.paymentFrequency || "",
      firstDueDate: cp.firstPaymentDate || "",
      clientNote: cp.clientNote || "",
    } satisfies Record<string, unknown>,
  };
}

/**
 * Phase 3B/3F — rebuild payment draft action from stored/corrected extracted payload JSON.
 * Returns null when there is no extractable payment slice.
 */
export function tryBuildPaymentSetupDraftFromRawPayload(
  payload: Record<string, unknown>
): DraftActionBase | null {
  const canonical = buildCanonicalPaymentPayloadFromRaw(payload);
  if (!canonical) return null;
  const hasAnyPayment = canonical.amount || canonical.iban || canonical.accountNumber;
  if (!hasAnyPayment) return null;
  return buildPaymentSetupDraft(null, canonical);
}

function buildNotificationDraft(envelope: DocumentReviewEnvelope): DraftActionBase {
  const primaryType = envelope.documentClassification.primaryType;
  const lifecycle = envelope.documentClassification.lifecycleStatus;
  let message = "Nový dokument byl zpracován.";
  if (lifecycle === "final_contract") {
    message = `Nová smlouva byla rozpoznána: ${String(fieldValue(envelope, "productName") || primaryType)}.`;
  } else if (lifecycle === "proposal" || lifecycle === "offer") {
    message = `Rozpoznán návrh/nabídka: ${String(fieldValue(envelope, "productName") || primaryType)}.`;
  } else if (primaryType === "payment_instruction" || primaryType === "investment_payment_instruction") {
    message = `Rozpoznány platební instrukce od: ${String(fieldValue(envelope, "provider") || fieldValue(envelope, "platform") || "")}.`;
  }
  return {
    type: "create_notification",
    label: "Vytvořit notifikaci",
    payload: { message },
  };
}

function dedupeActions(actions: DraftActionBase[]): DraftActionBase[] {
  const key = (a: DraftActionBase) => `${a.type}:${JSON.stringify(a.payload)}`;
  const seen = new Set<string>();
  return actions.filter((a) => {
    const k = key(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Drop redundant CRM steps when a superset action is already present. */
export function pruneRedundantDraftActions(actions: DraftActionBase[]): DraftActionBase[] {
  const types = new Set(actions.map((a) => a.type));
  let out = actions;
  if (types.has("create_or_update_contract_record")) {
    out = out.filter((a) => a.type !== "create_contract");
  }
  if (types.has("propose_financial_analysis_refresh") && types.has("propose_financial_analysis_update")) {
    out = out.filter((a) => a.type !== "propose_financial_analysis_update");
  }
  return out;
}

export function buildAllDraftActions(
  extracted: ExtractedContractSchema | DocumentReviewEnvelope
): DraftActionBase[] {
  const maybeEnvelope = extracted as DocumentReviewEnvelope;
  if (!maybeEnvelope?.documentClassification || !maybeEnvelope?.extractedFields) {
    return buildLegacyDraftActions(extracted as ExtractedContractSchema);
  }

  const schema = resolveDocumentSchema(maybeEnvelope.documentClassification.primaryType);
  const legacy = toLegacyProjection(maybeEnvelope);
  const actions: DraftActionBase[] = [];
  const requested = schema.extractionRules.suggestedActionRules;
  if (requested.includes("create_or_link_client")) {
    actions.push(buildCreateClientDraft(legacy));
  }
  if (requested.includes("create_or_update_contract_record")) {
    const pt = maybeEnvelope.documentClassification.primaryType;
    const segment = resolveSegmentFromType(pt, {
      subtype: maybeEnvelope.documentClassification.subtype ?? null,
      productName: String(fieldValue(maybeEnvelope, "productName") ?? ""),
      insurer: String(
        fieldValue(maybeEnvelope, "insurer") ??
          fieldValue(maybeEnvelope, "institutionName") ??
          fieldValue(maybeEnvelope, "lender") ??
          ""
      ),
    });
    const premiums = computeDraftPremiumsFromEnvelope(maybeEnvelope, segment);
    const inst = String(
      fieldValue(maybeEnvelope, "insurer") ??
        fieldValue(maybeEnvelope, "institutionName") ??
        fieldValue(maybeEnvelope, "lender") ??
        fieldValue(maybeEnvelope, "bankName") ??
        ""
    ).trim();
    const eff = String(
      fieldValue(maybeEnvelope, "policyStartDate") ??
        fieldValue(maybeEnvelope, "effectiveDate") ??
        fieldValue(maybeEnvelope, "disbursementDate") ??
        fieldValue(maybeEnvelope, "startDate") ??
        ""
    ).trim();
    actions.push({
      type: "create_or_update_contract_record",
      label: "Vytvořit nebo aktualizovat smlouvu",
      payload: {
        contractNumber: fieldValue(maybeEnvelope, "contractNumber") ?? fieldValue(maybeEnvelope, "existingPolicyNumber"),
        productName: fieldValue(maybeEnvelope, "productName"),
        lifecycleStatus: maybeEnvelope.documentClassification.lifecycleStatus,
        segment,
        institutionName: inst || null,
        effectiveDate: eff || null,
        documentType: pt,
        premiumAmount: premiums.premiumAmount,
        premiumAnnual: premiums.premiumAnnual,
      },
    });
  }
  if (requested.includes("create_payment_setup")) {
    actions.push(buildPaymentSetupDraft(maybeEnvelope));
  }
  if (requested.includes("link_client")) {
    actions.push({
      type: "link_client",
      label: "Spárovat klienta",
      payload: {},
    });
  }
  if (requested.includes("link_household")) {
    actions.push({
      type: "link_household",
      label: "Spárovat household",
      payload: {},
    });
  }
  if (requested.includes("create_contract_record")) {
    actions.push(buildCreateContractDraft(legacy));
  }
  if (requested.includes("create_task") || requested.includes("create_task_followup") || requested.includes("create_task_onboarding")) {
    actions.push(buildCreateTaskDraft(legacy));
  }
  if (requested.includes("create_opportunity")) {
    actions.push({
      type: "create_opportunity",
      label: "Vytvořit obchodní příležitost",
      payload: {
        title: `${maybeEnvelope.documentClassification.primaryType} – navazující akce`,
        lifecycleStatus: maybeEnvelope.documentClassification.lifecycleStatus,
      },
    });
  }
  if (requested.includes("create_income_verification_record")) {
    actions.push({
      type: "create_income_verification_record",
      label: "Vytvořit záznam ověření příjmu",
      payload: {
        employerName: fieldValue(maybeEnvelope, "employerName"),
        avgIncome3m: fieldValue(maybeEnvelope, "averageNetIncomeLast3Months"),
        avgIncome12m: fieldValue(maybeEnvelope, "averageNetIncomeLast12Months"),
      },
    });
  }
  if (requested.includes("attach_to_existing_client")) {
    actions.push({
      type: "attach_to_existing_client",
      label: "Připojit k existujícímu klientovi",
      payload: {},
    });
  }
  if (requested.includes("propose_financial_analysis_update")) {
    actions.push({
      type: "propose_financial_analysis_update",
      label: "Navrhnout update finanční analýzy",
      payload: {
        sourceType: maybeEnvelope.documentClassification.primaryType,
      },
    });
  }
  if (requested.includes("request_manual_review")) {
    actions.push({
      type: "request_manual_review",
      label: "Požádat o manuální review",
      payload: {
        reason: (maybeEnvelope.reviewWarnings ?? []).map((w) => w.code).join(", "),
      },
    });
  }
  if (requested.includes("create_service_review_task")) {
    actions.push({
      type: "create_service_review_task",
      label: "Vytvořit servisní review úkol",
      payload: { reason: "final_contract_followup" },
    });
  }
  if (requested.includes("propose_financial_analysis_refresh")) {
    actions.push({
      type: "propose_financial_analysis_refresh",
      label: "Navrhnout refresh finanční analýzy",
      payload: { sourceType: maybeEnvelope.documentClassification.primaryType },
    });
  }
  if (requested.includes("attach_to_existing_contract")) {
    actions.push({
      type: "attach_to_existing_contract",
      label: "Připojit k existující smlouvě",
      payload: {
        existingPolicyNumber: fieldValue(maybeEnvelope, "existingPolicyNumber"),
      },
    });
  }
  if (requested.includes("create_service_task")) {
    actions.push({
      type: "create_service_task",
      label: "Vytvořit servisní úkol",
      payload: {},
    });
  }
  if (requested.includes("request_contract_mapping")) {
    actions.push({
      type: "request_contract_mapping",
      label: "Vyžádat manuální mapování smlouvy",
      payload: {},
    });
  }
  if (requested.includes("attach_to_client_documents")) {
    actions.push({
      type: "attach_to_client_documents",
      label: "Připojit do klientských dokumentů",
      payload: {},
    });
  }
  if (requested.includes("schedule_consultation")) {
    actions.push({
      type: "schedule_consultation",
      label: "Naplánovat konzultaci",
      payload: {},
    });
  }
  if (requested.includes("prepare_comparison")) {
    actions.push({
      type: "prepare_comparison",
      label: "Připravit srovnání variant",
      payload: {},
    });
  }
  if (requested.includes("attach_to_client_or_company")) {
    actions.push({
      type: "attach_to_client_or_company",
      label: "Připojit ke klientovi nebo firmě",
      payload: {},
    });
  }
  if (requested.includes("attach_to_existing_financing_deal")) {
    actions.push({
      type: "attach_to_existing_financing_deal",
      label: "Připojit k existujícímu financování",
      payload: {},
    });
  }
  if (requested.includes("update_income_profile")) {
    actions.push({
      type: "update_income_profile",
      label: "Aktualizovat příjmový profil",
      payload: {
        netIncome: fieldValue(maybeEnvelope, "netWage") ?? fieldValue(maybeEnvelope, "averageNetIncomeLast3Months"),
      },
    });
  }
  if (requested.includes("mark_as_supporting_document")) {
    actions.push({
      type: "mark_as_supporting_document",
      label: "Označit jako podpůrný dokument",
      payload: {},
    });
  }
  if (requested.includes("create_or_link_company_entity")) {
    actions.push({
      type: "create_or_link_company_entity",
      label: "Vytvořit nebo propojit firmu",
      payload: {
        companyName: fieldValue(maybeEnvelope, "companyName"),
        ico: fieldValue(maybeEnvelope, "ico") ?? fieldValue(maybeEnvelope, "companyId"),
      },
    });
  }
  if (requested.includes("attach_to_business_client")) {
    actions.push({
      type: "attach_to_business_client",
      label: "Připojit k business klientovi",
      payload: {},
    });
  }
  if (requested.includes("attach_to_loan_or_financing_deal")) {
    actions.push({
      type: "attach_to_loan_or_financing_deal",
      label: "Připojit k úvěrovému obchodu",
      payload: {},
    });
  }
  if (requested.includes("create_manual_review_task")) {
    actions.push({
      type: "create_manual_review_task",
      label: "Vytvořit úkol manuální kontroly",
      payload: {},
    });
  }
  // Keep email helper for user convenience.
  actions.push(buildDraftEmailSuggestion(legacy));
  actions.push(buildNotificationDraft(maybeEnvelope));

  // For payment types: also add payment setup if content flags indicate payment data
  const hasPaymentFlag = maybeEnvelope.contentFlags?.containsPaymentInstructions;
  const isPaymentType = maybeEnvelope.documentClassification.primaryType === "payment_instruction" ||
    maybeEnvelope.documentClassification.primaryType === "investment_payment_instruction";
  if (hasPaymentFlag && !isPaymentType && !requested.includes("create_payment_setup")) {
    actions.push(buildPaymentSetupDraft(maybeEnvelope));
  }

  if (maybeEnvelope.documentClassification.lifecycleStatus === "final_contract") {
    actions.push({
      type: "create_or_update_business_plan_item",
      label: "Navrhnout položku business plánu (kontrola)",
      payload: {
        productName: fieldValue(maybeEnvelope, "productName"),
        documentType: maybeEnvelope.documentClassification.primaryType,
      },
    });
    actions.push({
      type: "create_or_update_pipeline_deal",
      label: "Navrhnout obchod v pipeline (kontrola)",
      payload: {
        title: fieldValue(maybeEnvelope, "productName") || "Obchod ze smlouvy",
        lifecycleStatus: maybeEnvelope.documentClassification.lifecycleStatus,
      },
    });
  }

  return dedupeActions(pruneRedundantDraftActions(actions));
}

/** Canonical Aidvisor draft type names + optional removal of portal payment drafts when blocked. */
export function applyAidvisorDraftCanonicalTypes(
  actions: DraftActionBase[],
  opts?: { blockPortalPayment?: boolean }
): DraftActionBase[] {
  const block = opts?.blockPortalPayment === true;
  const mapped = actions.map((a) => {
    let t: DraftActionType = a.type;
    if (t === "create_or_update_contract_record") t = "create_or_update_contract_production";
    if (t === "create_client") t = "create_new_client";
    if (t === "link_client") t = "link_existing_client";
    if (t === "create_payment_setup") t = "create_payment_setup_for_portal";
    if (t === "draft_email") t = "create_followup_email_draft";
    if (t === a.type) return a;
    return { ...a, type: t };
  });
  if (!block) return mapped;
  return mapped.filter(
    (a) =>
      a.type !== "create_payment_setup" &&
      a.type !== "create_payment" &&
      a.type !== "create_payment_setup_for_portal"
  );
}
