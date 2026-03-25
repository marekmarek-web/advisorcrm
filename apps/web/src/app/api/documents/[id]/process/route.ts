import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { db, documents, eq, and } from "db";
import { processDocument } from "@/lib/documents/processing/orchestrator";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getMembership(user.id);
  if (!membership || !hasPermission(membership.roleName as RoleName, "documents:write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.tenantId, membership.tenantId), eq(documents.id, id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  if (doc.processingStatus === "processing") {
    return NextResponse.json(
      { error: "Document is already being processed.", status: doc.processingStatus },
      { status: 409 }
    );
  }

  await logAudit({
    tenantId: membership.tenantId,
    userId: user.id,
    action: "process_document",
    entityType: "document",
    entityId: id,
    request,
  }).catch(() => {});

  const result = await processDocument(
    {
      id: doc.id,
      tenantId: doc.tenantId,
      storagePath: doc.storagePath,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      uploadSource: doc.uploadSource,
      pageCount: doc.pageCount,
      hasTextLayer: doc.hasTextLayer,
      isScanLike: doc.isScanLike,
    },
    user.id
  );

  return NextResponse.json({
    success: result.success,
    processingStatus: result.processingStatus,
    processingStage: result.processingStage,
    aiInputSource: result.aiInputSource,
    error: result.error,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getMembership(user.id);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [doc] = await db
    .select({
      id: documents.id,
      processingProvider: documents.processingProvider,
      processingStatus: documents.processingStatus,
      processingStage: documents.processingStage,
      businessStatus: documents.businessStatus,
      processingError: documents.processingError,
      processingStartedAt: documents.processingStartedAt,
      processingFinishedAt: documents.processingFinishedAt,
      aiInputSource: documents.aiInputSource,
      hasTextLayer: documents.hasTextLayer,
      isScanLike: documents.isScanLike,
      pageCount: documents.pageCount,
      detectedInputMode: documents.detectedInputMode,
      readabilityScore: documents.readabilityScore,
      preprocessingWarnings: documents.preprocessingWarnings,
      normalizedPdfPath: documents.normalizedPdfPath,
      sourceChannel: documents.sourceChannel,
      documentFingerprint: documents.documentFingerprint,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, membership.tenantId), eq(documents.id, id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  return NextResponse.json(doc);
}
