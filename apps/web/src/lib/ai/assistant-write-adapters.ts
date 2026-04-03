/**
 * Phase 3: verified write adapters — delegate to server actions + DB with auth checks.
 * Registered with assistant-execution-engine on load.
 */

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";
import { db, documents, opportunities, opportunityStages, eq, and, asc } from "db";
import type { ExecutionStepResult } from "./assistant-domain-model";
import type { ExecutionContext } from "./assistant-execution-engine";
import { registerWriteAdapter } from "./assistant-execution-engine";
import { caseTypeForProductDomain, opportunityTitleFromSlots } from "./assistant-case-type-map";
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
import { approveContractForClientPortal, updateContract } from "@/app/actions/contracts";
import { sendMessage } from "@/app/actions/messages";

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

function errResult(error: string): ExecutionStepResult {
  return { ok: false, outcome: "failed", entityId: null, entityType: null, warnings: [], error };
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
        });
      const id = await createOpportunityAction({
        title,
        caseType,
        contactId,
        stageId,
        expectedValue: strParam(params, "expectedValue") ?? (typeof params.amount === "number" ? String(params.amount) : undefined),
        expectedCloseDate: strParam(params, "expectedCloseDate"),
      });
      if (!id) return errResult("Obchod se nepodařilo vytvořit.");
      return okResult(id, "opportunity");
    } catch (e) {
      return errResult(e instanceof Error ? e.message : "Chyba při vytváření obchodu.");
    }
  });

  registerWriteAdapter("updateOpportunity", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const opportunityId = strParam(params, "opportunityId");
      if (!opportunityId) return errResult("Chybí opportunityId.");
      const patch: Parameters<typeof updateOpportunityAction>[1] = {};
      if (strParam(params, "title")) patch.title = strParam(params, "title");
      if (strParam(params, "caseType")) patch.caseType = strParam(params, "caseType");
      if (productDomainFromParams(params)) patch.caseType = caseTypeForProductDomain(productDomainFromParams(params) as never);
      if (params.customFields && typeof params.customFields === "object") {
        patch.customFields = params.customFields as Record<string, unknown>;
      }
      if (strParam(params, "stageId")) patch.stageId = strParam(params, "stageId");
      await updateOpportunityAction(opportunityId, patch);
      return okResult(opportunityId, "opportunity");
    } catch (e) {
      return errResult(e instanceof Error ? e.message : "Chyba při úpravě obchodu.");
    }
  });

  registerWriteAdapter("createTask", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const title = strParam(params, "taskTitle") ?? strParam(params, "title") ?? "Úkol";
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
      return errResult(e instanceof Error ? e.message : "Chyba při vytváření úkolu.");
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
      return errResult(e instanceof Error ? e.message : "Chyba při úpravě úkolu.");
    }
  });

  registerWriteAdapter("createFollowUp", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const title = strParam(params, "taskTitle") ?? strParam(params, "title") ?? "Follow-up";
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
      return errResult(e instanceof Error ? e.message : "Chyba při follow-up.");
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
      const title = strParam(params, "title") ?? strParam(params, "taskTitle") ?? "Schůzka";
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
      return errResult(e instanceof Error ? e.message : "Chyba při plánování události.");
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
      return errResult(e instanceof Error ? e.message : "Chyba při zápisu ze schůzky.");
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
      return errResult(e instanceof Error ? e.message : "Chyba při doplnění zápisu.");
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
      return errResult(e instanceof Error ? e.message : "Chyba interní poznámky.");
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
      return errResult(e instanceof Error ? e.message : "Chyba při vazbě dokumentu.");
    }
  });

  registerWriteAdapter("attachDocumentToOpportunity", async (params, ctx) => {
    try {
      await assertDocumentWrite(ctx);
      const documentId = strParam(params, "documentId");
      const opportunityId = strParam(params, "opportunityId");
      if (!documentId || !opportunityId) return errResult("Chybí documentId nebo opportunityId.");
      const rows = await db
        .update(documents)
        .set({ opportunityId, updatedAt: new Date() })
        .where(and(eq(documents.tenantId, ctx.tenantId), eq(documents.id, documentId)))
        .returning({ id: documents.id });
      if (rows.length === 0) return errResult("Dokument nenalezen nebo nepatří do tohoto workspace.");
      return okResult(documentId, "document");
    } catch (e) {
      return errResult(e instanceof Error ? e.message : "Chyba při vazbě dokumentu k obchodu.");
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
      return errResult(e instanceof Error ? e.message : "Chyba klasifikace dokumentu.");
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
      return errResult(e instanceof Error ? e.message : "Chyba při označení dokumentu.");
    }
  });

  registerWriteAdapter("createClientRequest", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const stageId = await firstPipelineStageId(ctx.tenantId);
      if (!stageId) return errResult("Chybí pipeline.");
      const domain = productDomainFromParams(params);
      const caseType = domain ? caseTypeForProductDomain(domain as never) : strParam(params, "caseType") ?? "jiné";
      const subject = strParam(params, "subject") ?? strParam(params, "taskTitle") ?? "Požadavek klienta";
      const description = strParam(params, "description") ?? strParam(params, "noteContent");
      const id = await createOpportunityAction({
        title: subject,
        caseType,
        contactId,
        stageId,
      });
      if (!id) return errResult("Požadavek se nepodařil vytvořit.");
      await updateOpportunityAction(id, {
        customFields: {
          client_portal_request: true,
          client_request_subject: subject,
          client_description: description ?? null,
          advisor_created_request: true,
        },
      });
      return okResult(id, "opportunity", ["Vytvořen záznam typu klientský požadavek (obchod v pipeline)."]);
    } catch (e) {
      return errResult(e instanceof Error ? e.message : "Chyba při vytvoření požadavku.");
    }
  });

  registerWriteAdapter("updateClientRequest", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const opportunityId = strParam(params, "opportunityId");
      if (!opportunityId) return errResult("Chybí opportunityId (klientský požadavek = obchod).");
      const [existing] = await db
        .select({ customFields: opportunities.customFields })
        .from(opportunities)
        .where(and(eq(opportunities.tenantId, ctx.tenantId), eq(opportunities.id, opportunityId)))
        .limit(1);
      const prev = (existing?.customFields as Record<string, unknown> | null) ?? {};
      const merged: Record<string, unknown> = { ...prev };
      if (strParam(params, "subject")) merged.client_request_subject = strParam(params, "subject");
      if (strParam(params, "description")) merged.client_description = strParam(params, "description");
      await updateOpportunityAction(opportunityId, {
        customFields: merged,
        title: strParam(params, "title"),
      });
      return okResult(opportunityId, "opportunity");
    } catch (e) {
      return errResult(e instanceof Error ? e.message : "Chyba při úpravě požadavku.");
    }
  });

  registerWriteAdapter("createMaterialRequest", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const title = strParam(params, "taskTitle") ?? strParam(params, "title") ?? "Podklady od klienta";
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
      return errResult(e instanceof Error ? e.message : "Chyba materiálového požadavku.");
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
      return errResult(e instanceof Error ? e.message : "Chyba publikace do portfolia.");
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
      return errResult(e instanceof Error ? e.message : "Chyba úpravy portfolia.");
    }
  });

  registerWriteAdapter("createReminder", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const title = `Připomínka: ${strParam(params, "taskTitle") ?? strParam(params, "title") ?? "termín"}`;
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
      return errResult(e instanceof Error ? e.message : "Chyba připomínky.");
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
      return errResult(e instanceof Error ? e.message : "Chyba konceptu e-mailu.");
    }
  });

  registerWriteAdapter("draftClientPortalMessage", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      if (!contactId) return errResult("Chybí contactId.");
      const row = await createDraft({
        contactId,
        draftType: "client_portal",
        subject: strParam(params, "subject") ?? "Zpráva klientovi",
        body: strParam(params, "noteContent") ?? strParam(params, "body") ?? "",
        metadata: { source: "assistant" },
      });
      return okResult(String(row.id), "communication_draft");
    } catch (e) {
      return errResult(e instanceof Error ? e.message : "Chyba konceptu zprávy.");
    }
  });

  registerWriteAdapter("sendPortalMessage", async (params, ctx) => {
    try {
      await assertCtx(ctx);
      const contactId = strParam(params, "contactId");
      const body = strParam(params, "portalMessageBody") ?? strParam(params, "noteContent");
      if (!contactId || !body) return errResult("Chybí contactId nebo text zprávy.");
      const id = await sendMessage(contactId, body);
      if (!id) return errResult("Zprávu se nepodařilo odeslat.");
      return okResult(id, "message");
    } catch (e) {
      return errResult(e instanceof Error ? e.message : "Chyba odeslání zprávy.");
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
      return errResult(e instanceof Error ? e.message : "Chyba schválení kontroly.");
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
      return errResult(e instanceof Error ? e.message : "Chyba aplikace kontroly.");
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
      return errResult(e instanceof Error ? e.message : "Chyba propojení souboru z kontroly.");
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
      return errResult(e instanceof Error ? e.message : "Chyba viditelnosti dokumentu.");
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
      return errResult(e instanceof Error ? e.message : "Chyba vazby k materiálovému požadavku.");
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
      return errResult(e instanceof Error ? e.message : "Chyba vytvoření notifikace.");
    }
  });
}
