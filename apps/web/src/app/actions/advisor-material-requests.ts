"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import {
  advisorMaterialRequests,
  advisorMaterialRequestMessages,
  advisorMaterialRequestDocuments,
  documents,
  contacts,
} from "db";
import { eq, and, desc, asc, inArray } from "db";
import { createPortalNotification } from "./portal-notifications";
import {
  captureAttachmentLinkFailure,
  captureRequestReplyFailure,
} from "@/lib/observability/portal-sentry";
import { emitNotification } from "@/lib/execution/notification-center";
import { getTargetAdvisorUserIdForContact } from "./client-dashboard";
import { notifyClientAdvisorSharedDocument } from "@/lib/documents/notify-client-visible-document";
import {
  materialRequestCategoryLabel,
  type MaterialRequestDetail,
  type MaterialRequestListItem,
} from "@/lib/advisor-material-requests/display";

export async function createAdvisorMaterialRequest(params: {
  contactId: string;
  category: string;
  title: string;
  description?: string | null;
  priority?: "low" | "normal" | "high";
  dueAt?: Date | null;
  responseMode?: "text" | "files" | "both" | "yes_no";
  opportunityId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }
  const [c] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, params.contactId)))
    .limit(1);
  if (!c) return { ok: false, error: "Kontakt nenalezen." };

  const priority = params.priority ?? "normal";
  const responseMode = params.responseMode ?? "both";
  const description = params.description?.trim() ?? null;

  const [row] = await db
    .insert(advisorMaterialRequests)
    .values({
      tenantId: auth.tenantId,
      contactId: params.contactId,
      createdByUserId: auth.userId,
      category: params.category.trim() || "ostatni",
      title: params.title.trim(),
      description,
      priority,
      dueAt: params.dueAt ?? null,
      responseMode,
      status: "new",
      opportunityId: params.opportunityId ?? null,
    })
    .returning({ id: advisorMaterialRequests.id });

  const id = row?.id;
  if (!id) return { ok: false, error: "Nepodařilo se vytvořit požadavek." };

  const initialBody =
    description && description.length > 0
      ? `${params.title.trim()}\n\n${description}`
      : params.title.trim();

  await db.insert(advisorMaterialRequestMessages).values({
    tenantId: auth.tenantId,
    requestId: id,
    authorRole: "advisor",
    authorUserId: auth.userId,
    body: initialBody,
  });

  try {
    await createPortalNotification({
      tenantId: auth.tenantId,
      contactId: params.contactId,
      type: "advisor_material_request",
      title: "Nový požadavek na podklady",
      body: initialBody,
      relatedEntityType: "advisor_material_request",
      relatedEntityId: id,
    });
  } catch {
    /* best-effort */
  }

  return { ok: true, id };
}

export async function listAdvisorMaterialRequestsForContact(
  contactId: string
): Promise<MaterialRequestListItem[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const [c] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
    .limit(1);
  if (!c) throw new Error("Kontakt nenalezen.");

  const rows = await db
    .select({
      id: advisorMaterialRequests.id,
      title: advisorMaterialRequests.title,
      category: advisorMaterialRequests.category,
      status: advisorMaterialRequests.status,
      priority: advisorMaterialRequests.priority,
      dueAt: advisorMaterialRequests.dueAt,
      createdAt: advisorMaterialRequests.createdAt,
      updatedAt: advisorMaterialRequests.updatedAt,
    })
    .from(advisorMaterialRequests)
    .where(
      and(eq(advisorMaterialRequests.tenantId, auth.tenantId), eq(advisorMaterialRequests.contactId, contactId))
    )
    .orderBy(desc(advisorMaterialRequests.updatedAt));

  return rows.map((r) => ({
    ...r,
    categoryLabel: materialRequestCategoryLabel(r.category),
  }));
}

async function buildMaterialRequestDetail(
  tenantId: string,
  requestId: string
): Promise<MaterialRequestDetail | null> {
  const [req] = await db
    .select()
    .from(advisorMaterialRequests)
    .where(and(eq(advisorMaterialRequests.tenantId, tenantId), eq(advisorMaterialRequests.id, requestId)))
    .limit(1);
  if (!req) return null;

  const msgs = await db
    .select({
      id: advisorMaterialRequestMessages.id,
      authorRole: advisorMaterialRequestMessages.authorRole,
      body: advisorMaterialRequestMessages.body,
      createdAt: advisorMaterialRequestMessages.createdAt,
    })
    .from(advisorMaterialRequestMessages)
    .where(eq(advisorMaterialRequestMessages.requestId, requestId))
    .orderBy(asc(advisorMaterialRequestMessages.createdAt));

  const docLinks = await db
    .select({
      documentId: advisorMaterialRequestDocuments.documentId,
      attachmentRole: advisorMaterialRequestDocuments.attachmentRole,
    })
    .from(advisorMaterialRequestDocuments)
    .where(eq(advisorMaterialRequestDocuments.requestId, requestId));

  const docIds = docLinks.map((d) => d.documentId);
  const docMeta =
    docIds.length === 0
      ? []
      : await db
          .select({
            id: documents.id,
            name: documents.name,
            mimeType: documents.mimeType,
            visibleToClient: documents.visibleToClient,
          })
          .from(documents)
          .where(and(eq(documents.tenantId, tenantId), inArray(documents.id, docIds)));

  const metaById = new Map(docMeta.map((d) => [d.id, d]));
  const attachments = docLinks
    .map((l) => {
      const m = metaById.get(l.documentId);
      if (!m) return null;
      return {
        documentId: m.id,
        name: m.name,
        mimeType: m.mimeType,
        attachmentRole: l.attachmentRole,
        visibleToClient: m.visibleToClient,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  return {
    id: req.id,
    title: req.title,
    category: req.category,
    categoryLabel: materialRequestCategoryLabel(req.category),
    status: req.status,
    priority: req.priority,
    dueAt: req.dueAt,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
    description: req.description,
    responseMode: req.responseMode,
    internalNote: req.internalNote,
    readByClientAt: req.readByClientAt,
    contactId: req.contactId,
    opportunityId: req.opportunityId ?? null,
    messages: msgs,
    attachments,
  };
}

export async function getAdvisorMaterialRequestDetail(
  requestId: string
): Promise<MaterialRequestDetail | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  return buildMaterialRequestDetail(auth.tenantId, requestId);
}

export async function updateAdvisorMaterialRequestInternalNote(
  requestId: string,
  internalNote: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) return { ok: false, error: "Forbidden" };
  const [row] = await db
    .select({ id: advisorMaterialRequests.id })
    .from(advisorMaterialRequests)
    .where(and(eq(advisorMaterialRequests.tenantId, auth.tenantId), eq(advisorMaterialRequests.id, requestId)))
    .limit(1);
  if (!row) return { ok: false, error: "Nenalezeno." };
  await db
    .update(advisorMaterialRequests)
    .set({ internalNote: internalNote?.trim() || null, updatedAt: new Date() })
    .where(eq(advisorMaterialRequests.id, requestId));
  return { ok: true };
}

export async function setAdvisorMaterialRequestStatus(
  requestId: string,
  status: "new" | "seen" | "answered" | "needs_more" | "done" | "closed"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) return { ok: false, error: "Forbidden" };
  const [row] = await db
    .select({ id: advisorMaterialRequests.id })
    .from(advisorMaterialRequests)
    .where(and(eq(advisorMaterialRequests.tenantId, auth.tenantId), eq(advisorMaterialRequests.id, requestId)))
    .limit(1);
  if (!row) return { ok: false, error: "Nenalezeno." };
  const [prev] = await db
    .select({
      contactId: advisorMaterialRequests.contactId,
      status: advisorMaterialRequests.status,
    })
    .from(advisorMaterialRequests)
    .where(eq(advisorMaterialRequests.id, requestId))
    .limit(1);

  await db
    .update(advisorMaterialRequests)
    .set({
      status,
      closedAt: status === "closed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(advisorMaterialRequests.id, requestId));

  // 5B: Notify client when advisor resolves or closes the request
  if (prev && (status === "done" || status === "closed") && prev.status !== status) {
    try {
      await createPortalNotification({
        tenantId: auth.tenantId,
        contactId: prev.contactId,
        type: "advisor_material_request",
        title: status === "done" ? "Požadavek splněn" : "Požadavek uzavřen",
        body: status === "done"
          ? "Poradce označil váš požadavek na podklady jako splněný."
          : "Poradce uzavřel požadavek na podklady.",
        relatedEntityType: "advisor_material_request",
        relatedEntityId: requestId,
      });
    } catch {
      /* best-effort */
    }
  }

  return { ok: true };
}

export async function addAdvisorMaterialRequestReply(
  requestId: string,
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) return { ok: false, error: "Forbidden" };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Zadejte text." };
  const [req] = await db
    .select({ id: advisorMaterialRequests.id, contactId: advisorMaterialRequests.contactId })
    .from(advisorMaterialRequests)
    .where(and(eq(advisorMaterialRequests.tenantId, auth.tenantId), eq(advisorMaterialRequests.id, requestId)))
    .limit(1);
  if (!req) return { ok: false, error: "Nenalezeno." };

  await db.insert(advisorMaterialRequestMessages).values({
    tenantId: auth.tenantId,
    requestId,
    authorRole: "advisor",
    authorUserId: auth.userId,
    body: trimmed,
  });
  await db
    .update(advisorMaterialRequests)
    .set({ status: "needs_more", updatedAt: new Date() })
    .where(eq(advisorMaterialRequests.id, requestId));

  try {
    await createPortalNotification({
      tenantId: auth.tenantId,
      contactId: req.contactId,
      type: "advisor_material_request",
      title: "Doplňující informace od poradce",
      body: trimmed.slice(0, 280),
      relatedEntityType: "advisor_material_request",
      relatedEntityId: requestId,
    });
  } catch {
    /* best-effort */
  }

  return { ok: true };
}

export async function linkMaterialRequestDocumentToClientVault(
  requestId: string,
  documentId: string,
  options?: { visibleToClient?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) return { ok: false, error: "Forbidden" };
  const [req] = await db
    .select({
      id: advisorMaterialRequests.id,
      contactId: advisorMaterialRequests.contactId,
    })
    .from(advisorMaterialRequests)
    .where(and(eq(advisorMaterialRequests.tenantId, auth.tenantId), eq(advisorMaterialRequests.id, requestId)))
    .limit(1);
  if (!req) return { ok: false, error: "Požadavek nenalezen." };

  const [doc] = await db
    .select({
      id: documents.id,
      contactId: documents.contactId,
      name: documents.name,
      visibleToClient: documents.visibleToClient,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.id, documentId)))
    .limit(1);
  if (!doc || doc.contactId !== req.contactId) {
    return { ok: false, error: "Dokument nepatří k tomuto klientovi." };
  }

  const visible = options?.visibleToClient ?? true;
  await db
    .update(documents)
    .set({ visibleToClient: visible, updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  if (visible && req.contactId) {
    try {
      await notifyClientAdvisorSharedDocument({
        tenantId: auth.tenantId,
        contactId: req.contactId,
        documentId,
        documentName: doc.name,
        reason: "visibility_on",
      });
    } catch {
      /* best-effort */
    }
  }

  return { ok: true };
}

/** Klient: seznam požadavků */
export async function listClientMaterialRequests(): Promise<MaterialRequestListItem[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) throw new Error("Forbidden");

  const rows = await db
    .select({
      id: advisorMaterialRequests.id,
      title: advisorMaterialRequests.title,
      category: advisorMaterialRequests.category,
      status: advisorMaterialRequests.status,
      priority: advisorMaterialRequests.priority,
      dueAt: advisorMaterialRequests.dueAt,
      createdAt: advisorMaterialRequests.createdAt,
      updatedAt: advisorMaterialRequests.updatedAt,
    })
    .from(advisorMaterialRequests)
    .where(
      and(
        eq(advisorMaterialRequests.tenantId, auth.tenantId),
        eq(advisorMaterialRequests.contactId, auth.contactId)
      )
    )
    .orderBy(desc(advisorMaterialRequests.updatedAt));

  return rows.map((r) => ({
    ...r,
    categoryLabel: materialRequestCategoryLabel(r.category),
  }));
}

export async function getClientMaterialRequestDetail(requestId: string): Promise<MaterialRequestDetail | null> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) throw new Error("Forbidden");

  const [req] = await db
    .select()
    .from(advisorMaterialRequests)
    .where(
      and(
        eq(advisorMaterialRequests.tenantId, auth.tenantId),
        eq(advisorMaterialRequests.id, requestId),
        eq(advisorMaterialRequests.contactId, auth.contactId)
      )
    )
    .limit(1);
  if (!req) return null;

  if (!req.readByClientAt) {
    await db
      .update(advisorMaterialRequests)
      .set({
        readByClientAt: new Date(),
        status: req.status === "new" ? "seen" : req.status,
        updatedAt: new Date(),
      })
      .where(eq(advisorMaterialRequests.id, requestId));
  }

  const detail = await buildMaterialRequestDetail(auth.tenantId, requestId);
  if (detail) {
    detail.internalNote = null;
  }
  return detail;
}

export async function respondClientMaterialRequest(
  requestId: string,
  message: string,
  formDataFiles?: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) return { ok: false, error: "Forbidden" };
  const trimmed = message.trim();
  const files = formDataFiles?.getAll("files").filter((f): f is File => f instanceof File && f.size > 0) ?? [];
  if (!trimmed && files.length === 0) {
    return { ok: false, error: "Napište odpověď nebo přiložte soubor." };
  }

  const [req] = await db
    .select({
      id: advisorMaterialRequests.id,
      contactId: advisorMaterialRequests.contactId,
      tenantId: advisorMaterialRequests.tenantId,
      status: advisorMaterialRequests.status,
    })
    .from(advisorMaterialRequests)
    .where(
      and(
        eq(advisorMaterialRequests.tenantId, auth.tenantId),
        eq(advisorMaterialRequests.id, requestId),
        eq(advisorMaterialRequests.contactId, auth.contactId)
      )
    )
    .limit(1);
  if (!req) return { ok: false, error: "Požadavek nenalezen." };
  if (req.status === "closed" || req.status === "done") {
    captureRequestReplyFailure({
      tenantId: auth.tenantId,
      contactId: auth.contactId,
      requestId,
      reason: `respondClientMaterialRequest: request status="${req.status}" is terminal`,
    });
    return { ok: false, error: "Požadavek je uzavřen a nelze na něj odpovídat." };
  }

  if (trimmed.length > 0) {
    await db.insert(advisorMaterialRequestMessages).values({
      tenantId: auth.tenantId,
      requestId,
      authorRole: "client",
      authorUserId: auth.userId,
      body: trimmed,
    });
  }

  const { clientUploadDocument } = await import("./documents");
  for (const file of files) {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", file.name);
    try {
      const res = await clientUploadDocument(fd);
      if (res.success && res.id) {
        await db.insert(advisorMaterialRequestDocuments).values({
          tenantId: auth.tenantId,
          requestId,
          documentId: res.id,
          attachmentRole: "client",
        });
      }
    } catch (e) {
      captureAttachmentLinkFailure({
        tenantId: auth.tenantId,
        requestId,
        reason: e instanceof Error ? e.message : "Nahrání souboru selhalo.",
        error: e,
      });
      return { ok: false, error: e instanceof Error ? e.message : "Nahrání souboru selhalo." };
    }
  }

  await db
    .update(advisorMaterialRequests)
    .set({
      status: "answered",
      updatedAt: new Date(),
    })
    .where(eq(advisorMaterialRequests.id, requestId));

  const advisorUserId = await getTargetAdvisorUserIdForContact(req.tenantId, req.contactId);
  if (advisorUserId) {
    const [cn] = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(eq(contacts.id, req.contactId))
      .limit(1);
    const clientName = cn
      ? [cn.firstName, cn.lastName].filter(Boolean).join(" ").trim() || "Klient"
      : "Klient";
    try {
      await emitNotification({
        tenantId: req.tenantId,
        type: "client_material_response",
        title: clientName,
        body: JSON.stringify({
          contactId: req.contactId,
          requestId,
          preview: trimmed || (files.length ? `Přílohy: ${files.length}× soubor` : ""),
        }),
        severity: "info",
        targetUserId: advisorUserId,
        channels: ["in_app"],
        relatedEntityType: "advisor_material_request",
        relatedEntityId: requestId,
      });
    } catch {
      /* best-effort */
    }
  }

  return { ok: true };
}
