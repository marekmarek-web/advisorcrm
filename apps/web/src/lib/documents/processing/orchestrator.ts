import { db, documents, documentProcessingJobs, eq, and } from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import { getProcessingProvider } from "./provider";
import { decideProcessing } from "./heuristics";
import { estimateOcrConfidenceFromText } from "@/lib/documents/adobe-service";
import { extractTextFromPdfUrl } from "./pdf-text-fallback";
import type { ProcessingInput, OrchestratorResult } from "./types";
import type {
  DocumentAiInputSource,
  DocumentBusinessStatus,
  DocumentInputMode,
  DocumentProcessingJobStatus,
  DocumentProcessingProvider,
  DocumentProcessingStage,
  DocumentProcessingStatus,
  DocumentSourceChannel,
} from "db";

type DocumentRow = {
  id: string;
  tenantId: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadSource: string | null;
  pageCount: number | null;
  hasTextLayer: boolean | null;
  isScanLike: boolean | null;
  sourceChannel?: string | null;
};

async function getSignedUrl(storagePath: string): Promise<string | null> {
  const admin = createAdminClient();
  const { signedUrl } = await createSignedStorageUrl({
    adminClient: admin,
    bucket: "documents",
    path: storagePath,
    purpose: "internal_processing",
  });
  return signedUrl;
}

async function updateDocumentStatus(
  documentId: string,
  update: Partial<{
    processingProvider: DocumentProcessingProvider;
    processingStatus: DocumentProcessingStatus;
    processingStage: DocumentProcessingStage;
    businessStatus: DocumentBusinessStatus;
    processingError: string | null;
    processingStartedAt: Date | null;
    processingFinishedAt: Date | null;
    ocrPdfPath: string | null;
    normalizedPdfPath: string | null;
    markdownPath: string | null;
    markdownContent: string | null;
    extractJsonPath: string | null;
    aiInputSource: DocumentAiInputSource;
    detectedInputMode: DocumentInputMode;
    readabilityScore: number;
    preprocessingWarnings: string[];
    pageTextMap: Record<number, string>;
    pageImageRefs: string[];
    documentFingerprint: string | null;
    sourceChannel: DocumentSourceChannel;
  }>
) {
  await db.update(documents).set({ ...update, updatedAt: new Date() }).where(eq(documents.id, documentId));
}

async function createJob(params: {
  documentId: string;
  tenantId: string;
  provider: string;
  jobType: string;
  requestedBy: string | null;
  inputPath: string;
}) {
  const [job] = await db
    .insert(documentProcessingJobs)
    .values({
      documentId: params.documentId,
      tenantId: params.tenantId,
      provider: params.provider as "adobe" | "disabled" | "none",
      jobType: params.jobType as "ocr" | "markdown" | "extract",
      status: "queued",
      requestedBy: params.requestedBy,
      inputPath: params.inputPath,
    })
    .returning({ id: documentProcessingJobs.id });
  return job?.id ?? null;
}

async function updateJob(
  jobId: string,
  update: Partial<{
    status: DocumentProcessingJobStatus;
    startedAt: Date;
    finishedAt: Date;
    errorMessage: string | null;
    providerJobId: string | null;
    outputPath: string | null;
    outputMetadata: Record<string, unknown>;
  }>
) {
  await db
    .update(documentProcessingJobs)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(documentProcessingJobs.id, jobId));
}

function resolveSourceChannel(uploadSource: string | null): DocumentSourceChannel {
  switch (uploadSource) {
    case "web_quick":
    case "mobile_quick":
      return "portal_quick_upload";
    case "mobile_camera": return "mobile_camera";
    case "mobile_gallery": return "mobile_gallery";
    case "mobile_file": return "mobile_file";
    case "mobile_share": return "mobile_share";
    case "mobile_scan": return "mobile_scan";
    case "web_scan": return "web_scan";
    case "email_attachment": return "email_attachment";
    case "api": return "api";
    case "ai_drawer": return "ai_drawer";
    case "backoffice_import": return "backoffice_import";
    default: return "web_upload";
  }
}

function resolveInputMode(doc: DocumentRow, decision: { reason: string }): DocumentInputMode {
  const isMobile =
    doc.uploadSource === "mobile_scan" ||
    doc.uploadSource === "web_scan" ||
    doc.uploadSource === "mobile_camera";
  const isImage = doc.mimeType?.startsWith("image/") ?? false;
  if (isImage || isMobile) return "image_document";
  if (doc.isScanLike && doc.hasTextLayer) return "mixed_pdf";
  if (doc.isScanLike) return "scanned_pdf";
  if (doc.hasTextLayer) return "text_pdf";
  if (decision.reason === "unsupported_mime") return "unsupported";
  return "scanned_pdf";
}

function computeReadabilityScore(
  hasText: boolean,
  markdownContent: string | undefined,
  pageCount: number | null,
  isScan: boolean,
  hasNormalizedPdf: boolean
): number {
  const textLength = markdownContent?.trim().length ?? 0;
  const est = estimateOcrConfidenceFromText(textLength, hasNormalizedPdf, hasText);
  let score = Math.round(est * 100);
  if (isScan && textLength < 80) score = Math.min(score, 45);
  const pages = Math.max(pageCount ?? 1, 1);
  const charsPerPage = textLength / pages;
  if (charsPerPage > 500) score = Math.max(score, 95);
  return score;
}

function buildPageTextMap(markdownContent: string | undefined, pageCount: number | null): Record<number, string> {
  if (!markdownContent) return {};
  const pages = Math.max(pageCount ?? 1, 1);
  if (pages === 1) return { 1: markdownContent };
  const pageBreakPattern = /(?:---\s*page\s*\d+\s*---|\f|<!-- page \d+ -->)/gi;
  const parts = markdownContent.split(pageBreakPattern).filter(Boolean);
  const map: Record<number, string> = {};
  for (let i = 0; i < parts.length; i++) {
    map[i + 1] = parts[i].trim();
  }
  return map;
}

export async function processDocument(
  doc: DocumentRow,
  requestedBy: string | null
): Promise<OrchestratorResult> {
  const provider = getProcessingProvider();

  const decision = decideProcessing({
    mimeType: doc.mimeType,
    uploadSource: doc.uploadSource,
    pageCount: doc.pageCount,
    sizeBytes: doc.sizeBytes,
    hasTextLayer: doc.hasTextLayer,
    isScanLike: doc.isScanLike,
  });

  const sourceChannel = resolveSourceChannel(doc.uploadSource);
  const inputMode = resolveInputMode(doc, decision);
  const warnings: string[] = [];

  await updateDocumentStatus(doc.id, { sourceChannel });

  if (!decision.shouldProcess || !provider.isEnabled()) {
    await updateDocumentStatus(doc.id, {
      processingStatus: "skipped",
      processingStage: "none",
      processingProvider: provider.name,
      detectedInputMode: inputMode,
    });
    return {
      success: true,
      processingStatus: "skipped",
      processingStage: "none",
      aiInputSource: "none",
      detectedInputMode: inputMode,
      error: decision.reason,
    };
  }

  const fileUrl = await getSignedUrl(doc.storagePath);
  if (!fileUrl) {
    const error = "Failed to create signed URL for document";
    await updateDocumentStatus(doc.id, {
      processingStatus: "failed",
      processingError: error,
    });
    return { success: false, processingStatus: "failed", processingStage: "none", aiInputSource: "none", error };
  }

  await updateDocumentStatus(doc.id, {
    processingProvider: provider.name,
    processingStatus: "preprocessing_running",
    processingStage: "preprocessing",
    processingStartedAt: new Date(),
    processingError: null,
    detectedInputMode: inputMode,
  });

  const input: ProcessingInput = {
    documentId: doc.id,
    tenantId: doc.tenantId,
    storagePath: doc.storagePath,
    mimeType: doc.mimeType,
    fileUrl,
    pageCount: doc.pageCount,
    isScanLike: doc.isScanLike,
    hasTextLayer: doc.hasTextLayer,
    sourceChannel,
  };

  let ocrPdfPath: string | undefined;
  let normalizedPdfPath: string | undefined;
  let markdownPath: string | undefined;
  let markdownContent: string | undefined;
  let extractJsonPath: string | undefined;
  let currentStage: DocumentProcessingStage = "preprocessing";
  let aiInputSource: DocumentAiInputSource = "none";

  try {
    if (provider.name === "adobe") {
      warnings.push(
        "page_images:not_implemented — use PDF + markdown for AI until Adobe page raster export is wired."
      );
    }

    if (decision.runOcr) {
      currentStage = "ocr";
      await updateDocumentStatus(doc.id, { processingStage: "ocr" });

      const jobId = await createJob({
        documentId: doc.id,
        tenantId: doc.tenantId,
        provider: provider.name,
        jobType: "ocr",
        requestedBy,
        inputPath: doc.storagePath,
      });

      if (jobId) await updateJob(jobId, { status: "processing", startedAt: new Date() });

      const ocrResult = await provider.runOcr(input);

      if (jobId) {
        await updateJob(jobId, {
          status: ocrResult.success ? "completed" : "failed",
          finishedAt: new Date(),
          errorMessage: ocrResult.error ?? null,
          providerJobId: ocrResult.providerJobId ?? null,
          outputPath: ocrResult.outputPath ?? null,
        });
      }

      if (ocrResult.success && ocrResult.outputPath) {
        ocrPdfPath = ocrResult.outputPath;
        normalizedPdfPath = ocrResult.outputPath;
        aiInputSource = "ocr_text";
        input.fileUrl = (await getSignedUrl(ocrResult.outputPath)) ?? input.fileUrl;
      } else if (ocrResult.error) {
        warnings.push(`OCR warning: ${ocrResult.error}`);
      }
    }

    if (decision.runMarkdown) {
      currentStage = "markdown";
      await updateDocumentStatus(doc.id, { processingStage: "markdown" });

      const jobId = await createJob({
        documentId: doc.id,
        tenantId: doc.tenantId,
        provider: provider.name,
        jobType: "markdown",
        requestedBy,
        inputPath: ocrPdfPath ?? doc.storagePath,
      });

      if (jobId) await updateJob(jobId, { status: "processing", startedAt: new Date() });

      const mdResult = await provider.runMarkdown(input);

      if (jobId) {
        await updateJob(jobId, {
          status: mdResult.success ? "completed" : "failed",
          finishedAt: new Date(),
          errorMessage: mdResult.error ?? null,
          providerJobId: mdResult.providerJobId ?? null,
          outputPath: mdResult.outputPath ?? null,
        });
      }

      if (mdResult.success) {
        markdownPath = mdResult.outputPath;
        markdownContent = mdResult.outputContent;
        aiInputSource = "markdown";
      } else if (mdResult.error) {
        warnings.push(`Markdown warning: ${mdResult.error}`);
      }
    }

    // pdf-parse fallback: if no markdown yet and file is PDF, extract text layer directly.
    // Mirrors contract-review pipeline behaviour so both paths produce consistent text coverage.
    const isPdfDoc = (doc.mimeType ?? "").toLowerCase().includes("pdf");
    if (!markdownContent?.trim() && isPdfDoc) {
      const fallback = await extractTextFromPdfUrl(input.fileUrl).catch(() => null);
      if (fallback) {
        markdownContent = fallback;
        aiInputSource = "markdown";
        warnings.push("pdf_parse_fallback: text extracted from PDF text layer; provider markdown unavailable.");
        console.info("[orchestrator] pdf_parse_fallback applied", { documentId: doc.id, length: fallback.length });
      }
    }

    await updateDocumentStatus(doc.id, {
      processingStatus: "normalized",
      processingStage: "extract",
    });

    if (decision.runExtract) {
      currentStage = "extract";
      await updateDocumentStatus(doc.id, { processingStage: "extract" });

      const jobId = await createJob({
        documentId: doc.id,
        tenantId: doc.tenantId,
        provider: provider.name,
        jobType: "extract",
        requestedBy,
        inputPath: ocrPdfPath ?? doc.storagePath,
      });

      if (jobId) await updateJob(jobId, { status: "processing", startedAt: new Date() });

      const extractResult = await provider.runExtract(input);

      if (jobId) {
        await updateJob(jobId, {
          status: extractResult.success ? "completed" : "failed",
          finishedAt: new Date(),
          errorMessage: extractResult.error ?? null,
          providerJobId: extractResult.providerJobId ?? null,
          outputPath: extractResult.outputPath ?? null,
        });
      }

      if (extractResult.success && extractResult.outputPath) {
        extractJsonPath = extractResult.outputPath;
        if (!markdownContent) aiInputSource = "extract";
      } else if (extractResult.error) {
        warnings.push(`Extract warning: ${extractResult.error}`);
      }
    }

    const readability = computeReadabilityScore(
      doc.hasTextLayer ?? false,
      markdownContent,
      doc.pageCount,
      doc.isScanLike ?? false,
      Boolean(normalizedPdfPath || ocrPdfPath)
    );
    const pageTextMap = buildPageTextMap(markdownContent, doc.pageCount);

    currentStage = "completed";
    await updateDocumentStatus(doc.id, {
      processingStatus: "completed",
      processingStage: "completed",
      processingFinishedAt: new Date(),
      ocrPdfPath: ocrPdfPath ?? null,
      normalizedPdfPath: normalizedPdfPath ?? ocrPdfPath ?? null,
      markdownPath: markdownPath ?? null,
      markdownContent: markdownContent ?? null,
      extractJsonPath: extractJsonPath ?? null,
      aiInputSource,
      readabilityScore: readability,
      preprocessingWarnings: warnings.length ? warnings : [],
      pageTextMap: Object.keys(pageTextMap).length ? pageTextMap : null as unknown as Record<number, string>,
    });

    return {
      success: true,
      processingStatus: "completed",
      processingStage: "completed",
      aiInputSource,
      ocrPdfPath,
      normalizedPdfPath,
      markdownPath,
      markdownContent,
      extractJsonPath,
      detectedInputMode: inputMode,
      readabilityScore: readability,
      preprocessingWarnings: warnings,
      pageTextMap,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Processing failed";
    warnings.push(errorMessage);
    await updateDocumentStatus(doc.id, {
      processingStatus: "preprocessing_failed",
      processingStage: currentStage,
      processingFinishedAt: new Date(),
      processingError: errorMessage,
      preprocessingWarnings: warnings,
    });
    return {
      success: false,
      processingStatus: "preprocessing_failed",
      processingStage: currentStage,
      aiInputSource,
      detectedInputMode: inputMode,
      preprocessingWarnings: warnings,
      error: errorMessage,
    };
  }
}
