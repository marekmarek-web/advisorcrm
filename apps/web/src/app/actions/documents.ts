"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { documents } from "db";
import { eq, and } from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "./activity";
import { logAudit } from "@/lib/audit";

export type DocumentRow = {
  id: string;
  name: string;
  mimeType: string | null;
  tags: string[] | null;
  contractId: string | null;
  visibleToClient: boolean | null;
  createdAt: Date;
};

export async function getDocumentsForContact(contactId: string): Promise<DocumentRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      mimeType: documents.mimeType,
      tags: documents.tags,
      contractId: documents.contractId,
      visibleToClient: documents.visibleToClient,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.contactId, contactId)));
  return rows;
}

export async function getDocumentsForOpportunity(opportunityId: string): Promise<DocumentRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      mimeType: documents.mimeType,
      tags: documents.tags,
      contractId: documents.contractId,
      visibleToClient: documents.visibleToClient,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.opportunityId, opportunityId)));
  return rows;
}

/** Pro Client Zone – jen dokumenty s visibleToClient true. */
export async function getDocumentsForClient(contactId: string): Promise<DocumentRow[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId || auth.contactId !== contactId) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      mimeType: documents.mimeType,
      tags: documents.tags,
      contractId: documents.contractId,
      visibleToClient: documents.visibleToClient,
      createdAt: documents.createdAt,
    })
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
  }
  return newId;
}

export async function updateDocumentVisibleToClient(documentId: string, visibleToClient: boolean) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "documents:write")) throw new Error("Forbidden");
  await db
    .update(documents)
    .set({ visibleToClient, updatedAt: new Date() })
    .where(and(eq(documents.tenantId, auth.tenantId), eq(documents.id, documentId)));
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
  try { await logActivity("document", id, "update", { fields: Object.keys(data) }); } catch {}
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
