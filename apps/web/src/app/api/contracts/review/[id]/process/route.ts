/**
 * POST /api/contracts/review/[id]/process
 *
 * Spustí AI pipeline (Adobe preprocess → LLM classify + extract → DB matching)
 * pro již nahraný review řádek. Upload route vytvoří řádek a vrátí ID okamžitě.
 * Frontend zavolá tento endpoint a pak polluje stav přes GET /api/contracts/review/[id].
 */
import { NextResponse } from "next/server";
import { getMembership } from "@/lib/auth/get-membership";
import { createAdminClient } from "@/lib/supabase/server";
import { getContractReviewById, updateContractReview } from "@/lib/ai/review-queue-repository";
import { runContractUnderstandingPipeline } from "@/lib/ai/contract-understanding-pipeline";
import { findClientCandidates, buildAllDraftActions } from "@/lib/ai/draft-actions";
import { isMatchingAmbiguous } from "@/lib/ai/client-matching";
import {
  findMatchedCompanies,
  findMatchedDeals,
  findMatchedExistingContracts,
  findMatchedHouseholds,
} from "@/lib/ai/client-matching";
import { logOpenAICall } from "@/lib/openai";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import { preprocessForAiExtraction } from "@/lib/documents/processing/preprocess-for-ai";

export const dynamic = "force-dynamic";
/** OpenAI pipeline může trvat dlouho (2× volání s PDF). */
export const maxDuration = 120;

const USER_ID_HEADER = "x-user-id";

function maskForLog(value: unknown): string {
  if (value == null) return "—";
  const s = String(value);
  if (s.length <= 4) return "***";
  return s.slice(0, 2) + "***" + s.slice(-2);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id } = await params;
  const userId = request.headers.get(USER_ID_HEADER);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const membership = await getMembership(userId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limiter = checkRateLimit(request, "contracts-process", `${membership.tenantId}:${userId}`, {
      windowMs: 60_000,
      maxRequests: 15,
    });
    if (!limiter.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho požadavků na zpracování. Zkuste to za chvíli." },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      );
    }

    const tenantId = membership.tenantId;
    const review = await getContractReviewById(id, tenantId);
    if (!review) {
      return NextResponse.json({ error: "Položka nenalezena." }, { status: 404 });
    }

    if (review.processingStatus === "processing") {
      return NextResponse.json({ error: "Zpracování již probíhá.", code: "ALREADY_PROCESSING" }, { status: 409 });
    }
    if (review.processingStatus !== "uploaded" && review.processingStatus !== "failed") {
      return NextResponse.json(
        { error: "Nelze spustit znovu — dokument je již zpracován.", code: "ALREADY_DONE" },
        { status: 409 }
      );
    }

    await updateContractReview(id, tenantId, { processingStatus: "processing" });
    await logAudit({
      tenantId,
      userId,
      action: "extraction_started",
      entityType: "contract_review",
      entityId: id,
      request,
    }).catch(() => {});

    const admin = createAdminClient();
    const signed = await createSignedStorageUrl({
      adminClient: admin,
      bucket: "documents",
      path: review.storagePath!,
      purpose: "internal_processing",
    });
    const fileUrl = signed.signedUrl;

    if (!fileUrl) {
      await updateContractReview(id, tenantId, {
        processingStatus: "failed",
        errorMessage: "Nepodařilo se vytvořit odkaz na soubor.",
      });
      await logAudit({
        tenantId,
        userId,
        action: "extraction_failed",
        entityType: "contract_review",
        entityId: id,
        request,
        meta: { reason: "no_signed_url" },
      }).catch(() => {});
      return NextResponse.json({ error: "Zpracování selhalo.", code: "NO_SIGNED_URL" }, { status: 500 });
    }

    const mimeType = review.mimeType ?? "application/pdf";
    const storagePath = review.storagePath!;
    let preprocessedUrl = fileUrl;
    let adobePreprocessResult: Awaited<ReturnType<typeof preprocessForAiExtraction>> | null = null;
    let preprocessThrew = false;
    const preprocessStartedAt = Date.now();
    let preprocessDurationMs: number | undefined;
    let pipelineDurationMs: number | undefined;

    try {
      adobePreprocessResult = await preprocessForAiExtraction(
        fileUrl,
        storagePath,
        tenantId,
        id,
        mimeType
      );
      preprocessDurationMs = Date.now() - preprocessStartedAt;
      preprocessedUrl = adobePreprocessResult.fileUrl;

      if (adobePreprocessResult.preprocessed) {
        await updateContractReview(id, tenantId, {
          extractionTrace: {
            adobePreprocessed: true,
            adobeJobIds: adobePreprocessResult.providerJobIds,
            adobeWarnings: adobePreprocessResult.warnings,
            readabilityScore: adobePreprocessResult.readabilityScore,
            ocrConfidenceEstimate: adobePreprocessResult.ocrConfidenceEstimate,
            ocrPdfPath: adobePreprocessResult.ocrPdfPath,
            preprocessDurationMs,
          },
        });
      }
    } catch (preprocessErr) {
      preprocessThrew = true;
      preprocessDurationMs = Date.now() - preprocessStartedAt;
      const preprocessMsg = preprocessErr instanceof Error ? preprocessErr.message : String(preprocessErr);
      console.warn("[contracts/process] Adobe preprocessing failed, continuing with original", preprocessMsg);
    }

    const pipelineStartedAt = Date.now();
    const preprocessMeta =
      adobePreprocessResult != null
        ? {
            adobePreprocessed: adobePreprocessResult.preprocessed,
            preprocessStatus: adobePreprocessResult.preprocessStatus,
            preprocessMode: adobePreprocessResult.preprocessMode,
            preprocessWarnings: adobePreprocessResult.warnings,
            ocrConfidenceEstimate: adobePreprocessResult.ocrConfidenceEstimate,
            readabilityScore: adobePreprocessResult.readabilityScore,
            preprocessDurationMs,
            normalizedPdfPath: adobePreprocessResult.normalizedPdfPath,
            markdownContentLength: adobePreprocessResult.markdownContent?.length ?? 0,
            pageCountEstimate: adobePreprocessResult.pageCountEstimate,
          }
        : preprocessThrew
          ? {
              preprocessStatus: "failed",
              preprocessMode: "adobe",
              adobePreprocessed: false,
              preprocessWarnings: ["preprocess_exception"],
              preprocessDurationMs,
            }
          : {
              preprocessStatus: "skipped",
              preprocessMode: "none",
              adobePreprocessed: false,
            };

    console.info(
      "[contracts/process] preprocess_done",
      JSON.stringify({
        reviewId: id,
        preprocessStatus: preprocessMeta.preprocessStatus,
        durationMs: preprocessDurationMs,
      })
    );

    const pipelineResult = await runContractUnderstandingPipeline(preprocessedUrl, mimeType, {
      ruleBasedTextHint: adobePreprocessResult?.markdownContent ?? null,
      preprocessMeta,
    });
    pipelineDurationMs = Date.now() - pipelineStartedAt;

    if (!pipelineResult.ok) {
      const errDetail =
        pipelineResult.details != null
          ? ` ${typeof pipelineResult.details === "string" ? pipelineResult.details : JSON.stringify(pipelineResult.details).slice(0, 200)}`
          : "";
      const isRateLimit = pipelineResult.errorCode === "OPENAI_RATE_LIMIT";
      const failTrace = {
        ...(pipelineResult.extractionTrace ?? {}),
        preprocessDurationMs,
        pipelineDurationMs,
        ...(adobePreprocessResult?.preprocessed
          ? {
              adobePreprocessed: true,
              adobeJobIds: adobePreprocessResult.providerJobIds,
              adobeWarnings: adobePreprocessResult.warnings,
              readabilityScore: adobePreprocessResult.readabilityScore,
              ocrPdfPath: adobePreprocessResult.ocrPdfPath,
              normalizedPdfPath: adobePreprocessResult.normalizedPdfPath,
              ocrConfidenceEstimate: adobePreprocessResult.ocrConfidenceEstimate,
            }
          : {}),
      };
      await updateContractReview(id, tenantId, {
        processingStatus: "failed",
        errorMessage: isRateLimit
          ? pipelineResult.errorMessage
          : pipelineResult.errorMessage + errDetail,
        extractionTrace: failTrace,
      });
      await logAudit({
        tenantId,
        userId,
        action: "extraction_failed",
        entityType: "contract_review",
        entityId: id,
        request,
        meta: { step: pipelineResult.extractionTrace?.failedStep },
      }).catch(() => {});
      logOpenAICall({
        endpoint: "contracts/process_pipeline",
        model: "—",
        latencyMs: Date.now() - start,
        success: false,
        error: maskForLog(pipelineResult.errorMessage),
      });
      return NextResponse.json(
        {
          error: isRateLimit
            ? pipelineResult.errorMessage
            : "Extrakce ze smlouvy selhala.",
          code: pipelineResult.errorCode,
          id,
        },
        { status: 200 }
      );
    }

    const data = pipelineResult.extractedPayload;
    const contractNumber = String(data.extractedFields.contractNumber?.value ?? "");
    const draftActions = buildAllDraftActions(data);

    // Wave 1: client candidates + companies (independent)
    const [clientMatchCandidates, matchedCompanies] = await Promise.all([
      findClientCandidates(data, { tenantId }),
      findMatchedCompanies(tenantId, data),
    ]);

    // Wave 2: households, deals, contracts (need clientMatchCandidates)
    const [matchedHouseholds, matchedDeals, matchedContracts] = await Promise.all([
      findMatchedHouseholds(tenantId, clientMatchCandidates),
      findMatchedDeals(tenantId, clientMatchCandidates, contractNumber),
      findMatchedExistingContracts(tenantId, data, clientMatchCandidates),
    ]);

    data.candidateMatches = {
      matchedClients: clientMatchCandidates.map((c) => ({
        entityId: c.clientId,
        score: c.score,
        reason: c.reasons.join("; "),
        ambiguous: false,
        extra: {
          confidence: c.confidence,
          matchedFields: c.matchedFields,
          displayName: c.displayName,
        },
      })),
      matchedHouseholds,
      matchedDeals,
      matchedCompanies,
      matchedContracts,
      score: clientMatchCandidates[0]?.score ?? 0,
      reason: clientMatchCandidates[0]?.reasons.join("; ") ?? "no_match",
      ambiguityFlags: isMatchingAmbiguous(clientMatchCandidates) ? ["multiple_close_candidates"] : [],
    };
    data.suggestedActions = draftActions.map((a) => ({
      type: a.type,
      label: a.label,
      payload: a.payload,
    }));

    const reasonsForReview = [...pipelineResult.reasonsForReview];
    if (isMatchingAmbiguous(clientMatchCandidates)) {
      reasonsForReview.push("ambiguous_client_match");
    }
    if (
      data.documentClassification.documentIntent === "modifies_existing_product" &&
      matchedContracts.length === 0
    ) {
      reasonsForReview.push("missing_existing_contract_match");
    }

    const mergedTrace = {
      ...pipelineResult.extractionTrace,
      preprocessDurationMs,
      pipelineDurationMs,
      ...(adobePreprocessResult?.preprocessed
        ? {
            adobePreprocessed: true,
            adobeJobIds: adobePreprocessResult.providerJobIds,
            adobeWarnings: adobePreprocessResult.warnings,
            readabilityScore: adobePreprocessResult.readabilityScore,
            ocrPdfPath: adobePreprocessResult.ocrPdfPath,
            normalizedPdfPath: adobePreprocessResult.normalizedPdfPath,
            ocrConfidenceEstimate: adobePreprocessResult.ocrConfidenceEstimate,
          }
        : {}),
    };

    await updateContractReview(id, tenantId, {
      processingStatus: pipelineResult.processingStatus,
      extractedPayload: data,
      draftActions,
      clientMatchCandidates,
      confidence: pipelineResult.confidence,
      reasonsForReview: reasonsForReview.length ? reasonsForReview : null,
      inputMode: pipelineResult.inputMode,
      extractionMode: pipelineResult.extractionMode,
      detectedDocumentType: pipelineResult.detectedDocumentType,
      detectedDocumentSubtype: data.documentClassification.subtype ?? null,
      lifecycleStatus: data.documentClassification.lifecycleStatus ?? null,
      documentIntent: data.documentClassification.documentIntent ?? null,
      extractionTrace: mergedTrace,
      validationWarnings: pipelineResult.validationWarnings.length ? pipelineResult.validationWarnings : null,
      fieldConfidenceMap: pipelineResult.fieldConfidenceMap ?? undefined,
      classificationReasons: pipelineResult.classificationReasons.length ? pipelineResult.classificationReasons : null,
      dataCompleteness: data.dataCompleteness ?? null,
      sensitivityProfile: data.sensitivityProfile ?? null,
      sectionSensitivity: data.sectionSensitivity ?? null,
      relationshipInference: data.relationshipInference ?? null,
    });

    await logAudit({
      tenantId,
      userId,
      action: "extraction_completed",
      entityType: "contract_review",
      entityId: id,
      request,
      meta: { processingStatus: pipelineResult.processingStatus },
    }).catch(() => {});

    logOpenAICall({
      endpoint: "contracts/process_pipeline",
      model: "—",
      latencyMs: Date.now() - start,
      success: true,
    });

    return NextResponse.json({
      id,
      processingStatus: pipelineResult.processingStatus,
      confidence: pipelineResult.confidence,
      needsHumanReview: pipelineResult.processingStatus === "review_required",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[contracts/review/[id]/process] 500", message);
    return NextResponse.json(
      { error: "Zpracování smlouvy selhalo.", code: "PROCESS_UNHANDLED" },
      { status: 500 }
    );
  }
}
