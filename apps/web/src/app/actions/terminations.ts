"use server";

import { requireAuth, requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import type { RoleName } from "@/shared/rolePermissions";
import { db } from "db";
import {
  contracts,
  contacts,
  insurerTerminationRegistry,
  terminationReasonCatalog,
  terminationRequests,
  terminationRequestEvents,
  terminationRequiredAttachments,
} from "db";
import { and, eq } from "db";
import { evaluateTerminationRules, getReasonsForSegment } from "@/lib/terminations";
import type {
  TerminationManualInput,
  TerminationRulesInput,
  TerminationRulesResult,
} from "@/lib/terminations";
import type {
  TerminationMode,
  TerminationReasonCode,
  TerminationRequestSource,
  TerminationRequestStatus,
} from "db";
import {
  buildTerminationLetterResult,
  type ContactRowLike,
  type ContractRowLike,
  type InsurerRegistryRowLike,
} from "@/lib/terminations/termination-letter-builder";
import type { TerminationLetterBuildResult } from "@/lib/terminations/termination-letter-types";
import {
  parseDocumentBuilderExtras,
  serializeDocumentBuilderExtras,
  type TerminationDocumentBuilderExtras,
} from "@/lib/terminations/termination-document-extras";

export type TerminationWizardPrefill = {
  mode: "crm" | "contact_only" | "standalone";
  contactId: string | null;
  contactLabel: string | null;
  contractId: string | null;
  insurerName: string;
  contractNumber: string | null;
  productSegment: string | null;
  contractStartDate: string | null;
  contractAnniversaryDate: string | null;
};

function canWriteContacts(roleName: RoleName): boolean {
  return hasPermission(roleName, "contacts:write");
}

/**
 * Načte předvyplnění pro wizard (CRM smlouva / jen klient / prázdný intak).
 */
export async function getTerminationWizardPrefill(
  contactId: string | null,
  contractId: string | null
): Promise<TerminationWizardPrefill> {
  const auth = await requireAuth();
  if (auth.roleName === "Client") {
    throw new Error("Forbidden");
  }
  if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  if (contractId) {
    const [c] = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.id, contractId), eq(contracts.tenantId, auth.tenantId)))
      .limit(1);
    if (!c) {
      return {
        mode: "standalone",
        contactId: null,
        contactLabel: null,
        contractId: null,
        insurerName: "",
        contractNumber: null,
        productSegment: null,
        contractStartDate: null,
        contractAnniversaryDate: null,
      };
    }
    const [person] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(and(eq(contacts.id, c.contactId), eq(contacts.tenantId, auth.tenantId)))
      .limit(1);
    return {
      mode: "crm",
      contactId: c.contactId,
      contactLabel: person ? `${person.firstName} ${person.lastName}` : null,
      contractId: c.id,
      insurerName: c.partnerName ?? c.productName ?? "",
      contractNumber: c.contractNumber ?? null,
      productSegment: c.segment ?? null,
      contractStartDate: c.startDate ?? null,
      contractAnniversaryDate: c.anniversaryDate ?? null,
    };
  }

  if (contactId) {
    const [person] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, auth.tenantId)))
      .limit(1);
    if (!person) {
      return {
        mode: "standalone",
        contactId: null,
        contactLabel: null,
        contractId: null,
        insurerName: "",
        contractNumber: null,
        productSegment: null,
        contractStartDate: null,
        contractAnniversaryDate: null,
      };
    }
    return {
      mode: "contact_only",
      contactId,
      contactLabel: `${person.firstName} ${person.lastName}`,
      contractId: null,
      insurerName: "",
      contractNumber: null,
      productSegment: null,
      contractStartDate: null,
      contractAnniversaryDate: null,
    };
  }

  return {
    mode: "standalone",
    contactId: null,
    contactLabel: null,
    contractId: null,
    insurerName: "",
    contractNumber: null,
    productSegment: null,
    contractStartDate: null,
    contractAnniversaryDate: null,
  };
}

export type TerminationReasonOption = {
  id: string;
  reasonCode: string;
  labelCs: string;
  defaultDateComputation: string;
};

export async function listTerminationReasonsAction(
  segment: string | null
): Promise<TerminationReasonOption[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") throw new Error("Forbidden");
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await getReasonsForSegment(auth.tenantId, segment);
  return rows.map((r) => ({
    id: r.id,
    reasonCode: r.reasonCode,
    labelCs: r.labelCs,
    defaultDateComputation: r.defaultDateComputation,
  }));
}

function mapOutcomeToStatus(r: TerminationRulesResult): TerminationRequestStatus {
  switch (r.outcome) {
    case "ready":
      return "ready_to_generate";
    case "awaiting_data":
      return "awaiting_data";
    case "review_required":
      return "awaiting_review";
    case "hard_fail":
      return "failed";
    default:
      return "draft";
  }
}

export type CreateTerminationDraftPayload = {
  sourceKind: TerminationRequestSource;
  contactId: string | null;
  contractId: string | null;
  sourceDocumentId: string | null;
  sourceConversationId: string | null;
  insurerName: string;
  contractNumber: string | null;
  productSegment: string | null;
  contractStartDate: string | null;
  contractAnniversaryDate: string | null;
  requestedEffectiveDate: string | null;
  terminationMode: TerminationMode;
  terminationReasonCode: TerminationReasonCode;
  /** Fáze 5: uživatel označí nejistou identifikaci pojišťovny → vždy review. */
  uncertainInsurer: boolean;
  /** Volitelná pole šablony dopisu (firma, průvodní texty, …). */
  documentBuilderExtras?: TerminationDocumentBuilderExtras | null;
};

export type CreateTerminationDraftResult = {
  ok: true;
  requestId: string;
  rules: TerminationRulesResult;
} | { ok: false; error: string };

/**
 * Vytvoří záznam `termination_requests`, vyhodnotí pravidla a uloží výsledek + řádky příloh.
 */
export async function createTerminationDraft(
  payload: CreateTerminationDraftPayload
): Promise<CreateTerminationDraftResult> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    return { ok: false, error: "Nepovoleno." };
  }
  if (!canWriteContacts(auth.roleName)) {
    return { ok: false, error: "Nemáte oprávnění vytvářet žádosti o výpověď." };
  }

  const insurerName = payload.insurerName?.trim();
  if (!insurerName) {
    return { ok: false, error: "Vyplňte název pojišťovny." };
  }

  if (payload.contractId && payload.contactId) {
    const [c] = await db
      .select({ contactId: contracts.contactId })
      .from(contracts)
      .where(and(eq(contracts.id, payload.contractId), eq(contracts.tenantId, auth.tenantId)))
      .limit(1);
    if (!c || c.contactId !== payload.contactId) {
      return { ok: false, error: "Smlouva nepatří k vybranému kontaktu." };
    }
  }

  if (payload.contactId) {
    const [p] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, payload.contactId), eq(contacts.tenantId, auth.tenantId)))
      .limit(1);
    if (!p) {
      return { ok: false, error: "Kontakt neexistuje." };
    }
  }

  let rulesInput: TerminationRulesInput;
  if (payload.contractId && payload.contactId) {
    rulesInput = {
      source: "crm_contract",
      contractId: payload.contractId,
      contactId: payload.contactId,
      advisorId: auth.userId,
      contractNumber: payload.contractNumber ?? "",
      productSegment: payload.productSegment ?? "",
      insurerName,
      contractStartDate: payload.contractStartDate,
      contractAnniversaryDate: payload.contractAnniversaryDate,
      requestedEffectiveDate: payload.requestedEffectiveDate,
      terminationMode: payload.terminationMode,
      terminationReasonCode: payload.terminationReasonCode,
      sourceDocumentId: payload.sourceDocumentId,
      sourceConversationId: payload.sourceConversationId,
    };
  } else {
    const manualSource: TerminationManualInput["source"] =
      payload.sourceKind === "quick_action"
        ? "quick_action"
        : payload.sourceKind === "ai_chat"
          ? "ai_chat"
          : "manual_intake";
    rulesInput = {
      source: manualSource,
      contactId: payload.contactId,
      advisorId: auth.userId,
      contractNumber: payload.contractNumber,
      productSegment: payload.productSegment,
      insurerName,
      contractStartDate: payload.contractStartDate,
      contractAnniversaryDate: payload.contractAnniversaryDate,
      requestedEffectiveDate: payload.requestedEffectiveDate,
      terminationMode: payload.terminationMode,
      terminationReasonCode: payload.terminationReasonCode,
      sourceDocumentId: payload.sourceDocumentId,
      sourceConversationId: payload.sourceConversationId,
    };
  }

  let rules = await evaluateTerminationRules(auth.tenantId, rulesInput);

  if (payload.uncertainInsurer) {
    rules = {
      ...rules,
      outcome: rules.outcome === "hard_fail" ? rules.outcome : "review_required",
      reviewRequiredReason:
        "Nejistá identifikace pojišťovny – vyžaduje ruční ověření." +
        (rules.reviewRequiredReason ? ` ${rules.reviewRequiredReason}` : ""),
    };
  }

  const status = mapOutcomeToStatus(rules);

  let mailing: unknown = null;
  if (rules.insurerRegistryId) {
    const [ir] = await db
      .select({ mailingAddress: insurerTerminationRegistry.mailingAddress })
      .from(insurerTerminationRegistry)
      .where(eq(insurerTerminationRegistry.id, rules.insurerRegistryId))
      .limit(1);
    mailing = ir?.mailingAddress ?? null;
  }

  try {
    const requestId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(terminationRequests)
        .values({
          tenantId: auth.tenantId,
          contactId: payload.contactId,
          contractId: payload.contractId,
          sourceDocumentId: payload.sourceDocumentId,
          sourceConversationId: payload.sourceConversationId,
          advisorId: auth.userId,
          insurerName,
          insurerRegistryId: rules.insurerRegistryId,
          contractNumber: payload.contractNumber,
          productSegment: payload.productSegment,
          terminationMode: payload.terminationMode,
          terminationReasonCode: payload.terminationReasonCode,
          reasonCatalogId: rules.reasonCatalogId,
          requestedEffectiveDate: payload.requestedEffectiveDate ?? undefined,
          computedEffectiveDate: rules.computedEffectiveDate ?? undefined,
          contractStartDate: payload.contractStartDate ?? undefined,
          contractAnniversaryDate: payload.contractAnniversaryDate ?? undefined,
          freeformLetterAllowed: rules.freeformLetterAllowed,
          requiresInsurerForm: rules.requiresOfficialForm,
          requiredAttachments: {
            snapshot: rules.requiredAttachments,
            missingFields: rules.missingFields,
            outcome: rules.outcome,
          },
          deliveryChannel: rules.defaultDeliveryChannel,
          deliveryAddressSnapshot: mailing && typeof mailing === "object" ? (mailing as Record<string, unknown>) : undefined,
          status,
          reviewRequiredReason: rules.reviewRequiredReason,
          confidence:
            rules.confidence != null ? String(Math.min(1, Math.max(0, rules.confidence))) : null,
          sourceKind: payload.sourceKind,
          documentBuilderExtras: serializeDocumentBuilderExtras(payload.documentBuilderExtras ?? {}),
          createdBy: auth.userId,
          updatedBy: auth.userId,
        })
        .returning({ id: terminationRequests.id });

      const id = row?.id;
      if (!id) throw new Error("Insert failed");

      await tx.insert(terminationRequestEvents).values({
        tenantId: auth.tenantId,
        requestId: id,
        eventType: "rules_result",
        payload: {
          outcome: rules.outcome,
          computedEffectiveDate: rules.computedEffectiveDate,
          reviewRequiredReason: rules.reviewRequiredReason,
          missingFields: rules.missingFields,
          debug: rules._debug,
        },
        actorUserId: auth.userId,
      });

      let sort = 0;
      for (const a of rules.requiredAttachments) {
        await tx.insert(terminationRequiredAttachments).values({
          tenantId: auth.tenantId,
          requestId: id,
          requirementCode: a.requirementCode,
          label: a.label,
          status: a.required ? "required" : "optional",
          sortOrder: sort++,
        });
      }

      return id;
    });

    return { ok: true, requestId, rules };
  } catch (e) {
    console.error("createTerminationDraft", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Uložení žádosti se nezdařilo.",
    };
  }
}

export type TerminationLetterPreviewResponse =
  | { ok: true; data: TerminationLetterBuildResult }
  | { ok: false; error: string };

/**
 * Fáze 6 – náhled dopisu / formulářového režimu z uložené žádosti.
 */
export async function getTerminationLetterPreview(requestId: string): Promise<TerminationLetterPreviewResponse> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    return { ok: false, error: "Nepovoleno." };
  }
  if (!hasPermission(auth.roleName, "contacts:read")) {
    return { ok: false, error: "Forbidden" };
  }

  const [req] = await db
    .select()
    .from(terminationRequests)
    .where(and(eq(terminationRequests.id, requestId), eq(terminationRequests.tenantId, auth.tenantId)))
    .limit(1);

  if (!req) {
    return { ok: false, error: "Žádost nenalezena." };
  }

  let contact: ContactRowLike | null = null;
  if (req.contactId) {
    const [c] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        title: contacts.title,
        birthDate: contacts.birthDate,
        personalId: contacts.personalId,
        street: contacts.street,
        city: contacts.city,
        zip: contacts.zip,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(contacts)
      .where(and(eq(contacts.id, req.contactId), eq(contacts.tenantId, auth.tenantId)))
      .limit(1);
    contact = c ?? null;
  }

  let contract: ContractRowLike | null = null;
  if (req.contractId) {
    const [ct] = await db
      .select({
        productName: contracts.productName,
        partnerName: contracts.partnerName,
      })
      .from(contracts)
      .where(and(eq(contracts.id, req.contractId), eq(contracts.tenantId, auth.tenantId)))
      .limit(1);
    contract = ct ?? null;
  }

  let insurerRegistry: InsurerRegistryRowLike | null = null;
  if (req.insurerRegistryId) {
    const [ir] = await db
      .select({
        insurerName: insurerTerminationRegistry.insurerName,
        officialFormName: insurerTerminationRegistry.officialFormName,
        officialFormNotes: insurerTerminationRegistry.officialFormNotes,
        mailingAddress: insurerTerminationRegistry.mailingAddress,
      })
      .from(insurerTerminationRegistry)
      .where(eq(insurerTerminationRegistry.id, req.insurerRegistryId))
      .limit(1);
    if (ir) {
      insurerRegistry = {
        insurerName: ir.insurerName,
        officialFormName: ir.officialFormName,
        officialFormNotes: ir.officialFormNotes,
        mailingAddress: (ir.mailingAddress as Record<string, unknown> | null) ?? null,
      };
    }
  }

  let reasonLabel = req.terminationReasonCode;
  if (req.reasonCatalogId) {
    const [rc] = await db
      .select({ labelCs: terminationReasonCatalog.labelCs })
      .from(terminationReasonCatalog)
      .where(eq(terminationReasonCatalog.id, req.reasonCatalogId))
      .limit(1);
    if (rc?.labelCs) reasonLabel = rc.labelCs;
  }

  const attRows = await db
    .select({ label: terminationRequiredAttachments.label })
    .from(terminationRequiredAttachments)
    .where(
      and(
        eq(terminationRequiredAttachments.requestId, requestId),
        eq(terminationRequiredAttachments.tenantId, auth.tenantId)
      )
    );

  const extras = parseDocumentBuilderExtras(req.documentBuilderExtras);

  const data = buildTerminationLetterResult({
    request: {
      insurerName: req.insurerName,
      contractNumber: req.contractNumber,
      productSegment: req.productSegment,
      terminationMode: req.terminationMode,
      terminationReasonCode: req.terminationReasonCode,
      requestedEffectiveDate: req.requestedEffectiveDate,
      computedEffectiveDate: req.computedEffectiveDate,
      contractStartDate: req.contractStartDate,
      contractAnniversaryDate: req.contractAnniversaryDate,
      deliveryChannel: req.deliveryChannel,
      freeformLetterAllowed: req.freeformLetterAllowed,
      requiresInsurerForm: req.requiresInsurerForm,
      reviewRequiredReason: req.reviewRequiredReason,
      status: req.status,
      deliveryAddressSnapshot: (req.deliveryAddressSnapshot as Record<string, unknown> | null) ?? null,
    },
    contact,
    contract,
    insurerRegistry,
    reasonLabel,
    attachmentLabels: attRows.map((a) => a.label),
    documentBuilderExtras: extras,
  });

  return { ok: true, data };
}
