import { NextResponse } from "next/server";
import { getMembership } from "@/lib/auth/get-membership";
import { getContractReviewById } from "@/lib/ai/review-queue-repository";
import { maskSensitiveEnvelopeForUi } from "@/lib/ai/document-sensitivity";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

/**
 * GET /api/contracts/review/[id]
 * Returns contract review detail and payload for review queue UI.
 * Auth only via x-user-id from middleware (no Supabase in route).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const includeDebug = new URL(request.url).searchParams.get("debug") === "1";
    const userId = request.headers.get(USER_ID_HEADER);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const membership = await getMembership(userId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const row = await getContractReviewById(id, membership.tenantId);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const safePayload =
      row.extractedPayload && typeof row.extractedPayload === "object"
        ? maskSensitiveEnvelopeForUi(row.extractedPayload as Parameters<typeof maskSensitiveEnvelopeForUi>[0])
        : row.extractedPayload;

    return NextResponse.json({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      processingStatus: row.processingStatus,
      errorMessage: row.errorMessage,
      extractedPayload: safePayload,
      clientMatchCandidates: row.clientMatchCandidates,
      draftActions: row.draftActions,
      confidence: row.confidence,
      reasonsForReview: row.reasonsForReview,
      reviewStatus: row.reviewStatus,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      rejectReason: row.rejectReason,
      appliedBy: row.appliedBy,
      appliedAt: row.appliedAt,
      matchedClientId: row.matchedClientId ?? undefined,
      createNewClientConfirmed: row.createNewClientConfirmed ?? undefined,
      applyResultPayload: row.applyResultPayload ?? undefined,
      reviewDecisionReason: row.reviewDecisionReason ?? undefined,
      inputMode: row.inputMode ?? undefined,
      extractionMode: row.extractionMode ?? undefined,
      detectedDocumentType: row.detectedDocumentType ?? undefined,
      detectedDocumentSubtype: row.detectedDocumentSubtype ?? undefined,
      lifecycleStatus: row.lifecycleStatus ?? undefined,
      documentIntent: row.documentIntent ?? undefined,
      extractionTrace: row.extractionTrace ?? undefined,
      validationWarnings: row.validationWarnings ?? undefined,
      fieldConfidenceMap: row.fieldConfidenceMap ?? undefined,
      classificationReasons: row.classificationReasons ?? undefined,
      dataCompleteness: row.dataCompleteness ?? undefined,
      sensitivityProfile: row.sensitivityProfile ?? undefined,
      sectionSensitivity: row.sectionSensitivity ?? undefined,
      relationshipInference: row.relationshipInference ?? undefined,
      originalExtractedPayload: row.originalExtractedPayload ?? undefined,
      correctedPayload: row.correctedPayload ?? undefined,
      correctedFields: row.correctedFields ?? undefined,
      correctedDocumentType: row.correctedDocumentType ?? undefined,
      correctedLifecycleStatus: row.correctedLifecycleStatus ?? undefined,
      fieldMarkedNotApplicable: row.fieldMarkedNotApplicable ?? undefined,
      linkedClientOverride: row.linkedClientOverride ?? undefined,
      linkedDealOverride: row.linkedDealOverride ?? undefined,
      confidenceOverride: row.confidenceOverride ?? undefined,
      ignoredWarnings: row.ignoredWarnings ?? undefined,
      correctionReason: row.correctionReason ?? undefined,
      correctedBy: row.correctedBy ?? undefined,
      correctedAt: row.correctedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      debug: includeDebug
        ? {
            classification: {
              detectedDocumentType: row.detectedDocumentType ?? undefined,
              detectedDocumentSubtype: row.detectedDocumentSubtype ?? undefined,
              lifecycleStatus: row.lifecycleStatus ?? undefined,
              documentIntent: row.documentIntent ?? undefined,
              classificationReasons: row.classificationReasons ?? undefined,
            },
            verification: {
              validationWarnings: row.validationWarnings ?? undefined,
              reasonsForReview: row.reasonsForReview ?? undefined,
              dataCompleteness: row.dataCompleteness ?? undefined,
            },
            matching: row.clientMatchCandidates ?? undefined,
            suggestedActions: row.draftActions ?? undefined,
            extractionTrace: row.extractionTrace ?? undefined,
            sensitivityProfile: row.sensitivityProfile ?? undefined,
            sectionSensitivity: row.sectionSensitivity ?? undefined,
            relationshipInference: row.relationshipInference ?? undefined,
          }
        : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Načtení detailu selhalo." },
      { status: 500 }
    );
  }
}
