"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { documents, contacts, contracts } from "db";
import { eq, and, desc, inArray } from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "./activity";
import { logAudit } from "@/lib/audit";
import { notifyClientAdvisorSharedDocument } from "@/lib/documents/notify-client-visible-document";
import { notifyAdvisorClientTrezorUpload } from "@/lib/client-portal/notify-advisor-client-self-service";

export type DocumentRow = {
  id: string;
  name: string;
  mimeType: string | null;
  tags: string[] | null;
  contactId: string | null;
  contractId: string | null;
  visibleToClient: boolean | null;
  createdAt: Date;
  uploadSource: string | null;
  processingStatus: string | null;
  processingStage: string | null;
  aiInputSource: string | null;
  pageCount: number | null;
  isScanLike: boolean | null;
  /** Velikost souboru v bytech (DB `size_bytes`). */
  sizeBytes: number | null;
};

const documentSelectFields = {
  id: documents.id,
  name: documents.name,
  mimeType: documents.mimeType,
  tags: documents.tags,
  contactId: documents.contactId,
  contractId: documents.contractId,
  visibleToClient: documents.visibleToClient,
  createdAt: documents.createdAt,
  uploadSource: documents.uploadSource,
  processingStatus: documents.processingStatus,
  processingStage: documents.processingStage,
  aiInputSource: documents.aiInputSource,
  pageCount: documents.pageCount,
  isScanLike: documents.isScanLike,
  sizeBytes: documents.sizeBytes,
} as const;

export async function listDocuments(): Promise<(DocumentRow & { contactName?: string | null })[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:read")) throw new Error("Forbidden");
  try {
    const rows = await db
      .select({
        ...documentSelectFields,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(documents)
      .leftJoin(contacts, eq(documents.contactId, contacts.id))
      .where(eq(documents.tenantId, auth.tenantId))
      .orderBy(desc(documents.createdAt))
      .limit(200);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      mimeType: r.mimeType,
      tags: r.tags,
      contactId: r.contactId,
      contractId: r.contractId,
      visibleToClient: r.visibleToClient,
      createdAt: r.createdAt,
      uploadSource: r.uploadSource,
      processingStatus: r.processingStatus,
      processingStage: r.processingStage,
      aiInputSource: r.aiInputSource,
      pageCount: r.pageCount,
      isScanLike: r.isScanLike,
      sizeBytes: r.sizeBytes ?? null,
      contactName: r.contactFirstName && r.contactLastName
        ? `${r.contactFirstName} ${r.contactLastName}`
        : r.contactFirstName || r.contactLastName || null,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const likelySchemaDrift =
      msg.includes("does not exist") || msg.includes("column") || msg.includes("42703");
    console.error("[listDocuments] query failed:", err);
    if (likelySchemaDrift) {
      console.error("[listDocuments] Pravděpodobně chybí migrace tabulky documents — viz pnpm db:verify-documents-schema a OPS_RUNBOOK.");
      return [];
    }
    throw err;
  }
}

export async function getDocumentsForContact(contactId: string): Promise<DocumentRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:read")) throw new Error("Forbidden");
  const rows = await db
    .select(documentSelectFields)
    .from(documents)
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.contactId, contactId)));
  return rows;
}

export async function getDocumentsForOpportunity(opportunityId: string): Promise<DocumentRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:read")) throw new Error("Forbidden");
  const rows = await db
    .select(documentSelectFields)
    .from(documents)
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.opportunityId, opportunityId)));
  return rows;
}

/** Pro Client Zone – jen dokumenty s visibleToClient true. */
export async function getDocumentsForClient(contactId: string): Promise<DocumentRow[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId || auth.contactId !== contactId) throw new Error("Forbidden");
  const rows = await db
    .select(documentSelectFields)
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, auth.tenantId),
        eq(documents.contactId, contactId),
        eq(documents.visibleToClient, true)
      )
    );
  return rows;
}

/** Pro Moje portfolio (klient): jen názvy dokumentů, které jsou u kontaktu a sdílené do portálu. */
export async function getClientVisiblePortfolioDocumentNames(
  contactId: string,
  documentIds: string[]
): Promise<Record<string, { name: string }>> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId || auth.contactId !== contactId) throw new Error("Forbidden");
  const uniq = [...new Set(documentIds.filter(Boolean))];
  if (uniq.length === 0) return {};
  const rows = await db
    .select({ id: documents.id, name: documents.name })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, auth.tenantId),
        eq(documents.contactId, contactId),
        eq(documents.visibleToClient, true),
        inArray(documents.id, uniq)
      )
    );
  const out: Record<string, { name: string }> = {};
  for (const r of rows) out[r.id] = { name: r.name };
  return out;
}

export async function uploadDocument(
  contactId: string,
  formData: FormData,
  options: {
    contractId?: string;
    visibleToClient?: boolean;
    tags?: string[];
    opportunityId?: string;
    uploadSource?: "web" | "mobile_camera" | "mobile_gallery" | "mobile_file";
  }
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) throw new Error("Forbidden");
  const file = formData.get("file") as File | null;
  if (!file?.size) throw new Error("Vyberte soubor");
  const name = formData.get("name") as string || file.name;
  const pathPrefix = contactId || options.opportunityId || "misc";
  const path = `${auth.tenantId}/${pathPrefix}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("documents").upload(path, file, { upsert: false });
  if (uploadError) {
    const msg = uploadError.message?.toLowerCase().includes("bucket") || uploadError.message?.toLowerCase().includes("not found")
      ? "Úložiště dokumentů není nastavené. V Supabase Dashboard → Storage vytvořte bucket „documents“."
      : uploadError.message;
    throw new Error(msg);
  }
  const [row] = await db
    .insert(documents)
    .values({
      tenantId: auth.tenantId,
      contactId: contactId || null,
      contractId: options.contractId || null,
      opportunityId: options.opportunityId || null,
      name,
      storagePath: path,
      tags: options.tags?.length ? options.tags : null,
      mimeType: file.type || null,
      sizeBytes: file.size,
      visibleToClient: options.visibleToClient ?? false,
      uploadSource: options.uploadSource ?? "web",
      uploadedBy: auth.userId,
    })
    .returning({ id: documents.id });
  const newId = row?.id ?? null;
  if (newId) {
    try { await logActivity("document", newId, "upload", { contactId, opportunityId: options.opportunityId, name }); } catch {}
    try {
      await logAudit({
        tenantId: auth.tenantId,
        userId: auth.userId,
        action: "upload",
        entityType: "document",
        entityId: newId,
        meta: { contactId: contactId ?? undefined, opportunityId: options.opportunityId, name },
      });
    } catch {}
    if (contactId && options.visibleToClient) {
      try {
        await notifyClientAdvisorSharedDocument({
          tenantId: auth.tenantId,
          contactId,
          documentId: newId,
          documentName: name,
          reason: "upload",
        });
      } catch {
        /* best-effort */
      }
    }
  }
  return newId;
}

export async function updateDocumentVisibleToClient(documentId: string, visibleToClient: boolean) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) throw new Error("Forbidden");
  const [existing] = await db
    .select({
      visibleToClient: documents.visibleToClient,
      contactId: documents.contactId,
      name: documents.name,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.id, documentId)))
    .limit(1);
  if (!existing) throw new Error("Dokument nenalezen.");
  const wasVisible = !!existing.visibleToClient;
  await db
    .update(documents)
    .set({ visibleToClient, updatedAt: new Date() })
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.id, documentId)));
  if (visibleToClient && !wasVisible && existing.contactId) {
    try {
      await notifyClientAdvisorSharedDocument({
        tenantId: auth.tenantId,
        contactId: existing.contactId,
        documentId,
        documentName: existing.name,
        reason: "visibility_on",
      });
    } catch {
      /* best-effort */
    }
  }
}

export async function deleteDocument(id: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) throw new Error("Forbidden");
  await db
    .delete(documents)
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.id, id)));
  try { await logActivity("document", id, "delete"); } catch {}
  try {
    await logAudit({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "delete",
      entityType: "document",
      entityId: id,
    });
  } catch {}
}

export async function updateDocument(
  id: string,
  data: { name?: string; tags?: string[]; contractId?: string | null; visibleToClient?: boolean }
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) throw new Error("Forbidden");
  let prevVisible: boolean | null = null;
  let contactIdForNotify: string | null = null;
  let docName = "";
  if (data.visibleToClient === true) {
    const [row] = await db
      .select({
        visibleToClient: documents.visibleToClient,
        contactId: documents.contactId,
        name: documents.name,
      })
      .from(documents)
      .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.id, id)))
      .limit(1);
    if (row) {
      prevVisible = row.visibleToClient;
      contactIdForNotify = row.contactId;
      docName = row.name;
    }
  }
  await db
    .update(documents)
    .set({
      ...(data.name != null && { name: data.name }),
      ...(data.tags !== undefined && { tags: data.tags.length ? data.tags : null }),
      ...(data.contractId !== undefined && { contractId: data.contractId || null }),
      ...(data.visibleToClient != null && { visibleToClient: data.visibleToClient }),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.id, id)));

  /** Single source of truth: linking a document to a contract sets lineage on `contracts`. */
  if (data.contractId !== undefined) {
    await db
      .update(contracts)
      .set({ sourceDocumentId: null, updatedAt: new Date() })
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.sourceDocumentId, id)));
    if (data.contractId) {
      await db
        .update(contracts)
        .set({
          sourceDocumentId: id,
          sourceKind: "document",
          updatedAt: new Date(),
        })
        .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, data.contractId)));
    }
  }

  try { await logActivity("document", id, "update", { fields: Object.keys(data) }); } catch {}
  if (
    data.visibleToClient === true &&
    contactIdForNotify &&
    prevVisible === false
  ) {
    try {
      await notifyClientAdvisorSharedDocument({
        tenantId: auth.tenantId,
        contactId: contactIdForNotify,
        documentId: id,
        documentName: data.name ?? docName,
        reason: "visibility_on",
      });
    } catch {
      /* best-effort */
    }
  }
}

export async function logDocumentDownload(documentId: string) {
  const auth = await requireAuthInAction();
  await logAudit({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: "download",
    entityType: "document",
    entityId: documentId,
  });
}

export async function clientUploadDocument(formData: FormData) {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) throw new Error("Forbidden");

  const file = formData.get("file") as File | null;
  if (!file?.size) throw new Error("Vyberte soubor.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Soubor je příliš velký (max 10 MB).");

  const allowedTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  if (!allowedTypes.has(file.type)) {
    throw new Error("Podporujeme PDF, JPG, PNG a WEBP.");
  }

  const name = (formData.get("name") as string | null)?.trim() || null;
  const tagsRaw = (formData.get("tags") as string | null)?.trim() || null;
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  const uploadSourceRaw = (formData.get("uploadSource") as string | null)?.trim() || "web";
  const uploadSource =
    uploadSourceRaw === "mobile_camera" ||
    uploadSourceRaw === "mobile_gallery" ||
    uploadSourceRaw === "mobile_file" ||
    uploadSourceRaw === "web"
      ? uploadSourceRaw
      : "web";

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${auth.tenantId}/${auth.contactId}/${Date.now()}-${safeName}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false });
  if (uploadError) {
    throw new Error(uploadError.message || "Nahrání souboru se nezdařilo.");
  }

  const [row] = await db
    .insert(documents)
    .values({
      tenantId: auth.tenantId,
      contactId: auth.contactId,
      contractId: null,
      opportunityId: null,
      name: name || file.name,
      storagePath,
      tags: tags.length ? tags : null,
      mimeType: file.type || null,
      sizeBytes: file.size,
      visibleToClient: true,
      uploadSource,
      uploadedBy: auth.userId,
    })
    .returning({ id: documents.id });

  const documentId = row?.id ?? null;

  if (documentId) {
    await logActivity("document", documentId, "upload", {
      contactId: auth.contactId,
      source: "client_portal",
      uploadSource,
    }).catch(() => {});

    await notifyAdvisorClientTrezorUpload({
      tenantId: auth.tenantId,
      contactId: auth.contactId,
      documentId,
      documentLabel: name || file.name,
    }).catch(() => {});
  }

  return { success: true as const, id: documentId };
}
