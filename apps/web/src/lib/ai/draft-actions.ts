import type { ExtractedContractSchema } from "./extraction-schemas";
import type { DraftActionBase } from "./review-queue";

export { findClientCandidates } from "./client-matching";
export type { ClientMatchingContext } from "./client-matching";

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
export function buildAllDraftActions(extracted: ExtractedContractSchema): DraftActionBase[] {
  const actions: DraftActionBase[] = [
    buildCreateClientDraft(extracted),
    buildCreateContractDraft(extracted),
    buildCreatePaymentDraft(extracted),
    buildCreateTaskDraft(extracted),
    buildDraftEmailSuggestion(extracted),
  ];
  return actions;
}
