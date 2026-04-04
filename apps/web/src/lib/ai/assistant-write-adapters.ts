/**
 * Phase 3: verified write adapters — delegate to server actions + DB with auth checks.
 * Registered with assistant-execution-engine on load.
 */

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";
import { db, documents, opportunities, opportunityStages, eq, and, asc, contractSegments } from "db";
import type { ExecutionStepResult } from "./assistant-domain-model";
import type { ExecutionContext } from "./assistant-execution-engine";
import { registerWriteAdapter } from "./assistant-execution-engine";
import { caseTypeForProductDomain, opportunityTitleFromSlots } from "./assistant-case-type-map";
import { mapErrorForAdvisor } from "./assistant-error-mapping";
import {
  canonicalTaskTitle,
  canonicalClientRequestSubject,
  canonicalMaterialRequestTitle,
  canonicalDealDetailLine,
  canonicalMeetingTitle,
  canonicalPortalMessageTemplate,
} from "./assistant-canonical-names";
import { createOpportunity as createOpportunityAction, updateOpportunity as updateOpportunityAction } from "@/app/actions/pipeline";
import { createTask as createTaskAction, updateTask as updateTaskAction } from "@/app/actions/tasks";
import { createEvent as createEventAction } from "@/app/actions/events";
import { createMeetingNote as createMeetingNoteAction, updateMeetingNote as updateMeetingNoteAction } from "@/app/actions/meeting-notes";
import {
  createAdvisorMaterialRequest,
  linkMaterialRequestDocumentToClientVault,
} from "@/app/actions/advisor-material-requests";
import { updateDocumentVisibleToClient } from "@/app/actions/documents";
import { createPortalNotification } from "@/app/actions/portal-notifications";
import {
  approveContractReview,
  applyContractReviewDrafts,
  linkContractReviewFileToContactDocuments,
} from "@/app/actions/contract-review";
import { createDraft } from "@/app/actions/communication-drafts";
import { approveContractForClientPortal, updateContract, createContract as createContractAction } from "@/app/actions/contracts";
import { upsertCoverageItem } from "@/app/actions/coverage";
import { sendMessage } from "@/app/actions/messages";
import { createAdvisorClientRequest } from "../assistant/create-advisor-client-request";
import { contractSegments } from "../../../../../../packages/db/src/schema/contracts";
import { validatePartnerInCatalog, validateProductInCatalog } from "./ratings/toplists";
import { normalizeCoverageStatus } from "./assistant-coverage-item-resolve";
import { resolveContractSegmentFromUserText, PRODUCT_DOMAIN_DEFAULT_SEGMENT, type ProductDomain } from "./assistant-domain-model";

async function assertCtx(ctx: ExecutionContext): Promise<{
  tenantId: string;
  userId: string;
  roleName: RoleName;
}> {
  const auth = await requireAuthInAction();
  if (auth.tenantId !== ctx.tenantId) {
    throw new Error("Nesoulad workspace.");
  }
  if (auth.userId !== ctx.userId) {
    throw new Error("Nesoulad uživatele.");
  }
  return { tenantId: auth.tenantId, userId: auth.userId, roleName: auth.roleName as RoleName };
}

function okResult(entityId: string, entityType: string, warnings: string[] = []): ExecutionStepResult {
  return { ok: true, outcome: "executed", entityId, entityType, warnings, error: null };
}

function errResult(error: string, retryable = false): ExecutionStepResult {
  return { ok: false, outcome: "failed", entityId: null, entityType: null, warnings: [], error, retryable };
}

function requiresInputResult(error: string): ExecutionStepResult {
  return { ok: false, outcome: "requires_input", entityId: null, entityType: null, warnings: [], error, retryable: true };
}

async function firstPipelineStageId(tenantId: string): Promise<string | null> {
  const rows = await db
    .select({ id: opportunityStages.id })
    .from(opportunityStages)
    .where(eq(opportunityStages.tenantId, tenantId))
    .orderBy(asc(opportunityStages.sortOrder))
    .limit(1);
  return rows[0]?.id ?? null;
}

function safeErr(e: unknown, action: string): ExecutionStepResult {
  return errResult(mapErrorForAdvisor(e instanceof Error ? e.message : "", action, action));
}

function strParam(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function productDomainFromParams(params: Record<string, unknown>): string | null {
  const d = params.productDomain;
  return typeof d === "string" && d ? d : null;
}

async function assertDocumentWrite(ctx: ExecutionContext) {
  const auth = await assertCtx(ctx);
  if (!hasPermission(auth.roleName, "documents:write")) {
    throw new Error("Chybí oprávnění documents:write.");
  }
  return auth;
}

export function registerAssistantWriteAdapters(): void {
  registerWriteAdapter("createOpportunity", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const stageId = strParam(params, "stageId") ?? (await firstPipelineStageId(ctx.tenantId));
      if (!stageId) return errResult("V workspace není žádný stupeň pipeline.");
      const domain = productDomainFromParams(params);
      const caseType = domain ? caseTypeForProductDomain(domain as never) : strParam(params, "caseType") ?? "jiné";
      const purpose = strParam(params, "purpose");
      const title =
        strParam(params, "title") ??
        opportunityTitleFromSlots({
          productDomain: (domain as never) ?? null,
          purpose,
          taskTitle: strParam(params, "taskTitle"),
          amount: params.amount,
          periodicity: strParam(params, "periodicity"),
        });
      // Canonical detail line stored as aiSubtitle in customFields for board card display
      const aiSubtitle = canonicalDealDetailLine(params as Record<string, unknown>);
      const id = await createOpportunityAction({
        title,
        caseType,
        contactId,
        stageId,
        expectedValue: strParam(params, "expectedValue") ?? (typeof params.amount === "number" ? String(params.amount) : undefined),
        expectedCloseDate: strParam(params, "expectedCloseDate"),
        customFields: aiSubtitle ? { aiSubtitle } : undefined,
      });
      if (!id) return errResult("Obchod se nepodařilo vytvořit.");
      const warnings: string[] = [];
      const ltv = typeof params.ltv === "number" ? params.ltv : null;
      if (ltv !== null && ltv > 90 && domain === "hypo") {
        warnings.push(`LTV ${ltv} % přesahuje 90 % — ověřte bonitu a regulatorní limity.`);
      }
      return okResult(id, "opportunity", warnings);
    } catch (e) {
      return safeErr(e, "createOpportunity");
    }
  });

  /**
   * Service case: creates an opportunity record with service-specific customFields
   * (service_case: true). Requires contactId + subject/description/noteContent.
   * Distinct from createClientRequest (portal-facing) and createOpportunity (new deals).
   */
  registerWriteAdapter("createServiceCase", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const subject =
        strParam(params, "subject") ??
        strParam(params, "description") ??
        strParam(params, "noteContent") ??
        strParam(params, "taskTitle");
      if (!subject) return errResult("Chybí popis servisního požadavku (subject, description nebo noteContent).");
      const stageId = strParam(params, "stageId") ?? (await firstPipelineStageId(ctx.tenantId));
      if (!stageId) return errResult("V workspace není žádný stupeň pipeline.");
      const domain = productDomainFromParams(params);
      const caseType = domain ? caseTypeForProductDomain(domain as never) : strParam(params, "caseType") ?? "servis";
      const title = strParam(params, "title") ?? `Servisní případ: ${subject}`;
      const id = await createOpportunityAction({
        title,
        caseType,
        contactId,
        stageId,
        expectedCloseDate: strParam(params, "expectedCloseDate"),
      });
      if (!id) return errResult("Servisní případ se nepodařilo vytvořit.");
      await updateOpportunityAction(id, {
        customFields: {
          service_case: true,
          service_case_subject: subject,
          service_case_description: strParam(params, "description") ?? null,
          advisor_created_service_case: true,
        },
      });
      return okResult(id, "opportunity", ["Vytvořen servisní případ (obchod v pipeline se servisním označením)."]);
    } catch (e) {
      return safeErr(e, "createServiceCase");
    }
  });

  registerWriteAdapter("updateOpportunity", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const opportunityId = strParam(params, "opportunityId");
      if (!opportunityId) return errResult("Chybí opportunityId.");
      const patch: Parameters<typeof updateOpportunityAction>[1] = {};
      const warnings: string[] = [];

      if (strParam(params, "title")) patch.title = strParam(params, "title");

      const rawCaseType = strParam(params, "caseType");
      const newDomain = productDomainFromParams(params);

      if (rawCaseType && newDomain) {
        // productDomain wins; warn about the conflict so it's auditable.
        warnings.push(
          `Parametry obsahují caseType („${rawCaseType}") i productDomain („${newDomain}"). `
          + "Použit productDomain — caseType byl ignorován.",
        );
      }

      if (newDomain) {
        patch.caseType = caseTypeForProductDomain(newDomain as never);
      } else if (rawCaseType) {
        patch.caseType = rawCaseType;
      }

      // Detect product domain change: if we're updating to a different product type,
      // surface a warning so the advisor is aware of the reclassification.
      if (newDomain && params.previousProductDomain && newDomain !== params.previousProductDomain) {
        warnings.push(
          `Reklasifikace obchodu: ${String(params.previousProductDomain)} → ${newDomain}. `
          + "Ověřte, zda je změna záměrná.",
        );
      }

      if (params.customFields && typeof params.customFields === "object") {
        patch.customFields = params.customFields as Record<string, unknown>;
      }
      if (strParam(params, "stageId")) patch.stageId = strParam(params, "stageId");
      await updateOpportunityAction(opportunityId, patch);
      return okResult(opportunityId, "opportunity", warnings);
    } catch (e) {
      return safeErr(e, "updateOpportunity");
    }
  });

  registerWriteAdapter("createTask", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const title = canonicalTaskTitle({
        action: "createTask",
        productDomain: strParam(params, "productDomain"),
        existingTitle: strParam(params, "taskTitle") ?? strParam(params, "title"),
        purpose: strParam(params, "purpose"),
      });
      const due =
        strParam(params, "resolvedDate") ??
        (typeof params.dueDate === "string" ? params.dueDate : undefined) ??
        strParam(params, "dueDate");
      const id = await createTaskAction({
        title,
        description: strParam(params, "description"),
        contactId,
        dueDate: due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined,
        opportunityId: strParam(params, "opportunityId"),
      });
      if (!id) return errResult("Úkol se nepodařilo vytvořit.");
      return okResult(id, "task");
    } catch (e) {
      return safeErr(e, "createTask");
    }
  });

  registerWriteAdapter("updateTask", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const taskId = strParam(params, "taskId");
      if (!taskId) return errResult("Chybí taskId.");
      await updateTaskAction(taskId, {
        title: strParam(params, "title"),
        description: strParam(params, "description"),
        contactId: strParam(params, "contactId"),
        dueDate: strParam(params, "dueDate") ?? strParam(params, "resolvedDate"),
        opportunityId: strParam(params, "opportunityId"),
      });
      return okResult(taskId, "task");
    } catch (e) {
      return safeErr(e, "updateTask");
    }
  });

  registerWriteAdapter("createFollowUp", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const title = canonicalTaskTitle({
        action: "createFollowUp",
        productDomain: strParam(params, "productDomain"),
        existingTitle: strParam(params, "taskTitle") ?? strParam(params, "title"),
        purpose: strParam(params, "purpose"),
      });
      const due =
        strParam(params, "resolvedDate") ??
        (typeof params.dueDate === "string" ? params.dueDate : undefined);
      const id = await createTaskAction({
        title,
        description: strParam(params, "description"),
        contactId,
        dueDate: due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined,
        opportunityId: strParam(params, "opportunityId"),
      });
      if (!id) return errResult("Follow-up úkol se nepodařilo vytvořit.");
      return okResult(id, "task");
    } catch (e) {
      return safeErr(e, "createFollowUp");
    }
  });

  registerWriteAdapter("scheduleCalendarEvent", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const startAt = strParam(params, "startAt") ?? strParam(params, "resolvedDate");
      if (!startAt) {
        return errResult("Chybí začátek události (ISO 8601 s časovou zónou, např. …+01:00 nebo Z).");
      }
      const title = canonicalMeetingTitle({
        productDomain: productDomainFromParams(params),
        existingTitle: strParam(params, "title") ?? strParam(params, "taskTitle"),
        purpose: strParam(params, "purpose"),
      });
      const id = await createEventAction({
        title,
        startAt,
        endAt: strParam(params, "endAt"),
        contactId,
        opportunityId: strParam(params, "opportunityId"),
        eventType: strParam(params, "eventType") ?? "schuzka",
        notes: strParam(params, "noteContent"),
        location: strParam(params, "location"),
      });
      if (!id) return errResult("Událost se nepodařila vytvořit.");
      return okResult(id, "event");
    } catch (e) {
      return safeErr(e, "scheduleCalendarEvent");
    }
  });

  registerWriteAdapter("createMeetingNote", async (params, ctx) => {
    try {
      const auth = await assertCtx(ctx);
      if (!hasPermission(auth.roleName, "meeting_notes:write")) return errResult("Chybí oprávnění meeting_notes:write.");
      const contactId = strParam(params, "contactId");
      const bodyText = strParam(params, "noteContent") ?? "";
      const domain = strParam(params, "noteDomain") ?? "obecne";
      const meetingAt = strParam(params, "meetingAt") ?? new Date().toISOString();
      const id = await createMeetingNoteAction({
        contactId: contactId ?? null,
        meetingAt,
        domain,
        content: bodyText ? { obsah: bodyText } : { obsah: "" },
        opportunityId: strParam(params, "opportunityId"),
      });
      if (!id) return errResult("Zápis se nepodařil vytvořit.");
      return okResult(id, "meeting_note");
    } catch (e) {
      return safeErr(e, "createMeetingNote");
    }
  });

  registerWriteAdapter("appendMeetingNote", async (params, ctx) => {
    try {
      const auth = await assertCtx(ctx);
      if (!hasPermission(auth.roleName, "meeting_notes:write")) return errResult("Chybí oprávnění meeting_notes:write.");
      const noteId = strParam(params, "meetingNoteId");
      if (!noteId) return errResult("Chybí meetingNoteId.");
      const add = strParam(params, "noteContent") ?? "";
      const { getMeetingNote } = await import("@/app/actions/meeting-notes");
      const existing = await getMeetingNote(noteId);
      if (!existing) return errResult("Zápis nenalezen.");
      const content = (existing.content && typeof existing.content === "object" ? existing.content : {}) as Record<
        string,
        unknown
      >;
      const prev = typeof content.obsah === "string" ? content.obsah : "";
      await updateMeetingNoteAction(noteId, { content: { ...content, obsah: `${prev}\n\n${add}`.trim() } });
      return okResult(noteId, "meeting_note");
    } catch (e) {
      return safeErr(e, "appendMeetingNote");
    }
  });

  registerWriteAdapter("createInternalNote", async (params, ctx) => {
    try {
      const auth = await assertCtx(ctx);
      if (!hasPermission(auth.roleName, "meeting_notes:write")) return errResult("Chybí oprávnění meeting_notes:write.");
      const contactId = strParam(params, "contactId");
      const id = await createMeetingNoteAction({
        contactId: contactId ?? null,
        meetingAt: strParam(params, "meetingAt") ?? new Date().toISOString(),
        domain: "interni",
        content: { obsah: strParam(params, "noteContent") ?? "" },
        opportunityId: strParam(params, "opportunityId"),
      });
      if (!id) return errResult("Interní poznámka se nepodařila.");
      return okResult(id, "meeting_note");
    } catch (e) {
      return safeErr(e, "createInternalNote");
    }
  });

  registerWriteAdapter("attachDocumentToClient", async (params, ctx) => {
    try {
      await assertDocumentWrite(ctx);
      const documentId = strParam(params, "documentId");
      const contactId = strParam(params, "contactId");
      if (!documentId || !contactId) return errResult("Chybí documentId nebo contactId.");
      const rows = await db
        .update(documents)
        .set({ contactId, updatedAt: new Date() })
        .where(and(eq(documents.tenantId, ctx.tenantId), eq(documents.id, documentId)))
        .returning({ id: documents.id });
      if (rows.length === 0) return errResult("Dokument nenalezen nebo nepatří do tohoto workspace.");
      return okResult(documentId, "document");
    } catch (e) {
      return safeErr(e, "attachDocumentToClient");
    }
  });

  registerWriteAdapter("attachDocumentToOpportunity", async (params, ctx) => {
    try {
      await assertDocumentWrite(ctx);
      const documentId = strParam(params, "documentId");
      const opportunityId = strParam(params, "opportunityId");
      if (!documentId || !opportunityId) return errResult("Chybí documentId nebo opportunityId.");
      const contactId = strParam(params, "contactId");
      const updatePayload: Record<string, unknown> = { opportunityId, updatedAt: new Date() };
      if (contactId) {
        updatePayload.contactId = contactId;
      } else {
        const oppRows = await db
          .select({ contactId: opportunities.contactId })
          .from(opportunities)
          .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, ctx.tenantId)))
          .limit(1);
        if (oppRows[0]?.contactId) {
          updatePayload.contactId = oppRows[0].contactId;
        }
      }
      const rows = await db
        .update(documents)
        .set(updatePayload)
        .where(and(eq(documents.tenantId, ctx.tenantId), eq(documents.id, documentId)))
        .returning({ id: documents.id });
      if (rows.length === 0) return errResult("Dokument nenalezen nebo nepatří do tohoto workspace.");
      return okResult(documentId, "document");
    } catch (e) {
      return safeErr(e, "attachDocumentToOpportunity");
    }
  });

  registerWriteAdapter("classifyDocument", async (params, ctx) => {
    try {
      await assertDocumentWrite(ctx);
      const documentId = strParam(params, "documentId");
      const documentType = strParam(params, "documentType") ?? strParam(params, "classification");
      if (!documentId || !documentType) return errResult("Chybí documentId nebo documentType.");
      const rows = await db
        .update(documents)
        .set({ documentType, updatedAt: new Date() })
        .where(and(eq(documents.tenantId, ctx.tenantId), eq(documents.id, documentId)))
        .returning({ id: documents.id });
      if (rows.length === 0) return errResult("Dokument nenalezen nebo nepatří do tohoto workspace.");
      return okResult(documentId, "document");
    } catch (e) {
      return safeErr(e, "classifyDocument");
    }
  });

  registerWriteAdapter("triggerDocumentReview", async (params, ctx) => {
    try {
      await assertDocumentWrite(ctx);
      const documentId = strParam(params, "documentId");
      if (!documentId) return errResult("Chybí documentId.");
      const rows = await db
        .update(documents)
        .set({
          businessStatus: "pending_review",
          processingStatus: "review_required",
          updatedAt: new Date(),
        })
        .where(and(eq(documents.tenantId, ctx.tenantId), eq(documents.id, documentId)))
        .returning({ id: documents.id });
      if (rows.length === 0) return errResult("Dokument nenalezen nebo nepatří do tohoto workspace.");
      return okResult(documentId, "document", ["Stav nastaven na kontrolu — dokončete review v UI dokumentů."]);
    } catch (e) {
      return safeErr(e, "triggerDocumentReview");
    }
  });

  registerWriteAdapter("createClientRequest", async (params, ctx) => {
    try {
      const auth = await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const domain = productDomainFromParams(params);
      const caseType = domain ? caseTypeForProductDomain(domain as never) : strParam(params, "caseType") ?? "jiné";
      const subject = canonicalClientRequestSubject({
        productDomain: typeof domain === "string" ? domain : null,
        existingSubject: strParam(params, "subject"),
        taskTitle: strParam(params, "taskTitle"),
      });
      const description = strParam(params, "description") ?? strParam(params, "noteContent");
      const res = await createAdvisorClientRequest({
        tenantId: ctx.tenantId,
        userId: auth.userId,
        contactId,
        caseType,
        subject,
        description: description ?? null,
        advisorCreated: true,
      });
      if (!res.ok) return errResult(res.error);
      return okResult(res.id, "opportunity", ["Vytvořen záznam typu klientský požadavek (obchod v pipeline)."]);
    } catch (e) {
      return safeErr(e, "createClientRequest");
    }
  });

  registerWriteAdapter("updateClientRequest", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const opportunityId = strParam(params, "opportunityId");
      if (!opportunityId) return errResult("Chybí opportunityId (klientský požadavek = obchod).");
      const [existing] = await db
        .select({ customFields: opportunities.customFields, caseType: opportunities.caseType })
        .from(opportunities)
        .where(and(eq(opportunities.tenantId, ctx.tenantId), eq(opportunities.id, opportunityId)))
        .limit(1);
      if (!existing) return errResult("Obchod nebyl nalezen.");
      const prev = (existing.customFields as Record<string, unknown> | null) ?? {};
      const isPortalRequest =
        prev.client_portal_request === true || prev.client_portal_request === "true";
      if (!isPortalRequest) {
        return errResult(
          "Tato operace je povolena pouze pro klientské požadavky (client_portal_request). Cílový záznam není klientský požadavek — je to obchod nebo servisní případ.",
        );
      }
      const merged: Record<string, unknown> = { ...prev };
      if (strParam(params, "subject")) merged.client_request_subject = strParam(params, "subject");
      if (strParam(params, "description")) merged.client_description = strParam(params, "description");
      await updateOpportunityAction(opportunityId, {
        customFields: merged,
        title: strParam(params, "title"),
      });
      return okResult(opportunityId, "opportunity");
    } catch (e) {
      return safeErr(e, "updateClientRequest");
    }
  });

  registerWriteAdapter("createMaterialRequest", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const domain = productDomainFromParams(params);
      const title = canonicalMaterialRequestTitle({
        productDomain: typeof domain === "string" ? domain : null,
        existingTitle: strParam(params, "title"),
        taskTitle: strParam(params, "taskTitle"),
      });
      const category = strParam(params, "materialCategory") ?? "ostatni";
      const res = await createAdvisorMaterialRequest({
        contactId,
        category,
        title,
        description: strParam(params, "description") ?? strParam(params, "noteContent"),
        opportunityId: strParam(params, "opportunityId") ?? null,
      });
      if (!res.ok) return errResult(res.error);
      return okResult(res.id, "advisor_material_request");
    } catch (e) {
      return safeErr(e, "createMaterialRequest");
    }
  });

  registerWriteAdapter("publishPortfolioItem", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contractId = strParam(params, "contractId");
      if (!contractId) return errResult("Chybí contractId.");
      await approveContractForClientPortal(contractId);
      return okResult(contractId, "contract");
    } catch (e) {
      return safeErr(e, "publishPortfolioItem");
    }
  });

  registerWriteAdapter("updatePortfolioItem", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contractId = strParam(params, "contractId");
      if (!contractId) return errResult("Chybí contractId.");
      await updateContract(contractId, {
        visibleToClient: params.visibleToClient === true ? true : params.visibleToClient === false ? false : undefined,
        portfolioStatus: strParam(params, "portfolioStatus"),
        note: strParam(params, "note"),
      });
      return okResult(contractId, "contract");
    } catch (e) {
      return safeErr(e, "updatePortfolioItem");
    }
  });

  registerWriteAdapter("createReminder", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const title = canonicalTaskTitle({
        action: "createReminder",
        productDomain: strParam(params, "productDomain"),
        existingTitle: strParam(params, "taskTitle") ?? strParam(params, "title"),
      });
      const due =
        strParam(params, "resolvedDate") ??
        (typeof params.dueDate === "string" ? params.dueDate : undefined) ??
        new Date().toISOString().slice(0, 10);
      const id = await createTaskAction({
        title,
        contactId,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : new Date().toISOString().slice(0, 10),
      });
      if (!id) return errResult("Připomínka (úkol) se nepodařila.");
      return okResult(id, "task", ["Připomínka uložena jako úkol s termínem."]);
    } catch (e) {
      return safeErr(e, "createReminder");
    }
  });

  registerWriteAdapter("draftEmail", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const row = await createDraft({
        contactId,
        draftType: "email",
        subject: strParam(params, "subject") ?? "Koncept zprávy",
        body: strParam(params, "noteContent") ?? strParam(params, "body") ?? "",
        metadata: { source: "assistant" },
      });
      return okResult(String(row.id), "communication_draft");
    } catch (e) {
      return safeErr(e, "draftEmail");
    }
  });

  registerWriteAdapter("draftClientPortalMessage", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const body = canonicalPortalMessageTemplate({
        productDomain: productDomainFromParams(params),
        existingBody: strParam(params, "noteContent") ?? strParam(params, "body"),
      });
      const row = await createDraft({
        contactId,
        draftType: "client_portal",
        subject: strParam(params, "subject") ?? "Zpráva klientovi",
        body,
        metadata: { source: "assistant" },
      });
      return okResult(String(row.id), "communication_draft");
    } catch (e) {
      return safeErr(e, "draftClientPortalMessage");
    }
  });

  registerWriteAdapter("sendPortalMessage", async (params, ctx) => {
    try {
      const contactId = strParam(params, "contactId");
      const rawBody = strParam(params, "portalMessageBody") ?? strParam(params, "noteContent");
      const body = canonicalPortalMessageTemplate({
        productDomain: productDomainFromParams(params),
        existingBody: rawBody,
      }) || rawBody;
      if (!contactId) return requiresInputResult("Chybí ID klienta (contactId). Vyberte klienta nebo zadejte kontext.");
      if (!body) return requiresInputResult("Chybí text portálové zprávy. Doplňte obsah zprávy.");
      await assertCtx(ctx);
      const id = await sendMessage(contactId, body);
      if (!id) return errResult("Zprávu se nepodařilo odeslat — databáze nevrátila ID.", true);
      return okResult(id, "message");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "Forbidden") return errResult("Nedostatečná oprávnění pro odeslání zprávy.", false);
      if (msg === "Prázdná zpráva") return requiresInputResult("Text zprávy je prázdný. Doplňte obsah.");
      if (msg.includes("Nesoulad")) return errResult("Bezpečnostní nesoulad — ověřte přihlášení.", false);
      return errResult(mapErrorForAdvisor(msg, "sendPortalMessage", "sendPortalMessage"), true);
    }
  });

  registerWriteAdapter("approveAiContractReview", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const reviewId = strParam(params, "reviewId");
      if (!reviewId) return errResult("Chybí reviewId (AI kontrola smlouvy).");
      const res = await approveContractReview(reviewId);
      if (!res.ok) return errResult(res.error);
      return okResult(reviewId, "contract_review");
    } catch (e) {
      return safeErr(e, "approveAiContractReview");
    }
  });

  registerWriteAdapter("applyAiContractReviewToCrm", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const reviewId = strParam(params, "reviewId");
      if (!reviewId) return errResult("Chybí reviewId.");
      const res = await applyContractReviewDrafts(reviewId);
      if (!res.ok) return errResult(res.error);
      return okResult(reviewId, "contract_review", ["Schválená kontrola zapsána do CRM."]);
    } catch (e) {
      return safeErr(e, "applyAiContractReviewToCrm");
    }
  });

  registerWriteAdapter("linkAiContractReviewToDocuments", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const reviewId = strParam(params, "reviewId");
      if (!reviewId) return errResult("Chybí reviewId.");
      const visible = params.visibleToClient === true;
      const res = await linkContractReviewFileToContactDocuments(reviewId, { visibleToClient: visible });
      if (!res.ok) return errResult(res.error);
      const docId = res.documentId ?? reviewId;
      return okResult(docId, "document", visible ? ["Dokument je u klienta viditelný v portálu."] : []);
    } catch (e) {
      return safeErr(e, "linkAiContractReviewToDocuments");
    }
  });

  registerWriteAdapter("setDocumentVisibleToClient", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const documentId = strParam(params, "documentId");
      if (!documentId) return errResult("Chybí documentId.");
      const hide = params.visibleToClient === false || strParam(params, "visibleToClient") === "false";
      await updateDocumentVisibleToClient(documentId, !hide);
      return okResult(documentId, "document");
    } catch (e) {
      return safeErr(e, "setDocumentVisibleToClient");
    }
  });

  registerWriteAdapter("linkDocumentToMaterialRequest", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const requestId = strParam(params, "materialRequestId");
      const documentId = strParam(params, "documentId");
      if (!requestId || !documentId) return errResult("Chybí materialRequestId nebo documentId.");
      const hide = params.visibleToClient === false || strParam(params, "visibleToClient") === "false";
      const res = await linkMaterialRequestDocumentToClientVault(requestId, documentId, {
        visibleToClient: !hide,
      });
      if (!res.ok) return errResult(res.error);
      return okResult(documentId, "document");
    } catch (e) {
      return safeErr(e, "linkDocumentToMaterialRequest");
    }
  });

  registerWriteAdapter("createClientPortalNotification", async (params, ctx) => {
    try {
      const { tenantId } = await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      const title = strParam(params, "portalNotificationTitle");
      const body = strParam(params, "portalNotificationBody") ?? null;
      if (!contactId || !title) return errResult("Chybí contactId nebo nadpis notifikace.");
      const allowed = new Set([
        "new_message",
        "request_status_change",
        "new_document",
        "important_date",
        "advisor_material_request",
      ]);
      const typeRaw = strParam(params, "portalNotificationType") ?? "new_message";
      const type = allowed.has(typeRaw)
        ? (typeRaw as
            | "new_message"
            | "request_status_change"
            | "new_document"
            | "important_date"
            | "advisor_material_request")
        : "new_message";
      await createPortalNotification({
        tenantId,
        contactId,
        type,
        title,
        body,
        relatedEntityType: strParam(params, "relatedEntityType") ?? null,
        relatedEntityId: strParam(params, "relatedEntityId") ?? null,
      });
      return okResult(contactId, "portal_notification");
    } catch (e) {
      return safeErr(e, "createClientPortalNotification");
    }
  });

  registerWriteAdapter("createContract", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");

      let segment = strParam(params, "segment");
      if (!segment) {
        const domain = productDomainFromParams(params) as ProductDomain | null;
        if (domain) segment = PRODUCT_DOMAIN_DEFAULT_SEGMENT[domain] ?? undefined;
      }
      if (!segment) {
        const hint = strParam(params, "purpose") ?? strParam(params, "productDomain");
        if (hint) segment = resolveContractSegmentFromUserText(hint) ?? undefined;
      }
      if (!segment || !contractSegments.includes(segment as (typeof contractSegments)[number])) {
        return requiresInputResult(
          `Neplatný nebo chybějící segment smlouvy${segment ? ` („${segment}")` : ""}. ` +
          `Platné segmenty: ${contractSegments.join(", ")}.`,
        );
      }

      const warnings: string[] = [];
      const partnerName = strParam(params, "partnerName");
      const productName = strParam(params, "productName");

      if (partnerName) {
        const partnerErr = validatePartnerInCatalog(partnerName, segment);
        if (partnerErr) warnings.push(partnerErr);
      }
      if (partnerName && productName) {
        const productErr = validateProductInCatalog(partnerName, productName, segment);
        if (productErr) warnings.push(productErr);
      }

      const premium = strParam(params, "premiumAmount")
        ?? (typeof params.premium === "number" ? String(params.premium) : undefined);

      const res = await createContractAction(contactId, {
        segment,
        partnerName: partnerName ?? undefined,
        productName: productName ?? undefined,
        premiumAmount: premium,
        contractNumber: strParam(params, "contractNumber"),
        startDate: strParam(params, "startDate") ?? strParam(params, "resolvedDate"),
        note: strParam(params, "noteContent") ?? strParam(params, "note"),
      });
      if (!res.ok) return errResult(res.message);
      return okResult(res.id!, "contract", warnings);
    } catch (e) {
      return safeErr(e, "createContract");
    }
  });

  registerWriteAdapter("upsertContactCoverage", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      const itemKey = strParam(params, "itemKey") ?? strParam(params, "coverageItemKey");
      if (!contactId) return errResult("Chybí contactId.");
      if (!itemKey) return errResult("Chybí položka pokrytí (itemKey). Upřesněte produkt (např. ODP, POV, životní pojištění).");

      const rawStatus =
        strParam(params, "status") ?? strParam(params, "coverageStatus") ?? "done";
      const status = normalizeCoverageStatus(rawStatus);

      const res = await upsertCoverageItem(contactId, itemKey, {
        status,
        notes: strParam(params, "noteContent") ?? strParam(params, "notes") ?? null,
        linkedContractId: strParam(params, "linkedContractId") ?? null,
        linkedOpportunityId: strParam(params, "linkedOpportunityId") ?? null,
      });
      if (!res.ok) return errResult(res.message);
      return okResult(itemKey, "coverage_item", []);
    } catch (e) {
      return safeErr(e, "upsertContactCoverage");
    }
  });
}
