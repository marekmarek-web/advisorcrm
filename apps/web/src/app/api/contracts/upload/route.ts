import { NextResponse } from "next/server";
import { getMembership, hasPermission, type RoleName } from "@/lib/auth/get-membership";
import { createAdminClient } from "@/lib/supabase/server";
import { createContractReview, updateContractReview } from "@/lib/ai/review-queue-repository";
import { runContractUnderstandingPipeline } from "@/lib/ai/contract-understanding-pipeline";
import { findClientCandidates, buildAllDraftActions } from "@/lib/ai/draft-actions";
import { isMatchingAmbiguous } from "@/lib/ai/client-matching";
import { logOpenAICall } from "@/lib/openai";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { detectMagicMimeTypeFromBytes, mimeMatchesAllowedSignature } from "@/lib/security/file-signature";
import { tryBeginIdempotencyWindow } from "@/lib/security/idempotency";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = ["application/pdf"];
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

/** Set by middleware; /api/contracts/* autorizujeme jen přes hlavičku (bez Supabase v route). */
const USER_ID_HEADER = "x-user-id";

function maskForLog(value: unknown): string {
  if (value == null) return "—";
  const s = String(value);
  if (s.length <= 4) return "***";
  return s.slice(0, 2) + "***" + s.slice(-2);
}

export async function POST(request: Request) {
  const start = Date.now();
  const userId = request.headers.get(USER_ID_HEADER);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const membership = await getMembership(userId);
    if (!membership || !hasPermission(membership.roleName as RoleName, "documents:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const limiter = checkRateLimit(request, "contracts-upload", `${membership.tenantId}:${userId}`, {
      windowMs: 60_000,
      maxRequests: 10,
    });
    if (!limiter.ok) {
      return NextResponse.json(
        { error: "Too many upload attempts. Please retry later." },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      );
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) {
      return NextResponse.json(
        { error: "Vyberte soubor (PDF)." },
        { status: 400 }
      );
    }

    // Single read: Node/Undici File can fail on Supabase upload after arrayBuffer() was consumed.
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (fileBytes.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Soubor je příliš velký (max 20 MB)." },
        { status: 400 }
      );
    }

    const detectedMime = detectMagicMimeTypeFromBytes(fileBytes.subarray(0, Math.min(64, fileBytes.byteLength)));
    let mimeType = (file.type?.toLowerCase() || "").trim();
    // iOS/Safari often sends empty type or application/octet-stream for real PDFs.
    if (detectedMime === "application/pdf") {
      mimeType = "application/pdf";
    }
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        { error: "Povolený formát je pouze PDF." },
        { status: 400 }
      );
    }
    if (!mimeMatchesAllowedSignature(mimeType, detectedMime)) {
      return NextResponse.json({ error: "Obsah souboru neodpovídá deklarovanému typu." }, { status: 400 });
    }

    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
    if (idempotencyKey) {
      const scopedKey = `contracts:${membership.tenantId}:${userId}:${idempotencyKey}`;
      const accepted = tryBeginIdempotencyWindow(scopedKey, 5 * 60_000);
      if (!accepted) {
        return NextResponse.json({ error: "Duplicate upload request." }, { status: 409 });
      }
    }

    const tenantId = membership.tenantId;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const id = crypto.randomUUID();
    const storagePath = `contracts/${tenantId}/${id}/${Date.now()}-${safeName}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, fileBytes, {
      contentType: mimeType,
      upsert: false,
    });

    if (uploadError) {
      const safeMsg =
        uploadError.message?.toLowerCase().includes("bucket") ||
        uploadError.message?.toLowerCase().includes("not found")
          ? "Úložiště není dostupné."
          : "Nahrání souboru selhalo.";
      return NextResponse.json({ error: safeMsg }, { status: 500 });
    }

    const reviewId = await createContractReview({
      tenantId,
      fileName: file.name,
      storagePath,
      mimeType,
      sizeBytes: fileBytes.byteLength,
      processingStatus: "uploaded",
      uploadedBy: userId,
    });

    await updateContractReview(reviewId, tenantId, {
      processingStatus: "processing",
    });
    await logAudit({
      tenantId,
      userId,
      action: "extraction_started",
      entityType: "contract_review",
      entityId: reviewId,
      request,
    }).catch(() => {});

    const signed = await createSignedStorageUrl({
      adminClient: admin,
      bucket: "documents",
      path: storagePath,
      purpose: "internal_processing",
    });
    const fileUrl = signed.signedUrl;

    if (!fileUrl) {
      await updateContractReview(reviewId, tenantId, {
        processingStatus: "failed",
        errorMessage: "Nepodařilo se vytvořit odkaz na soubor.",
      });
      await logAudit({
        tenantId,
        userId,
        action: "extraction_failed",
        entityType: "contract_review",
        entityId: reviewId,
        request,
        meta: { reason: "no_signed_url" },
      }).catch(() => {});
      return NextResponse.json(
        { error: "Zpracování selhalo." },
        { status: 500 }
      );
    }

    const pipelineResult = await runContractUnderstandingPipeline(fileUrl, mimeType);

    if (!pipelineResult.ok) {
      const errDetail =
        pipelineResult.details != null
          ? ` ${typeof pipelineResult.details === "string" ? pipelineResult.details : JSON.stringify(pipelineResult.details).slice(0, 200)}`
          : "";
      await updateContractReview(reviewId, tenantId, {
        processingStatus: "failed",
        errorMessage: pipelineResult.errorMessage + errDetail,
        extractionTrace: pipelineResult.extractionTrace ?? undefined,
      });
      await logAudit({
        tenantId,
        userId,
        action: "extraction_failed",
        entityType: "contract_review",
        entityId: reviewId,
        request,
        meta: { step: pipelineResult.extractionTrace?.failedStep },
      }).catch(() => {});
      logOpenAICall({
        endpoint: "contracts/upload_pipeline",
        model: "—",
        latencyMs: Date.now() - start,
        success: false,
        error: maskForLog(pipelineResult.errorMessage),
      });
      return NextResponse.json(
        { error: "Extrakce ze smlouvy selhala.", id: reviewId },
        { status: 200 }
      );
    }

    const data = pipelineResult.extractedPayload;
    const draftActions = buildAllDraftActions(data);
    const clientMatchCandidates = await findClientCandidates(data, { tenantId });
    const reasonsForReview = [...pipelineResult.reasonsForReview];
    if (isMatchingAmbiguous(clientMatchCandidates)) {
      reasonsForReview.push("ambiguous_client_match");
    }

    await updateContractReview(reviewId, tenantId, {
      processingStatus: pipelineResult.processingStatus,
      extractedPayload: data,
      draftActions,
      clientMatchCandidates,
      confidence: pipelineResult.confidence,
      reasonsForReview: reasonsForReview.length ? reasonsForReview : null,
      inputMode: pipelineResult.inputMode,
      extractionMode: pipelineResult.extractionMode,
      detectedDocumentType: pipelineResult.detectedDocumentType,
      extractionTrace: pipelineResult.extractionTrace,
      validationWarnings: pipelineResult.validationWarnings.length ? pipelineResult.validationWarnings : null,
      fieldConfidenceMap: pipelineResult.fieldConfidenceMap ?? undefined,
      classificationReasons: pipelineResult.classificationReasons.length ? pipelineResult.classificationReasons : null,
    });
    await logAudit({
      tenantId,
      userId,
      action: "extraction_completed",
      entityType: "contract_review",
      entityId: reviewId,
      request,
      meta: { processingStatus: pipelineResult.processingStatus },
    }).catch(() => {});

    logOpenAICall({
      endpoint: "contracts/upload_pipeline",
      model: "—",
      latencyMs: Date.now() - start,
      success: true,
    });

    return NextResponse.json({
      id: reviewId,
      processingStatus: pipelineResult.processingStatus,
      confidence: pipelineResult.confidence,
      needsHumanReview: pipelineResult.processingStatus === "review_required",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : typeof err;
    console.error(
      "[route POST /api/contracts/upload] 500",
      errName,
      message,
      err instanceof Error ? err.stack : ""
    );
    return NextResponse.json(
      { error: "Nahrání smlouvy selhalo." },
      { status: 500 }
    );
  }
}
