import { db, documents, eq } from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import type { DocumentAiInputSource } from "db";

export type AiInputResolution = {
  source: DocumentAiInputSource;
  fileUrl: string | null;
  textContent: string | null;
  quality: "high" | "medium" | "low" | "none";
  warning: string | null;
};

type DocumentForAi = {
  id: string;
  tenantId: string;
  storagePath: string;
  mimeType: string | null;
  processingStatus: string | null;
  aiInputSource: string | null;
  markdownContent: string | null;
  markdownPath: string | null;
  ocrPdfPath: string | null;
  extractJsonPath: string | null;
  hasTextLayer: boolean | null;
  isScanLike: boolean | null;
};

async function getSignedUrl(path: string): Promise<string | null> {
  const admin = createAdminClient();
  const { signedUrl } = await createSignedStorageUrl({
    adminClient: admin,
    bucket: "documents",
    path,
    purpose: "internal_processing",
  });
  return signedUrl;
}

async function readStorageText(path: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("documents").download(path);
  if (error || !data) return null;
  return data.text();
}

/**
 * Resolve the best available AI input for a document.
 * Priority: Markdown > Extract JSON > OCR PDF > Original file
 */
export async function resolveAiInput(doc: DocumentForAi): Promise<AiInputResolution> {
  // Priority 1: Markdown content (stored inline)
  if (doc.markdownContent && doc.markdownContent.trim().length > 50) {
    return {
      source: "markdown",
      fileUrl: null,
      textContent: doc.markdownContent,
      quality: "high",
      warning: null,
    };
  }

  // Priority 2: Markdown from storage
  if (doc.markdownPath) {
    const text = await readStorageText(doc.markdownPath);
    if (text && text.trim().length > 50) {
      return {
        source: "markdown",
        fileUrl: null,
        textContent: text,
        quality: "high",
        warning: null,
      };
    }
  }

  // Priority 3: Extract structured JSON (Adobe Extract stores structuredData.json when unzip succeeds; else ZIP path)
  if (doc.extractJsonPath) {
    const url = await getSignedUrl(doc.extractJsonPath);
    if (url) {
      return {
        source: "extract",
        fileUrl: url,
        textContent: null,
        quality: "medium",
        warning: null,
      };
    }
  }

  // Priority 4: OCR PDF (searchable PDF with text layer)
  if (doc.ocrPdfPath) {
    const url = await getSignedUrl(doc.ocrPdfPath);
    if (url) {
      return {
        source: "ocr_text",
        fileUrl: url,
        textContent: null,
        quality: "medium",
        warning: null,
      };
    }
  }

  // Priority 5: Original file with native text layer
  if (doc.hasTextLayer) {
    const url = await getSignedUrl(doc.storagePath);
    return {
      source: "native_text",
      fileUrl: url,
      textContent: null,
      quality: "medium",
      warning: null,
    };
  }

  // Priority 6: Original file (no processing, no text layer)
  const url = await getSignedUrl(doc.storagePath);
  const isScan = doc.isScanLike;
  const processingFailed = doc.processingStatus === "failed";

  return {
    source: "none",
    fileUrl: url,
    textContent: null,
    quality: isScan ? "low" : "medium",
    warning: processingFailed
      ? "Zpracování dokumentu selhalo. AI analýza poběží v omezeném režimu."
      : isScan
        ? "Dokument je sken bez textové vrstvy. AI analýza bude omezená."
        : null,
  };
}

/**
 * Load a document row and resolve AI input in one call.
 */
export async function resolveAiInputForDocument(documentId: string): Promise<AiInputResolution | null> {
  const [doc] = await db
    .select({
      id: documents.id,
      tenantId: documents.tenantId,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      processingStatus: documents.processingStatus,
      aiInputSource: documents.aiInputSource,
      markdownContent: documents.markdownContent,
      markdownPath: documents.markdownPath,
      ocrPdfPath: documents.ocrPdfPath,
      extractJsonPath: documents.extractJsonPath,
      hasTextLayer: documents.hasTextLayer,
      isScanLike: documents.isScanLike,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc) return null;
  return resolveAiInput(doc);
}
