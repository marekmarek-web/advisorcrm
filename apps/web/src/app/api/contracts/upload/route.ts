import { NextResponse } from "next/server";
import { getMembership, hasPermission, type RoleName } from "@/lib/auth/get-membership";
import { createAdminClient } from "@/lib/supabase/server";
import { createContractReview, updateContractReview } from "@/lib/ai/review-queue-repository";
import { runContractUnderstandingPipeline } from "@/lib/ai/contract-understanding-pipeline";
import { findClientCandidates, buildAllDraftActions } from "@/lib/ai/draft-actions";
import { isMatchingAmbiguous } from "@/lib/ai/client-matching";
import { logOpenAICall } from "@/lib/openai";
import { logAudit } from "@/lib/audit";

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
  const url = request.url;
  const method = request.method;
  const xDebugMw = request.headers.get("x-debug-mw");
  const xDebugPath = request.headers.get("x-debug-path");
  const userId = request.headers.get(USER_ID_HEADER);
  // Diagnostický log: co route obdržela (bez citlivých dat)
  // eslint-disable-next-line no-console
  console.log("[route POST /api/contracts/upload]", { url, method, xDebugMw, xDebugPath, hasUserIdHeader: !!userId, userIdMask: userId ? `${userId.slice(0, 8)}…` : null });

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const membership = await getMembership(userId);
    if (!membership || !hasPermission(membership.roleName as RoleName, "documents:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // #region agent log
    fetch("http://127.0.0.1:7387/ingest/30869546-c4c0-4805-9fd6-2bc75f3b0175", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6af004" },
      body: JSON.stringify({
        sessionId: "6af004",
        hypothesisId: "H3",
        location: "api/contracts/upload/route.ts:after_auth",
        message: "upload auth ok",
        data: { tenantId: membership.tenantId },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) {
      return NextResponse.json(
        { error: "Vyberte soubor (PDF)." },
        { status: 400 }
      );
    }

    const mimeType = file.type?.toLowerCase() || "";
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        { error: "Povolený formát je pouze PDF." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Soubor je příliš velký (max 20 MB)." },
        { status: 400 }
      );
    }

    const tenantId = membership.tenantId;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const id = crypto.randomUUID();
    const storagePath = `contracts/${tenantId}/${id}/${Date.now()}-${safeName}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, file, { upsert: false });

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
      sizeBytes: file.size,
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
    }).catch(() => {});

    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(storagePath, 3600);
    const fileUrl = signed?.signedUrl ?? null;

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
        meta: { reason: "no_signed_url" },
      }).catch(() => {});
      return NextResponse.json(
        { error: "Zpracování selhalo." },
        { status: 500 }
      );
    }

    // #region agent log
    fetch("http://127.0.0.1:7387/ingest/30869546-c4c0-4805-9fd6-2bc75f3b0175", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6af004" },
      body: JSON.stringify({
        sessionId: "6af004",
        hypothesisId: "H1_H2_H5",
        location: "api/contracts/upload/route.ts:before_pipeline",
        message: "before runContractUnderstandingPipeline",
        data: { reviewId },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
    const message = err instanceof Error ? err.message : "Upload failed.";
    const errName = err instanceof Error ? err.name : "";
    // #region agent log
    fetch("http://127.0.0.1:7387/ingest/30869546-c4c0-4805-9fd6-2bc75f3b0175", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6af004" },
      body: JSON.stringify({
        sessionId: "6af004",
        hypothesisId: "H1_H2_H3_H5",
        location: "api/contracts/upload/route.ts:catch",
        message: "upload route catch",
        data: { message, errName, hasStack: err instanceof Error && !!err.stack },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json(
      { error: "Nahrání smlouvy selhalo." },
      { status: 500 }
    );
  }
}
