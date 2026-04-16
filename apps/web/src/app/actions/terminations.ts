"use server";

import { requireAuth, requireAuthInAction, type AuthContext } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import type { RoleName } from "@/shared/rolePermissions";
import { db } from "db";
import {
  contracts,
  contacts,
  documents,
  insurerTerminationRegistry,
  terminationReasonCatalog,
  terminationRequests,
  terminationRequestEvents,
  terminationRequiredAttachments,
  terminationDispatchLog,
  terminationGeneratedDocuments,
  terminationRequestStatuses,
  reminders,
} from "db";
import { and, asc, desc, eq, isNull, or, sql } from "db";
import {
  evaluateTerminationRules,
  formatTerminationRegistryMailingOneLine,
  getReasonsForSegment,
  terminationDeliveryChannelLabel,
} from "@/lib/terminations";
import type {
  TerminationManualInput,
  TerminationRulesInput,
  TerminationRulesResult,
} from "@/lib/terminations";
import type {
  TerminationDeliveryChannel,
  TerminationGeneratedDocumentKind,
  TerminationMode,
  TerminationReasonCode,
  TerminationRequestSource,
  TerminationRequestStatus,
} from "db";
import {
  buildTerminationLetterResult,
  mergeRegistryMailingWithSnapshot,
  type ContactRowLike,
  type ContractRowLike,
  type InsurerRegistryRowLike,
} from "@/lib/terminations/termination-letter-builder";
import type { TerminationLetterBuildResult } from "@/lib/terminations/termination-letter-types";
import { createAdminClient } from "@/lib/supabase/server";
import { createReminder } from "@/lib/execution/reminder-engine";
import {
  parseDocumentBuilderExtras,
  serializeDocumentBuilderExtras,
  TERMINATION_PARTIAL_INSURER_PLACEHOLDER,
  type TerminationDocumentBuilderExtras,
} from "@/lib/terminations/termination-document-extras";
import { escapeIlikeLiteral } from "@/lib/ai/assistant-contact-search-normalize";
import { searchContactsForAssistant } from "@/lib/ai/assistant-contact-search";
import { isTerminationsModuleEnabledOnServer } from "@/lib/terminations/terminations-feature-flag";

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

/** Stavy, ve kterých nelze pokračovat v průvodci (dokončená / odeslaná žádost). */
const TERMINATION_WIZARD_BLOCKED_STATUSES = new Set<TerminationRequestStatus>([
  "completed",
  "cancelled",
  "dispatched",
]);

function isTerminationWizardResumableStatus(status: string): boolean {
  return !TERMINATION_WIZARD_BLOCKED_STATUSES.has(status as TerminationRequestStatus);
}

/** Výběr instituce z registru ve wizardu — doplní mailing pro koncept i náhled před rules. */
async function resolveInsurerRegistryRowForHint(
  hintId: string | null | undefined,
  tenantId: string
): Promise<{ id: string; mailing: Record<string, unknown> | null } | null> {
  const id = hintId?.trim();
  if (!id) return null;
  const [ir] = await db
    .select({
      id: insurerTerminationRegistry.id,
      mailingAddress: insurerTerminationRegistry.mailingAddress,
    })
    .from(insurerTerminationRegistry)
    .where(
      and(
        eq(insurerTerminationRegistry.id, id),
        eq(insurerTerminationRegistry.active, true),
        or(isNull(insurerTerminationRegistry.tenantId), eq(insurerTerminationRegistry.tenantId, tenantId))
      )
    )
    .limit(1);
  if (!ir) return null;
  const m = ir.mailingAddress;
  return {
    id: ir.id,
    mailing: m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : null,
  };
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

function formatTerminationChannelHint(
  allowed: string[] | null | undefined,
  email: string | null | undefined,
): string | null {
  const parts: string[] = [];
  if (allowed?.length) parts.push(allowed.map((ch) => terminationDeliveryChannelLabel(ch)).join(" · "));
  if (email?.trim()) parts.push(`e-mail: ${email.trim()}`);
  return parts.length ? parts.join(" · ") : null;
}

export type TerminationInsurerSearchHit = {
  id: string;
  insurerName: string;
  addressLine: string | null;
  channelHint: string | null;
};

/** Max 4 řádky pro autocomplete výpovědi (globální + tenant registry). */
export async function searchTerminationInsurerRegistryAction(
  rawQuery: string,
): Promise<{ ok: true; items: TerminationInsurerSearchHit[] } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!hasPermission(auth.roleName, "contacts:read")) return { ok: false, error: "Forbidden" };

  const q = rawQuery.trim();
  if (!q) return { ok: true, items: [] };

  const pattern = `%${escapeIlikeLiteral(q)}%`;

  const rows = await db
    .select({
      id: insurerTerminationRegistry.id,
      insurerName: insurerTerminationRegistry.insurerName,
      mailingAddress: insurerTerminationRegistry.mailingAddress,
      allowedChannels: insurerTerminationRegistry.allowedChannels,
      email: insurerTerminationRegistry.email,
    })
    .from(insurerTerminationRegistry)
    .where(
      and(
        eq(insurerTerminationRegistry.active, true),
        or(isNull(insurerTerminationRegistry.tenantId), eq(insurerTerminationRegistry.tenantId, auth.tenantId)),
        sql`(
          ${insurerTerminationRegistry.insurerName} ILIKE ${pattern} ESCAPE '\\'
          OR ${insurerTerminationRegistry.catalogKey} ILIKE ${pattern} ESCAPE '\\'
        )`,
      ),
    )
    .orderBy(asc(insurerTerminationRegistry.insurerName))
    .limit(4);

  return {
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      insurerName: r.insurerName,
      addressLine: formatTerminationRegistryMailingOneLine((r.mailingAddress as Record<string, unknown> | null) ?? null),
      channelHint: formatTerminationChannelHint(
        r.allowedChannels as string[] | null | undefined,
        r.email,
      ),
    })),
  };
}

export type TerminationInsurerRegistryDirectoryRow = {
  id: string;
  catalogKey: string;
  insurerName: string;
  addressLine: string | null;
  email: string | null;
  webFormUrl: string | null;
  clientPortalUrl: string | null;
  allowedChannels: string[] | null;
  officialFormNotes: string | null;
  requiresOfficialForm: boolean;
  freeformLetterAllowed: boolean;
};

/** Kompletní adresář registru (globální + případný tenant override) pro portál. */
export async function listTerminationInsurerRegistryDirectoryAction(): Promise<
  { ok: true; rows: TerminationInsurerRegistryDirectoryRow[] } | { ok: false; error: string }
> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!hasPermission(auth.roleName, "contacts:read")) return { ok: false, error: "Forbidden" };

  const rows = await db
    .select({
      id: insurerTerminationRegistry.id,
      catalogKey: insurerTerminationRegistry.catalogKey,
      insurerName: insurerTerminationRegistry.insurerName,
      mailingAddress: insurerTerminationRegistry.mailingAddress,
      email: insurerTerminationRegistry.email,
      webFormUrl: insurerTerminationRegistry.webFormUrl,
      clientPortalUrl: insurerTerminationRegistry.clientPortalUrl,
      allowedChannels: insurerTerminationRegistry.allowedChannels,
      officialFormNotes: insurerTerminationRegistry.officialFormNotes,
      requiresOfficialForm: insurerTerminationRegistry.requiresOfficialForm,
      freeformLetterAllowed: insurerTerminationRegistry.freeformLetterAllowed,
    })
    .from(insurerTerminationRegistry)
    .where(
      and(
        eq(insurerTerminationRegistry.active, true),
        or(isNull(insurerTerminationRegistry.tenantId), eq(insurerTerminationRegistry.tenantId, auth.tenantId)),
      ),
    )
    .orderBy(asc(insurerTerminationRegistry.insurerName));

  return {
    ok: true,
    rows: rows.map((r) => ({
      id: r.id,
      catalogKey: r.catalogKey,
      insurerName: r.insurerName,
      addressLine: formatTerminationRegistryMailingOneLine((r.mailingAddress as Record<string, unknown> | null) ?? null),
      email: r.email,
      webFormUrl: r.webFormUrl,
      clientPortalUrl: r.clientPortalUrl,
      allowedChannels: (r.allowedChannels as string[] | null) ?? null,
      officialFormNotes: r.officialFormNotes,
      requiresOfficialForm: r.requiresOfficialForm,
      freeformLetterAllowed: r.freeformLetterAllowed,
    })),
  };
}

export type TerminationContactSearchHit = {
  id: string;
  displayName: string;
  hint: string;
};

/** Max 4 kontakty pro autocomplete ve výpovědi. */
export async function searchContactsForTerminationWizardAction(
  rawQuery: string,
): Promise<{ ok: true; items: TerminationContactSearchHit[] } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!hasPermission(auth.roleName, "contacts:read")) return { ok: false, error: "Forbidden" };

  const rows = await searchContactsForAssistant(auth.tenantId, rawQuery, 4, { match: "all" });
  return {
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      hint: r.hint,
    })),
  };
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
  requestedSubmissionDate: string | null;
  terminationMode: TerminationMode;
  terminationReasonCode: TerminationReasonCode;
  /** Fáze 5: uživatel označí nejistou identifikaci pojišťovny → vždy review. */
  uncertainInsurer: boolean;
  /** Volitelná pole šablony dopisu (firma, průvodní texty, …). */
  documentBuilderExtras?: TerminationDocumentBuilderExtras | null;
  /** Dokončení rozepsaného konceptu (`status` = intake) místo nového insertu. */
  resumeRequestId?: string | null;
  /**
   * ID řádku `insurer_termination_registry` vybrané v comboboxu — u konceptu doplní `insurer_registry_id`
   * a `delivery_address_snapshot`, aby náhled dopisu měl adresu pojišťovny už před finálním rules.
   */
  insurerRegistryIdHint?: string | null;
};

export type CreateTerminationDraftResult =
  | { ok: true; requestId: string; rules: TerminationRulesResult; status: TerminationRequestStatus }
  | { ok: false; error: string };

/**
 * Vytvoří záznam `termination_requests`, vyhodnotí pravidla a uloží výsledek + řádky příloh.
 */
export async function createTerminationDraft(
  payload: CreateTerminationDraftPayload
): Promise<CreateTerminationDraftResult> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") {
    return { ok: false, error: "Nepovoleno." };
  }
  if (!canWriteContacts(auth.roleName)) {
    return { ok: false, error: "Nemáte oprávnění vytvářet žádosti o výpověď." };
  }

  const resumeId = payload.resumeRequestId?.trim() || null;
  if (resumeId) {
    const [existingResume] = await db
      .select({ id: terminationRequests.id, status: terminationRequests.status })
      .from(terminationRequests)
      .where(and(eq(terminationRequests.id, resumeId), eq(terminationRequests.tenantId, auth.tenantId)))
      .limit(1);
    if (!existingResume) {
      return { ok: false, error: "Koncept nenalezen." };
    }
    if (!isTerminationWizardResumableStatus(existingResume.status)) {
      return {
        ok: false,
        error: "Tuto žádost z průvodce v tomto stavu uložit nelze.",
      };
    }
  }

  const insurerName = payload.insurerName?.trim();
  if (!insurerName) {
    return { ok: false, error: "Vyplňte název pojišťovny." };
  }
  if (insurerName === TERMINATION_PARTIAL_INSURER_PLACEHOLDER) {
    return {
      ok: false,
      error: "Doplňte skutečný název pojišťovny (koncept používal zástupný text).",
    };
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

  if (payload.sourceDocumentId) {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, payload.sourceDocumentId), eq(documents.tenantId, auth.tenantId)))
      .limit(1);
    if (!doc) {
      return { ok: false, error: "Zdrojový dokument neexistuje nebo nepatří k vašemu účtu." };
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
      requestedSubmissionDate: payload.requestedSubmissionDate ?? null,
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
      requestedSubmissionDate: payload.requestedSubmissionDate ?? null,
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
  const hintRow = await resolveInsurerRegistryRowForHint(payload.insurerRegistryIdHint ?? null, auth.tenantId);
  if (hintRow?.mailing) {
    mailing = mergeRegistryMailingWithSnapshot(
      mailing && typeof mailing === "object" && !Array.isArray(mailing)
        ? (mailing as Record<string, unknown>)
        : null,
      hintRow.mailing
    );
  }
  const insurerRegistryIdResolved = rules.insurerRegistryId ?? hintRow?.id ?? null;

  const rowValues = {
    contactId: payload.contactId,
    contractId: payload.contractId,
    sourceDocumentId: payload.sourceDocumentId,
    sourceConversationId: payload.sourceConversationId,
    advisorId: auth.userId,
    insurerName,
    insurerRegistryId: insurerRegistryIdResolved,
    contractNumber: payload.contractNumber,
    productSegment: payload.productSegment,
    terminationMode: payload.terminationMode,
    terminationReasonCode: payload.terminationReasonCode,
    reasonCatalogId: rules.reasonCatalogId,
    requestedEffectiveDate: payload.requestedEffectiveDate ?? undefined,
    requestedSubmissionDate: payload.requestedSubmissionDate ?? undefined,
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
    deliveryAddressSnapshot:
      mailing && typeof mailing === "object" && !Array.isArray(mailing)
        ? (mailing as Record<string, unknown>)
        : undefined,
    status,
    reviewRequiredReason: rules.reviewRequiredReason,
    confidence: rules.confidence != null ? String(Math.min(1, Math.max(0, rules.confidence))) : null,
    sourceKind: payload.sourceKind,
    documentBuilderExtras: serializeDocumentBuilderExtras({
      ...(payload.documentBuilderExtras ?? {}),
      uncertainInsurer: payload.uncertainInsurer ? true : undefined,
    }),
    updatedBy: auth.userId,
    updatedAt: new Date(),
  };

  try {
    const requestId = await db.transaction(async (tx) => {
      let id: string;

      if (resumeId) {
        id = resumeId;
        await tx
          .delete(terminationRequiredAttachments)
          .where(
            and(
              eq(terminationRequiredAttachments.requestId, id),
              eq(terminationRequiredAttachments.tenantId, auth.tenantId)
            )
          );
        await tx
          .update(terminationRequests)
          .set(rowValues)
          .where(and(eq(terminationRequests.id, id), eq(terminationRequests.tenantId, auth.tenantId)));
      } else {
        const [row] = await tx
          .insert(terminationRequests)
          .values({
            tenantId: auth.tenantId,
            ...rowValues,
            createdBy: auth.userId,
          })
          .returning({ id: terminationRequests.id });
        const newId = row?.id;
        if (!newId) throw new Error("Insert failed");
        id = newId;
      }

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
          resumedFromPartial: Boolean(resumeId),
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

    return { ok: true, requestId, rules, status };
  } catch (e) {
    console.error("createTerminationDraft", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Uložení žádosti se nezdařilo.",
    };
  }
}

export type SaveTerminationPartialResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

/**
 * Rozepsaný koncept bez rules engine — `status` = intake. Lze později dokončit přes `createTerminationDraft` + `resumeRequestId`.
 */
export async function saveTerminationIntakePartialAction(
  payload: CreateTerminationDraftPayload & { partialRequestId?: string | null }
): Promise<SaveTerminationPartialResult> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!canWriteContacts(auth.roleName)) {
    return { ok: false, error: "Nemáte oprávnění." };
  }

  const partialId = payload.partialRequestId?.trim() || null;

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
    if (!p) return { ok: false, error: "Kontakt neexistuje." };
  }

  if (payload.sourceDocumentId) {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, payload.sourceDocumentId), eq(documents.tenantId, auth.tenantId)))
      .limit(1);
    if (!doc) {
      return { ok: false, error: "Zdrojový dokument neexistuje nebo nepatří k vašemu účtu." };
    }
  }

  const insurerName =
    payload.insurerName?.trim() || TERMINATION_PARTIAL_INSURER_PLACEHOLDER;

  const extras = {
    ...(payload.documentBuilderExtras ?? {}),
    uncertainInsurer: payload.uncertainInsurer ? true : undefined,
  };

  let insurerRegistryIdPartial: string | null = null;
  let deliverySnapshotPartial: Record<string, unknown> | null = null;
  const regHint = payload.insurerRegistryIdHint?.trim();
  if (regHint) {
    const resolved = await resolveInsurerRegistryRowForHint(regHint, auth.tenantId);
    if (resolved) {
      insurerRegistryIdPartial = resolved.id;
      deliverySnapshotPartial = resolved.mailing;
    }
  }

  try {
    const requestId = await db.transaction(async (tx) => {
      if (partialId) {
        const [ex] = await tx
          .select({ id: terminationRequests.id, status: terminationRequests.status })
          .from(terminationRequests)
          .where(and(eq(terminationRequests.id, partialId), eq(terminationRequests.tenantId, auth.tenantId)))
          .limit(1);
        if (!ex) throw new Error("Koncept nenalezen.");
        if (ex.status !== "intake") {
          throw new Error("Ukládání rozepsaného stavu je možné jen u konceptu (stav intake).");
        }
        await tx
          .update(terminationRequests)
          .set({
            contactId: payload.contactId,
            contractId: payload.contractId,
            sourceDocumentId: payload.sourceDocumentId,
            sourceConversationId: payload.sourceConversationId,
            insurerName,
            contractNumber: payload.contractNumber,
            productSegment: payload.productSegment,
            terminationMode: payload.terminationMode,
            terminationReasonCode: payload.terminationReasonCode,
            requestedEffectiveDate: payload.requestedEffectiveDate ?? undefined,
            requestedSubmissionDate: payload.requestedSubmissionDate ?? undefined,
            contractStartDate: payload.contractStartDate ?? undefined,
            contractAnniversaryDate: payload.contractAnniversaryDate ?? undefined,
            sourceKind: payload.sourceKind,
            documentBuilderExtras: serializeDocumentBuilderExtras(extras),
            insurerRegistryId: insurerRegistryIdPartial,
            deliveryAddressSnapshot: deliverySnapshotPartial ?? undefined,
            requiredAttachments: { partialDraft: true },
            status: "intake",
            updatedBy: auth.userId,
            updatedAt: new Date(),
          })
          .where(and(eq(terminationRequests.id, partialId), eq(terminationRequests.tenantId, auth.tenantId)));

        await tx.insert(terminationRequestEvents).values({
          tenantId: auth.tenantId,
          requestId: partialId,
          eventType: "note",
          payload: { kind: "partial_intake_save" },
          actorUserId: auth.userId,
        });
        return partialId;
      }

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
          contractNumber: payload.contractNumber,
          productSegment: payload.productSegment,
          terminationMode: payload.terminationMode,
          terminationReasonCode: payload.terminationReasonCode,
          requestedEffectiveDate: payload.requestedEffectiveDate ?? undefined,
          requestedSubmissionDate: payload.requestedSubmissionDate ?? undefined,
          contractStartDate: payload.contractStartDate ?? undefined,
          contractAnniversaryDate: payload.contractAnniversaryDate ?? undefined,
          sourceKind: payload.sourceKind,
          documentBuilderExtras: serializeDocumentBuilderExtras(extras),
          insurerRegistryId: insurerRegistryIdPartial,
          deliveryAddressSnapshot: deliverySnapshotPartial ?? undefined,
          requiredAttachments: { partialDraft: true },
          status: "intake",
          deliveryChannel: "not_yet_set",
          createdBy: auth.userId,
          updatedBy: auth.userId,
        })
        .returning({ id: terminationRequests.id });

      const id = row?.id;
      if (!id) throw new Error("Insert failed");

      await tx.insert(terminationRequestEvents).values({
        tenantId: auth.tenantId,
        requestId: id,
        eventType: "created",
        payload: { partialDraft: true },
        actorUserId: auth.userId,
      });
      return id;
    });

    return { ok: true, requestId };
  } catch (e) {
    console.error("saveTerminationIntakePartialAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Uložení konceptu se nezdařilo.",
    };
  }
}

export type TerminationIntakeDraftWizardState = {
  requestId: string;
  sourceKind: TerminationRequestSource;
  contactId: string | null;
  contractId: string | null;
  sourceDocumentId: string | null;
  insurerName: string;
  /** Vybraný řádek registru (pro náhled adresy v dopise u konceptu). */
  insurerRegistryId: string | null;
  contractNumber: string | null;
  productSegment: string | null;
  contractStartDate: string | null;
  contractAnniversaryDate: string | null;
  requestedEffectiveDate: string | null;
  requestedSubmissionDate: string | null;
  terminationMode: TerminationMode;
  terminationReasonCode: TerminationReasonCode;
  uncertainInsurer: boolean;
  documentBuilderExtras: TerminationDocumentBuilderExtras;
  /** Stav žádosti (načtení průvodce i po dokončení z konceptu). */
  status: TerminationRequestStatus;
  /** Odvozeno z registru při načtení konceptu (levý panel / konzistence s dopisem). */
  insurerRegistryOneLine: string | null;
  insurerRegistryChannelHint: string | null;
};

export type GetTerminationIntakeDraftResponse =
  | { ok: true; data: TerminationIntakeDraftWizardState }
  | { ok: false; error: string };

export async function getTerminationIntakeDraftForWizard(
  requestId: string
): Promise<GetTerminationIntakeDraftResponse> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!hasPermission(auth.roleName, "contacts:read")) return { ok: false, error: "Forbidden" };

  const [row] = await db
    .select()
    .from(terminationRequests)
    .where(and(eq(terminationRequests.id, requestId), eq(terminationRequests.tenantId, auth.tenantId)))
    .limit(1);
  if (!row) return { ok: false, error: "Koncept nenalezen." };
  if (!isTerminationWizardResumableStatus(row.status)) {
    return { ok: false, error: "Tuto žádost z průvodce nadále upravovat nelze (stav se změnil)." };
  }

  const extras = parseDocumentBuilderExtras(row.documentBuilderExtras);
  const uncertainInsurer = extras.uncertainInsurer === true;
  const { uncertainInsurer: _u, ...restExtras } = extras;

  let insurerRegistryOneLine: string | null = null;
  let insurerRegistryChannelHint: string | null = null;
  if (row.insurerRegistryId) {
    const [ir] = await db
      .select({
        mailingAddress: insurerTerminationRegistry.mailingAddress,
        allowedChannels: insurerTerminationRegistry.allowedChannels,
        email: insurerTerminationRegistry.email,
      })
      .from(insurerTerminationRegistry)
      .where(
        and(
          eq(insurerTerminationRegistry.id, row.insurerRegistryId),
          or(
            isNull(insurerTerminationRegistry.tenantId),
            eq(insurerTerminationRegistry.tenantId, auth.tenantId)
          )
        )
      )
      .limit(1);
    if (ir) {
      insurerRegistryOneLine = formatTerminationRegistryMailingOneLine(
        (ir.mailingAddress as Record<string, unknown> | null) ?? null
      );
      insurerRegistryChannelHint = formatTerminationChannelHint(
        ir.allowedChannels as string[] | null | undefined,
        ir.email
      );
    }
  }

  return {
    ok: true,
    data: {
      requestId: row.id,
      sourceKind: row.sourceKind,
      contactId: row.contactId,
      contractId: row.contractId,
      sourceDocumentId: row.sourceDocumentId,
      insurerName:
        row.insurerName === TERMINATION_PARTIAL_INSURER_PLACEHOLDER ? "" : row.insurerName,
      insurerRegistryId: row.insurerRegistryId,
      contractNumber: row.contractNumber,
      productSegment: row.productSegment,
      contractStartDate: row.contractStartDate,
      contractAnniversaryDate: row.contractAnniversaryDate,
      requestedEffectiveDate: row.requestedEffectiveDate,
      requestedSubmissionDate: row.requestedSubmissionDate ?? null,
      terminationMode: row.terminationMode,
      terminationReasonCode: row.terminationReasonCode as TerminationReasonCode,
      uncertainInsurer,
      documentBuilderExtras: restExtras,
      status: row.status as TerminationRequestStatus,
      insurerRegistryOneLine,
      insurerRegistryChannelHint,
    },
  };
}

export type UpdateTerminationFieldsPayload = {
  requestId: string;
  sourceKind?: TerminationRequestSource;
  contactId?: string | null;
  contractId?: string | null;
  sourceDocumentId?: string | null;
  insurerName: string;
  contractNumber?: string | null;
  productSegment?: string | null;
  contractStartDate?: string | null;
  contractAnniversaryDate?: string | null;
  requestedEffectiveDate?: string | null;
  requestedSubmissionDate?: string | null;
  terminationMode: TerminationMode;
  terminationReasonCode: TerminationReasonCode;
  uncertainInsurer: boolean;
  documentBuilderExtras?: TerminationDocumentBuilderExtras | null;
};

/**
 * Úprava polí žádosti na detailu + nové vyhodnocení rules engine (přílohy se přegenerují).
 */
export async function updateTerminationRequestFieldsAndReevaluateAction(
  payload: UpdateTerminationFieldsPayload
): Promise<CreateTerminationDraftResult> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!canWriteContacts(auth.roleName)) {
    return { ok: false, error: "Nemáte oprávnění." };
  }

  const [existing] = await db
    .select()
    .from(terminationRequests)
    .where(
      and(eq(terminationRequests.id, payload.requestId), eq(terminationRequests.tenantId, auth.tenantId))
    )
    .limit(1);
  if (!existing) return { ok: false, error: "Žádost nenalezena." };
  if (existing.status === "completed" || existing.status === "cancelled") {
    return { ok: false, error: "Dokončenou nebo zrušenou žádost nelze tímto způsobem měnit." };
  }

  const insurerName = payload.insurerName?.trim();
  if (!insurerName) return { ok: false, error: "Vyplňte název pojišťovny." };
  if (insurerName === TERMINATION_PARTIAL_INSURER_PLACEHOLDER) {
    return { ok: false, error: "Vyplňte skutečný název pojišťovny." };
  }

  const contactId = payload.contactId !== undefined ? payload.contactId : existing.contactId;
  const contractId = payload.contractId !== undefined ? payload.contractId : existing.contractId;
  const sourceDocumentId =
    payload.sourceDocumentId !== undefined ? payload.sourceDocumentId : existing.sourceDocumentId;
  const sourceKind = payload.sourceKind ?? existing.sourceKind;
  const sourceConversationId = existing.sourceConversationId;

  if (contractId && contactId) {
    const [c] = await db
      .select({ contactId: contracts.contactId })
      .from(contracts)
      .where(and(eq(contracts.id, contractId), eq(contracts.tenantId, auth.tenantId)))
      .limit(1);
    if (!c || c.contactId !== contactId) {
      return { ok: false, error: "Smlouva nepatří k vybranému kontaktu." };
    }
  }

  if (contactId) {
    const [p] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, auth.tenantId)))
      .limit(1);
    if (!p) return { ok: false, error: "Kontakt neexistuje." };
  }

  if (sourceDocumentId) {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, sourceDocumentId), eq(documents.tenantId, auth.tenantId)))
      .limit(1);
    if (!doc) {
      return { ok: false, error: "Zdrojový dokument neexistuje nebo nepatří k vašemu účtu." };
    }
  }

  let rulesInput: TerminationRulesInput;
  if (contractId && contactId) {
    rulesInput = {
      source: "crm_contract",
      contractId,
      contactId,
      advisorId: auth.userId,
      contractNumber: payload.contractNumber ?? "",
      productSegment: payload.productSegment ?? "",
      insurerName,
      contractStartDate: payload.contractStartDate ?? null,
      contractAnniversaryDate: payload.contractAnniversaryDate ?? null,
      requestedEffectiveDate: payload.requestedEffectiveDate ?? null,
      requestedSubmissionDate: payload.requestedSubmissionDate ?? null,
      terminationMode: payload.terminationMode,
      terminationReasonCode: payload.terminationReasonCode,
      sourceDocumentId,
      sourceConversationId,
    };
  } else {
    const manualSource: TerminationManualInput["source"] =
      sourceKind === "quick_action"
        ? "quick_action"
        : sourceKind === "ai_chat"
          ? "ai_chat"
          : "manual_intake";
    rulesInput = {
      source: manualSource,
      contactId,
      advisorId: auth.userId,
      contractNumber: payload.contractNumber ?? null,
      productSegment: payload.productSegment ?? null,
      insurerName,
      contractStartDate: payload.contractStartDate ?? null,
      contractAnniversaryDate: payload.contractAnniversaryDate ?? null,
      requestedEffectiveDate: payload.requestedEffectiveDate ?? null,
      requestedSubmissionDate: payload.requestedSubmissionDate ?? null,
      terminationMode: payload.terminationMode,
      terminationReasonCode: payload.terminationReasonCode,
      sourceDocumentId,
      sourceConversationId,
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

  const rowValues = {
    contactId,
    contractId,
    sourceDocumentId,
    sourceConversationId,
    advisorId: existing.advisorId,
    insurerName,
    insurerRegistryId: rules.insurerRegistryId,
    contractNumber: payload.contractNumber ?? null,
    productSegment: payload.productSegment ?? null,
    terminationMode: payload.terminationMode,
    terminationReasonCode: payload.terminationReasonCode,
    reasonCatalogId: rules.reasonCatalogId,
    requestedEffectiveDate: payload.requestedEffectiveDate ?? undefined,
    requestedSubmissionDate: payload.requestedSubmissionDate ?? undefined,
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
    confidence: rules.confidence != null ? String(Math.min(1, Math.max(0, rules.confidence))) : null,
    sourceKind,
    documentBuilderExtras: serializeDocumentBuilderExtras({
      ...(payload.documentBuilderExtras ?? {}),
      uncertainInsurer: payload.uncertainInsurer ? true : undefined,
    }),
    updatedBy: auth.userId,
    updatedAt: new Date(),
  };

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(terminationRequiredAttachments)
        .where(
          and(
            eq(terminationRequiredAttachments.requestId, payload.requestId),
            eq(terminationRequiredAttachments.tenantId, auth.tenantId)
          )
        );
      await tx
        .update(terminationRequests)
        .set(rowValues)
        .where(
          and(eq(terminationRequests.id, payload.requestId), eq(terminationRequests.tenantId, auth.tenantId))
        );

      await tx.insert(terminationRequestEvents).values({
        tenantId: auth.tenantId,
        requestId: payload.requestId,
        eventType: "rules_result",
        payload: {
          outcome: rules.outcome,
          source: "detail_field_update",
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
          requestId: payload.requestId,
          requirementCode: a.requirementCode,
          label: a.label,
          status: a.required ? "required" : "optional",
          sortOrder: sort++,
        });
      }
    });

    return { ok: true, requestId: payload.requestId, rules, status };
  } catch (e) {
    console.error("updateTerminationRequestFieldsAndReevaluateAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Uložení se nezdařilo.",
    };
  }
}

export type TerminationLetterPreviewResponse =
  | { ok: true; data: TerminationLetterBuildResult }
  | { ok: false; error: string };

async function loadTerminationLetterBuildResult(
  requestId: string,
  auth: AuthContext
): Promise<TerminationLetterPreviewResponse> {
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
      requestedSubmissionDate: req.requestedSubmissionDate ?? null,
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

/**
 * Fáze 6 – náhled dopisu / formulářového režimu z uložené žádosti.
 */
export async function getTerminationLetterPreview(requestId: string): Promise<TerminationLetterPreviewResponse> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") {
    return { ok: false, error: "Nepovoleno." };
  }
  if (!hasPermission(auth.roleName, "contacts:read")) {
    return { ok: false, error: "Forbidden" };
  }
  return loadTerminationLetterBuildResult(requestId, auth);
}

export type SaveTerminationDocKind = "draft_letter" | "cover_letter";

export type SaveTerminationGeneratedDocumentResponse =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

/**
 * Uloží aktuální text dopisu / průvodního dopisu do `documents` + `termination_generated_documents` (Supabase Storage .txt).
 */
export async function saveTerminationGeneratedDocumentAction(
  requestId: string,
  kind: SaveTerminationDocKind
): Promise<SaveTerminationGeneratedDocumentResponse> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!hasPermission(auth.roleName, "contacts:read")) return { ok: false, error: "Forbidden" };
  if (!hasPermission(auth.roleName, "documents:write")) {
    return { ok: false, error: "Chybí oprávnění k zápisu dokumentů." };
  }

  const preview = await loadTerminationLetterBuildResult(requestId, auth);
  if (!preview.ok) return { ok: false, error: preview.error };

  const built = preview.data;
  const docKind: TerminationGeneratedDocumentKind = kind;
  const plain =
    kind === "draft_letter" ? built.letterPlainText : built.coveringLetterPlainText;
  const htmlExtra = kind === "draft_letter" ? built.letterHtml : built.coveringLetterHtml;

  if (!plain?.trim()) {
    return {
      ok: false,
      error:
        kind === "draft_letter"
          ? "Pro tuto žádost není k dispozici text hlavního dopisu (např. formulářový režim)."
          : "Průvodní dopis není k dispozici (jen u formulářové pojišťovny).",
    };
  }

  const [reqRow] = await db
    .select({
      id: terminationRequests.id,
      contractNumber: terminationRequests.contractNumber,
      contactId: terminationRequests.contactId,
      contractId: terminationRequests.contractId,
    })
    .from(terminationRequests)
    .where(and(eq(terminationRequests.id, requestId), eq(terminationRequests.tenantId, auth.tenantId)))
    .limit(1);
  if (!reqRow) return { ok: false, error: "Žádost nenalezena." };

  const labelShort = (reqRow.contractNumber ?? requestId.slice(0, 8)).replace(/[^\w\d\-./]/g, "_");
  const fileBase =
    kind === "draft_letter"
      ? `vyhrozeni-dopis-${labelShort}`
      : `pruvodni-dopis-${labelShort}`;
  const storagePath = `${auth.tenantId}/terminations/${requestId}/${Date.now()}-${fileBase}.txt`;
  const displayName =
    kind === "draft_letter"
      ? `Výpověď – dopis (${reqRow.contractNumber ?? "smlouva"}).txt`
      : `Výpověď – průvodní dopis (${reqRow.contractNumber ?? "smlouva"}).txt`;

  const body = new TextEncoder().encode(plain);
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, body, {
    contentType: "text/plain; charset=utf-8",
    upsert: false,
  });
  if (uploadError) {
    return {
      ok: false,
      error:
        uploadError.message?.toLowerCase().includes("bucket") || uploadError.message?.toLowerCase().includes("not found")
          ? "Bucket „documents“ v úložišti není dostupný."
          : uploadError.message,
    };
  }

  try {
    const documentId = await db.transaction(async (tx) => {
      await tx
        .update(terminationGeneratedDocuments)
        .set({ isCurrent: false })
        .where(
          and(
            eq(terminationGeneratedDocuments.requestId, requestId),
            eq(terminationGeneratedDocuments.tenantId, auth.tenantId),
            eq(terminationGeneratedDocuments.kind, docKind)
          )
        );

      const [doc] = await tx
        .insert(documents)
        .values({
          tenantId: auth.tenantId,
          contactId: reqRow.contactId,
          contractId: reqRow.contractId,
          name: displayName,
          documentType: kind === "draft_letter" ? "termination_draft_letter" : "termination_cover_letter",
          storagePath,
          mimeType: "text/plain; charset=utf-8",
          sizeBytes: body.length,
          tags: ["termination", `termination_request:${requestId}`],
          visibleToClient: false,
          uploadSource: "web",
          sourceChannel: "backoffice_import",
          uploadedBy: auth.userId,
          markdownContent: htmlExtra ?? null,
          processingStatus: "none",
          businessStatus: "none",
        })
        .returning({ id: documents.id });

      const newDocId = doc?.id;
      if (!newDocId) throw new Error("Insert document failed");

      await tx.insert(terminationGeneratedDocuments).values({
        tenantId: auth.tenantId,
        requestId,
        documentId: newDocId,
        kind: docKind,
        versionLabel: new Date().toISOString().slice(0, 10),
        isCurrent: true,
        metadata: { savedFrom: "termination_letter_builder", hasHtmlSnapshot: Boolean(htmlExtra) },
      });

      await tx.insert(terminationRequestEvents).values({
        tenantId: auth.tenantId,
        requestId,
        eventType: "document_linked",
        payload: { documentId: newDocId, kind: docKind, storagePath },
        actorUserId: auth.userId,
      });

      return newDocId;
    });

    return { ok: true, documentId };
  } catch (e) {
    console.error("saveTerminationGeneratedDocumentAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Uložení dokumentu se nezdařilo.",
    };
  }
}

// --- Fáze 8 / 9: detail žádosti, stav, dispatch log ---

export type TerminationRequestEventRow = {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: string;
};

export type TerminationDispatchLogRow = {
  id: string;
  channel: string;
  status: string;
  attemptedAt: string | null;
  completedAt: string | null;
  carrierOrProvider: string | null;
  trackingReference: string | null;
  error: string | null;
  createdAt: string;
};

export type TerminationRequestDetail = {
  request: typeof terminationRequests.$inferSelect;
  events: TerminationRequestEventRow[];
  dispatchLog: TerminationDispatchLogRow[];
};

export type TerminationRequestDetailResponse =
  | { ok: true; data: TerminationRequestDetail }
  | { ok: false; error: string };

export async function getTerminationRequestDetail(requestId: string): Promise<TerminationRequestDetailResponse> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!hasPermission(auth.roleName, "contacts:read")) return { ok: false, error: "Forbidden" };

  const [req] = await db
    .select()
    .from(terminationRequests)
    .where(and(eq(terminationRequests.id, requestId), eq(terminationRequests.tenantId, auth.tenantId)))
    .limit(1);
  if (!req) return { ok: false, error: "Žádost nenalezena." };

  const evRows = await db
    .select()
    .from(terminationRequestEvents)
    .where(
      and(
        eq(terminationRequestEvents.requestId, requestId),
        eq(terminationRequestEvents.tenantId, auth.tenantId)
      )
    )
    .orderBy(desc(terminationRequestEvents.createdAt));

  const dispRows = await db
    .select()
    .from(terminationDispatchLog)
    .where(
      and(eq(terminationDispatchLog.requestId, requestId), eq(terminationDispatchLog.tenantId, auth.tenantId))
    )
    .orderBy(desc(terminationDispatchLog.createdAt));

  return {
    ok: true,
    data: {
      request: req,
      events: evRows.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        payload: (e.payload as Record<string, unknown> | null) ?? null,
        actorUserId: e.actorUserId ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      dispatchLog: dispRows.map((d) => ({
        id: d.id,
        channel: d.channel,
        status: d.status,
        attemptedAt: d.attemptedAt?.toISOString() ?? null,
        completedAt: d.completedAt?.toISOString() ?? null,
        carrierOrProvider: d.carrierOrProvider ?? null,
        trackingReference: d.trackingReference ?? null,
        error: d.error ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
    },
  };
}

export type UpdateTerminationStatusPayload = {
  requestId: string;
  status: TerminationRequestStatus;
  note?: string | null;
};

export type SimpleOk = { ok: true } | { ok: false; error: string };

export async function updateTerminationRequestStatusAction(
  payload: UpdateTerminationStatusPayload
): Promise<SimpleOk> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!canWriteContacts(auth.roleName)) return { ok: false, error: "Nemáte oprávnění." };

  if (!terminationRequestStatuses.includes(payload.status as (typeof terminationRequestStatuses)[number])) {
    return { ok: false, error: "Neplatný stav." };
  }

  const [existing] = await db
    .select({ id: terminationRequests.id, status: terminationRequests.status })
    .from(terminationRequests)
    .where(
      and(eq(terminationRequests.id, payload.requestId), eq(terminationRequests.tenantId, auth.tenantId))
    )
    .limit(1);
  if (!existing) return { ok: false, error: "Žádost nenalezena." };

  await db.transaction(async (tx) => {
    await tx
      .update(terminationRequests)
      .set({
        status: payload.status,
        updatedBy: auth.userId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(terminationRequests.id, payload.requestId), eq(terminationRequests.tenantId, auth.tenantId))
      );

    await tx.insert(terminationRequestEvents).values({
      tenantId: auth.tenantId,
      requestId: payload.requestId,
      eventType: "status_changed",
      payload: {
        from: existing.status,
        to: payload.status,
        note: payload.note?.trim() || undefined,
      },
      actorUserId: auth.userId,
    });
  });

  return { ok: true };
}

export type AppendTerminationDispatchPayload = {
  requestId: string;
  channel: TerminationDeliveryChannel;
  status: "pending" | "sent" | "delivered" | "failed" | "bounced" | "cancelled";
  trackingReference?: string | null;
  carrierOrProvider?: string | null;
  error?: string | null;
};

export async function appendTerminationDispatchLogAction(
  payload: AppendTerminationDispatchPayload
): Promise<SimpleOk> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!canWriteContacts(auth.roleName)) return { ok: false, error: "Nemáte oprávnění." };

  const [existing] = await db
    .select({ id: terminationRequests.id })
    .from(terminationRequests)
    .where(
      and(eq(terminationRequests.id, payload.requestId), eq(terminationRequests.tenantId, auth.tenantId))
    )
    .limit(1);
  if (!existing) return { ok: false, error: "Žádost nenalezena." };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(terminationDispatchLog).values({
      tenantId: auth.tenantId,
      requestId: payload.requestId,
      channel: payload.channel,
      status: payload.status,
      attemptedAt: payload.status !== "pending" ? now : null,
      completedAt: payload.status === "delivered" ? now : null,
      carrierOrProvider: payload.carrierOrProvider?.trim() || null,
      trackingReference: payload.trackingReference?.trim() || null,
      error: payload.error?.trim() || null,
    });

    await tx.insert(terminationRequestEvents).values({
      tenantId: auth.tenantId,
      requestId: payload.requestId,
      eventType: "dispatch_attempt",
      payload: {
        channel: payload.channel,
        status: payload.status,
        trackingReference: payload.trackingReference?.trim() || undefined,
      },
      actorUserId: auth.userId,
    });
  });

  if (payload.status === "sent" || payload.status === "delivered") {
    try {
      const [pendingDup] = await db
        .select({ id: reminders.id })
        .from(reminders)
        .where(
          and(
            eq(reminders.tenantId, auth.tenantId),
            eq(reminders.reminderType, "termination_delivery_check"),
            eq(reminders.relatedEntityType, "termination_request"),
            eq(reminders.relatedEntityId, payload.requestId),
            eq(reminders.status, "pending")
          )
        )
        .limit(1);
      if (!pendingDup) {
        const r = createReminder({
          tenantId: auth.tenantId,
          reminderType: "termination_delivery_check",
          title: "Zkontrolovat doručení výpovědi",
          description: `Kanál: ${payload.channel}. Sledování: ${payload.trackingReference?.trim() || "—"}.`,
          dueAt: new Date(Date.now() + 7 * 86400000),
          severity: "medium",
          relatedEntityType: "termination_request",
          relatedEntityId: payload.requestId,
          assignedTo: auth.userId,
          suggestionOrigin: "rule",
        });
        await db.insert(reminders).values({
          tenantId: r.tenantId,
          reminderType: r.reminderType,
          title: r.title,
          description: r.description,
          dueAt: r.dueAt,
          severity: r.severity,
          relatedEntityType: r.relatedEntityType,
          relatedEntityId: r.relatedEntityId,
          assignedTo: r.assignedTo,
          suggestionOrigin: r.suggestionOrigin,
          status: r.status,
        });
      }
    } catch (e) {
      console.error("appendTerminationDispatchLogAction reminder", e);
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// AI extrakce polí z nahraného dokumentu pro wizard
// ---------------------------------------------------------------------------

export type ExtractTerminationFieldsResult =
  | {
      ok: true;
      insurerNameOrAddressText: string | null;
      contractNumber: string | null;
      policyholderName: string | null;
      /** Jméno pojistníka (první). */
      policyholderFirstName: string | null;
      /** Příjmení pojistníka. */
      policyholderLastName: string | null;
      /** Ulice a číslo popisné z adresy pojistníka. */
      policyholderStreet: string | null;
      /** Město z adresy pojistníka. */
      policyholderCity: string | null;
      /** PSČ z adresy pojistníka. */
      policyholderPostalCode: string | null;
      /** Počátek pojištění ve formátu yyyy-mm-dd nebo null. */
      contractStartDate: string | null;
      /** Výroční datum smlouvy ve formátu yyyy-mm-dd nebo null. */
      contractAnniversaryDate: string | null;
      /** Název produktu / pojistné smlouvy (volný text z dokumentu). */
      productName: string | null;
      /** Typ produktu (volný text, např. „životní pojištění", „havarijní pojištění"). */
      productTypeRaw: string | null;
      /** Navrhovaný segment (klasifikátor ho dopočítá v UI, ale AI ho může naznačit). */
      segmentCandidate: string | null;
      /** SPZ vozidla (auto segmenty). */
      registrationPlate: string | null;
      /** VIN vozidla. */
      vehicleVin: string | null;
    }
  | { ok: false; error: string };

export async function extractTerminationFieldsFromDocumentAction(
  documentId: string,
): Promise<ExtractTerminationFieldsResult> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (
    !hasPermission(auth.roleName as RoleName, "documents:read") &&
    !hasPermission(auth.roleName as RoleName, "documents:write")
  ) {
    return { ok: false, error: "Forbidden" };
  }

  const [doc] = await db
    .select({ id: documents.id, storagePath: documents.storagePath, mimeType: documents.mimeType, tenantId: documents.tenantId })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenantId, auth.tenantId)))
    .limit(1);
  if (!doc) return { ok: false, error: "Dokument nenalezen." };

  const { createSignedStorageUrl } = await import("@/lib/storage/signed-url");
  const admin = createAdminClient();
  const { signedUrl } = await createSignedStorageUrl({
    adminClient: admin,
    bucket: "documents",
    path: doc.storagePath,
    purpose: "internal_processing",
  });
  if (!signedUrl) return { ok: false, error: "Nepodařilo se získat přístup k dokumentu." };

  const { createResponseWithFile } = await import("@/lib/openai");

  const prompt = `Z přiloženého pojistného dokumentu vytěž tato pole ve formátu JSON.
Vrať POUZE validní JSON objekt, žádný jiný text, žádné markdown bloky.

Schema (všechna pole jsou string nebo null):
{
  "insurerNameOrAddressText": "celé jméno pojišťovny nebo adresní blok pojišťovny tak jak je v dokumentu",
  "contractNumber": "číslo pojistné smlouvy / pojistky",
  "policyholderName": "celé jméno pojistníka (fyzická nebo právnická osoba, ne pojistitel)",
  "policyholderFirstName": "křestní jméno pojistníka",
  "policyholderLastName": "příjmení pojistníka",
  "policyholderStreet": "ulice a číslo popisné z adresy pojistníka",
  "policyholderCity": "město z adresy pojistníka",
  "policyholderPostalCode": "PSČ z adresy pojistníka",
  "contractStartDate": "počátek pojištění ve formátu YYYY-MM-DD; pokud je jen měsíc/rok, použij první den měsíce",
  "contractAnniversaryDate": "datum výročí smlouvy ve formátu YYYY-MM-DD, pokud je přímo uvedeno",
  "productName": "název produktu nebo smlouvy tak jak je v dokumentu",
  "productTypeRaw": "typ pojistného produktu (např. životní pojištění, havarijní pojištění, povinné ručení)",
  "segmentCandidate": "navrhovaná kategorie z těchto hodnot: ZP, MAJ, ODP, AUTO_PR, AUTO_HAV, CEST, INV, DIP, DPS, HYPO, UVER, FIRMA_POJ – nebo null pokud nejsi jistý",
  "registrationPlate": "státní poznávací značka vozidla, pokud jde o auto pojištění",
  "vehicleVin": "VIN vozidla, pokud jde o auto pojištění"
}

Pravidla:
- Pokud pole v dokumentu nenajdeš nebo si nejsi jistý, vrať null.
- Nikdy neodhad ani nevymýšlej. Jen vytěž co je v dokumentu.
- Datumy normalizuj do formátu YYYY-MM-DD.`;

  let raw: string;
  try {
    raw = await createResponseWithFile(signedUrl, prompt, {
      routing: { category: "ai_review" },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Chyba AI extrakce." };
  }

  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "AI vrátilo neplatnou odpověď – zkuste znovu." };
  }

  const toString = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  // Zkusíme normalizovat datum na YYYY-MM-DD
  const toIsoDate = (v: unknown): string | null => {
    const s = toString(v);
    if (!s) return null;
    // Pokud je ve formátu YYYY-MM-DD, vrátime as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Jinak zkusíme Date.parse
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0]!;
    return null;
  };

  // Jméno z firstName+lastName nebo celého policyholderName
  const firstName = toString(parsed.policyholderFirstName);
  const lastName = toString(parsed.policyholderLastName);
  const fullFromParts = [firstName, lastName].filter(Boolean).join(" ") || null;
  const policyholderName = toString(parsed.policyholderName) ?? fullFromParts;

  return {
    ok: true,
    insurerNameOrAddressText: toString(parsed.insurerNameOrAddressText),
    contractNumber: toString(parsed.contractNumber),
    policyholderName,
    policyholderFirstName: firstName,
    policyholderLastName: lastName,
    policyholderStreet: toString(parsed.policyholderStreet),
    policyholderCity: toString(parsed.policyholderCity),
    policyholderPostalCode: toString(parsed.policyholderPostalCode),
    contractStartDate: toIsoDate(parsed.contractStartDate),
    contractAnniversaryDate: toIsoDate(parsed.contractAnniversaryDate),
    productName: toString(parsed.productName),
    productTypeRaw: toString(parsed.productTypeRaw),
    segmentCandidate: toString(parsed.segmentCandidate),
    registrationPlate: toString(parsed.registrationPlate),
    vehicleVin: toString(parsed.vehicleVin),
  };
}

export interface TerminationRequestListItem {
  id: string;
  insurerName: string;
  contractNumber: string | null;
  productSegment: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  requestedEffectiveDate: string | null;
}

export type ListTerminationRequestsResponse =
  | { ok: true; items: TerminationRequestListItem[] }
  | { ok: false; error: string };

export async function listTerminationRequestsAction(): Promise<ListTerminationRequestsResponse> {
  const auth = await requireAuthInAction();
  if (!isTerminationsModuleEnabledOnServer()) {
    return { ok: false, error: "Modul výpovědí je vypnutý." };
  }
  if (auth.roleName === "Client") return { ok: false, error: "Nepovoleno." };
  if (!hasPermission(auth.roleName, "contacts:read")) return { ok: false, error: "Forbidden" };

  const rows = await db
    .select({
      id: terminationRequests.id,
      insurerName: terminationRequests.insurerName,
      contractNumber: terminationRequests.contractNumber,
      productSegment: terminationRequests.productSegment,
      status: terminationRequests.status,
      createdAt: terminationRequests.createdAt,
      updatedAt: terminationRequests.updatedAt,
      requestedEffectiveDate: terminationRequests.requestedEffectiveDate,
    })
    .from(terminationRequests)
    .where(eq(terminationRequests.tenantId, auth.tenantId))
    .orderBy(desc(terminationRequests.createdAt))
    .limit(200);

  return {
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      insurerName: r.insurerName,
      contractNumber: r.contractNumber ?? null,
      productSegment: r.productSegment ?? null,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      requestedEffectiveDate: r.requestedEffectiveDate ?? null,
    })),
  };
}
