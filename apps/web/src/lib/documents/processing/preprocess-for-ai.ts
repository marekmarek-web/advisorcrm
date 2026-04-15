/**
 * Adobe preprocessing step for the AI extraction pipeline.
 * Delegates to adobe-service (Plan 3 §5) — canonical OCR + markdown before GPT.
 */

import { preprocessDocument } from "@/lib/documents/adobe-service";
import { createAdminClient } from "@/lib/supabase/server";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import { extractTextFromPdfUrl } from "./pdf-text-fallback";

export type PreprocessResult = {
  preprocessed: boolean;
  /** Adobe / preprocessing layer outcome for pipeline persistence. */
  preprocessStatus: "completed" | "failed" | "skipped" | "partial";
  preprocessMode: "adobe" | "none" | "pdf_parse_fallback";
  fileUrl: string;
  markdownContent: string | null;
  ocrPdfPath: string | null;
  normalizedPdfPath: string | null;
  providerJobIds: string[];
  warnings: string[];
  readabilityScore: number;
  ocrConfidenceEstimate: number;
  pageCountEstimate: number | null;
};

/** Musí odpovídat `USABLE_TEXT_MIN` v `contract-review-scan-gate.ts` (scan defer vs. text layer). */
const USABLE_TEXT_MIN_FOR_PDF_LAYER_FALLBACK = 400;

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

export async function preprocessForAiExtraction(
  fileUrl: string,
  storagePath: string,
  tenantId: string,
  documentId: string,
  mimeType: string
): Promise<PreprocessResult> {
  const canonical = await preprocessDocument({
    fileUrl,
    storagePath,
    tenantId,
    documentId,
    mimeType,
    pageCount: null,
    hasTextLayer: null,
  });

  let bestFileUrl = fileUrl;
  if (canonical.normalizedPdfPath) {
    const u = await getSignedUrl(canonical.normalizedPdfPath);
    if (u) bestFileUrl = u;
  }

  const warnings = [...canonical.warnings];
  if (canonical.error) {
    warnings.push(`${canonical.error.code}: ${canonical.error.message}`);
  }

  const ocrConfidenceEstimate = canonical.ocrConfidenceEstimate ?? 0.5;
  const readabilityScore = Math.round(Math.min(1, Math.max(0, ocrConfidenceEstimate)) * 100);

  const preprocessed = Boolean(
    canonical.normalizedPdfPath ||
      (canonical.extractedText && canonical.extractedText.trim().length > 0)
  );

  const adobeDisabled = warnings.some((w) => w.includes("Adobe disabled"));
  let preprocessStatus: PreprocessResult["preprocessStatus"] = "skipped";
  let preprocessMode: PreprocessResult["preprocessMode"] = "adobe";
  if (adobeDisabled) {
    preprocessStatus = "skipped";
    preprocessMode = "none";
  } else if (canonical.error) {
    preprocessStatus = "failed";
  } else if (canonical.ok && preprocessed) {
    preprocessStatus = "completed";
  } else if (canonical.ok) {
    preprocessStatus = "partial";
  }

  let markdownContent = canonical.extractedText ?? null;
  const isPdf =
    mimeType === "application/pdf" || (mimeType?.toLowerCase().includes("pdf") ?? false);

  if (isPdf && (!markdownContent || !markdownContent.trim()) && bestFileUrl) {
    const fallbackText = await extractTextFromPdfUrl(bestFileUrl);
    if (fallbackText) {
      markdownContent = fallbackText;
      preprocessMode = "pdf_parse_fallback";
      warnings.push(
        "pdf_parse_fallback: text extracted server-side (PDF text layer); Adobe markdown unavailable."
      );
      if (preprocessStatus === "skipped" || preprocessStatus === "failed") {
        preprocessStatus = "partial";
      } else if (preprocessStatus === "completed") {
        preprocessStatus = "partial";
      }
    }
  }

  // Adobe sometimes returns a short garbage string while the PDF still has a rich native text layer.
  // Prefer longer pdf-parse output so scan gate + pipeline do not defer to endless "pending OCR".
  if (
    isPdf &&
    markdownContent?.trim() &&
    markdownContent.trim().length < USABLE_TEXT_MIN_FOR_PDF_LAYER_FALLBACK &&
    bestFileUrl
  ) {
    const fallbackText = await extractTextFromPdfUrl(bestFileUrl);
    if (fallbackText && fallbackText.trim().length > markdownContent.trim().length) {
      markdownContent = fallbackText;
      preprocessMode = "pdf_parse_fallback";
      warnings.push(
        "pdf_parse_fallback: replaced short Adobe output with native PDF text layer (longer extract)."
      );
      if (preprocessStatus === "completed") {
        preprocessStatus = "partial";
      }
    }
  }

  const hasUsableMarkdown = Boolean(markdownContent?.trim());
  const adobePreprocessedOk = canonical.ok && preprocessed && !adobeDisabled;

  return {
    preprocessed: adobePreprocessedOk || (hasUsableMarkdown && preprocessMode === "pdf_parse_fallback"),
    preprocessStatus,
    preprocessMode,
    fileUrl: bestFileUrl,
    markdownContent,
    ocrPdfPath: canonical.normalizedPdfPath ?? null,
    normalizedPdfPath: canonical.normalizedPdfPath ?? null,
    providerJobIds: canonical.providerJobIds,
    warnings,
    readabilityScore,
    ocrConfidenceEstimate,
    pageCountEstimate: canonical.pageCount ?? null,
  };
}
