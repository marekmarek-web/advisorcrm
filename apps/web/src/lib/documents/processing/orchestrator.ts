import { db, documents, documentProcessingJobs, eq, and } from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import { getProcessingProvider } from "./provider";
import { decideProcessing } from "./heuristics";
import type { ProcessingInput, OrchestratorResult } from "./types";
import type {
  DocumentAiInputSource,
  DocumentProcessingJobStatus,
  DocumentProcessingProvider,
  DocumentProcessingStage,
  DocumentProcessingStatus,
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
    processingError: string | null;
    processingStartedAt: Date | null;
    processingFinishedAt: Date | null;
    ocrPdfPath: string | null;
    markdownPath: string | null;
    markdownContent: string | null;
    extractJsonPath: string | null;
    aiInputSource: DocumentAiInputSource;
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

  if (!decision.shouldProcess || !provider.isEnabled()) {
    await updateDocumentStatus(doc.id, {
      processingStatus: "skipped",
      processingStage: "none",
      processingProvider: provider.name,
    });
    return {
      success: true,
      processingStatus: "skipped",
      processingStage: "none",
      aiInputSource: "none",
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
    processingStatus: "processing",
    processingStage: "none",
    processingStartedAt: new Date(),
    processingError: null,
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
  };

  let ocrPdfPath: string | undefined;
  let markdownPath: string | undefined;
  let markdownContent: string | undefined;
  let extractJsonPath: string | undefined;
  let currentStage: DocumentProcessingStage = "none";
  let aiInputSource: DocumentAiInputSource = "none";

  try {
    // Step 1: OCR (if needed)
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
        aiInputSource = "ocr_text";
        input.fileUrl = (await getSignedUrl(ocrResult.outputPath)) ?? input.fileUrl;
      }
    }

    // Step 2: Markdown conversion
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
      }
    }

    // Step 3: Extract JSON (if enabled)
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
      }
    }

    currentStage = "completed";
    await updateDocumentStatus(doc.id, {
      processingStatus: "completed",
      processingStage: "completed",
      processingFinishedAt: new Date(),
      ocrPdfPath: ocrPdfPath ?? null,
      markdownPath: markdownPath ?? null,
      markdownContent: markdownContent ?? null,
      extractJsonPath: extractJsonPath ?? null,
      aiInputSource,
    });

    return {
      success: true,
      processingStatus: "completed",
      processingStage: "completed",
      aiInputSource,
      ocrPdfPath,
      markdownPath,
      markdownContent,
      extractJsonPath,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Processing failed";
    await updateDocumentStatus(doc.id, {
      processingStatus: "failed",
      processingStage: currentStage,
      processingFinishedAt: new Date(),
      processingError: errorMessage,
    });
    return {
      success: false,
      processingStatus: "failed",
      processingStage: currentStage,
      aiInputSource,
      error: errorMessage,
    };
  }
}
