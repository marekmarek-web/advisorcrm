import type { ExtractedContractSchema } from "./extraction-schemas";
import type { DraftActionBase, DraftActionType } from "./review-queue";
import type { DocumentReviewEnvelope } from "./document-review-types";
import { resolveDocumentSchema } from "./document-schema-router";
import {
  computeDraftPremiums,
  computeDraftPremiumsFromEnvelope,
  pickFirstAmount,
} from "./contract-draft-premiums";

export { findClientCandidates } from "./client-matching";
export type { ClientMatchingContext } from "./client-matching";

/** Maps document primary type to CRM contract segment code. */
export function resolveSegmentFromType(primaryType: string): string {
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
  };
  return map[primaryType] ?? "ZP";
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
  const segment = resolveSegmentFromType(primary || "life_insurance_contract");
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
  return {
    type: "create_task",
    label: "Úkol ze smlouvy",
    payload: {
      title: `Smlouva: ${extracted.productName ?? extracted.documentType ?? "Dokument"}`,
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

function toLegacyProjection(envelope: DocumentReviewEnvelope): ExtractedContractSchema {
  const fullName = String(fieldValue(envelope, "fullName") ?? fieldValue(envelope, "clientFullName") ?? "");
  const names = fullName.split(" ");
  return {
    documentType: envelope.documentClassification.primaryType,
    contractNumber: String(fieldValue(envelope, "contractNumber") ?? ""),
    institutionName: String(fieldValue(envelope, "insurer") ?? fieldValue(envelope, "lender") ?? fieldValue(envelope, "bankName") ?? ""),
    productName: String(fieldValue(envelope, "productName") ?? ""),
    client: {
      fullName,
      firstName: String(fieldValue(envelope, "firstName") ?? names[0] ?? ""),
      lastName: String(fieldValue(envelope, "lastName") ?? names.slice(1).join(" ") ?? ""),
      birthDate: String(fieldValue(envelope, "birthDate") ?? ""),
      personalId: String(fieldValue(envelope, "maskedPersonalId") ?? ""),
      companyId: String(fieldValue(envelope, "companyId") ?? ""),
      email: String(fieldValue(envelope, "email") ?? ""),
      phone: String(fieldValue(envelope, "phone") ?? ""),
      address: String(fieldValue(envelope, "address") ?? ""),
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
      accountNumber: String(fieldValue(envelope, "accountNumberMasked") ?? fieldValue(envelope, "accountNumber") ?? ""),
      bankCode: String(fieldValue(envelope, "bankCode") ?? ""),
      variableSymbol: String(fieldValue(envelope, "variableSymbol") ?? ""),
      firstPaymentDate: String(fieldValue(envelope, "firstInstallmentDate") ?? ""),
    },
    effectiveDate: String(fieldValue(envelope, "policyStartDate") ?? fieldValue(envelope, "disbursementDate") ?? ""),
    expirationDate: String(fieldValue(envelope, "policyEndDate") ?? fieldValue(envelope, "lastInstallmentDate") ?? ""),
    notes: envelope.reviewWarnings.map((w) => w.message),
    missingFields: [],
    confidence: envelope.documentMeta.overallConfidence ?? envelope.documentClassification.confidence,
    needsHumanReview: envelope.reviewWarnings.some((w) => w.severity === "critical"),
  };
}

function buildPaymentSetupDraft(envelope: DocumentReviewEnvelope): DraftActionBase {
  const fv = (key: string) => String(fieldValue(envelope, key) ?? "");
  return {
    type: "create_payment_setup",
    label: "Vytvořit platební údaje do portálu",
    payload: {
      obligationName: fv("productName") || fv("platform") || "Platba",
      paymentType: fv("paymentType") || "regular",
      provider: fv("provider") || fv("platform") || fv("insurer") || "",
      productName: fv("productName"),
      beneficiaryName: fv("beneficiaryName"),
      payerName: fv("fullName") || fv("clientFullName"),
      contractReference: fv("contractReference") || fv("contractNumber") || "",
      recipientAccount: fv("bankAccount") || "",
      iban: fv("iban") || "",
      bankCode: fv("bankCode") || "",
      variableSymbol: fv("variableSymbol") || "",
      specificSymbol: fv("specificSymbol") || "",
      constantSymbol: fv("constantSymbol") || "",
      regularAmount: fv("regularAmount") || "",
      oneOffAmount: fv("oneOffAmount") || "",
      currency: fv("currency") || "CZK",
      frequency: fv("paymentFrequency") || "",
      firstDueDate: fv("firstPaymentDate") || "",
      clientNote: fv("paymentPurpose") || "",
      separateInstructionsCZK: fv("separateInstructionsCZK") || "",
      separateInstructionsEUR: fv("separateInstructionsEUR") || "",
      separateInstructionsUSD: fv("separateInstructionsUSD") || "",
    } satisfies Record<string, unknown>,
  };
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
    const segment = resolveSegmentFromType(pt);
    const premiums = computeDraftPremiumsFromEnvelope(maybeEnvelope, segment);
    const inst = String(
      fieldValue(maybeEnvelope, "insurer") ??
        fieldValue(maybeEnvelope, "lender") ??
        fieldValue(maybeEnvelope, "bankName") ??
        ""
    ).trim();
    const eff = String(
      fieldValue(maybeEnvelope, "policyStartDate") ??
        fieldValue(maybeEnvelope, "disbursementDate") ??
        fieldValue(maybeEnvelope, "effectiveDate") ??
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
        reason: maybeEnvelope.reviewWarnings.map((w) => w.code).join(", "),
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

  return dedupeActions(actions);
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
