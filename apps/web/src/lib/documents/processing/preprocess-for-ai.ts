/**
 * Adobe preprocessing step for the AI extraction pipeline.
 * Delegates to adobe-service (Plan 3 §5) — canonical OCR + markdown before GPT.
 */

import { preprocessDocument } from "@/lib/documents/adobe-service";
import { createAdminClient } from "@/lib/supabase/server";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import { extractTextFromPdfUrl } from "./pdf-text-fallback";
import { scoreTextLayerQuality, getTextQualityGarbageThreshold } from "./text-quality";

export type PreprocessResult = {
  preprocessed: boolean;
  /** Adobe / preprocessing layer outcome for pipeline persistence. */
  preprocessStatus: "completed" | "failed" | "skipped" | "partial";
  preprocessMode: "adobe" | "none" | "pdf_parse_fallback" | "pdf_parse_fallback_garbage";
  fileUrl: string;
  markdownContent: string | null;
  ocrPdfPath: string | null;
  normalizedPdfPath: string | null;
  providerJobIds: string[];
  warnings: string[];
  readabilityScore: number;
  ocrConfidenceEstimate: number;
  pageCountEstimate: number | null;
  /** 0..1 — estimated quality of the extracted text layer (scoreTextLayerQuality). */
  textQualityScore: number | null;
  /** True when the text layer is almost certainly OCR garbage. */
  textQualityIsGarbage: boolean;
  /** Human-readable reasons from `scoreTextLayerQuality`. */
  textQualityReasons: string[];
};

/** Musí odpovídat `USABLE_TEXT_MIN` v `contract-review-scan-gate.ts` (scan defer vs. text layer). */
const USABLE_TEXT_MIN_FOR_PDF_LAYER_FALLBACK = 400;
const PREPROCESS_CACHE_TTL_MS = 30 * 60 * 1000;

const preprocessMemoryCache = new Map<string, { expiresAt: number; result: PreprocessResult }>();

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
  const cacheKey = `${tenantId}:${storagePath}:${mimeType}`;
  const cached = preprocessMemoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    let refreshedFileUrl = cached.result.fileUrl;
    if (cached.result.normalizedPdfPath) {
      refreshedFileUrl = (await getSignedUrl(cached.result.normalizedPdfPath)) ?? refreshedFileUrl;
    }
    return {
      ...cached.result,
      fileUrl: refreshedFileUrl,
      warnings: [...cached.result.warnings, "preprocess_reused_memory_cache"],
    };
  }

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

  // Score the text layer quality so downstream gates can detect garbled OCR
  // (e.g. scanner-embedded garbage that `pdf-parse` happily returns as text).
  let textQualityScore: number | null = null;
  let textQualityIsGarbage = false;
  let textQualityReasons: string[] = [];
  if (markdownContent && markdownContent.trim().length >= 40) {
    const quality = scoreTextLayerQuality(markdownContent, {
      garbageThreshold: getTextQualityGarbageThreshold(),
    });
    textQualityScore = quality.score;
    textQualityIsGarbage = quality.isLikelyGarbage;
    textQualityReasons = quality.reasons;
    if (quality.isLikelyGarbage) {
      warnings.push(
        `text_quality_garbage: score=${quality.score.toFixed(2)}, reasons=${quality.reasons.join("|")}`
      );
      // Cap readability so downstream UI / trace aren't misled by the long but
      // meaningless text length. Real reading quality here is terrible.
      const cappedReadability = Math.min(readabilityScore, 35);
      if (cappedReadability !== readabilityScore) {
        warnings.push(
          `text_quality_garbage_readability_capped: ${readabilityScore} -> ${cappedReadability}`
        );
      }
      // Flag the preprocess mode so the scan gate + pipeline know to route through vision.
      if (preprocessMode === "pdf_parse_fallback") {
        preprocessMode = "pdf_parse_fallback_garbage";
      }
      const result = {
        preprocessed: adobePreprocessedOk || hasUsableMarkdown,
        preprocessStatus,
        preprocessMode,
        fileUrl: bestFileUrl,
        markdownContent,
        ocrPdfPath: canonical.normalizedPdfPath ?? null,
        normalizedPdfPath: canonical.normalizedPdfPath ?? null,
        providerJobIds: canonical.providerJobIds,
        warnings,
        readabilityScore: cappedReadability,
        ocrConfidenceEstimate: Math.min(ocrConfidenceEstimate, 0.35),
        pageCountEstimate: canonical.pageCount ?? null,
        textQualityScore,
        textQualityIsGarbage,
        textQualityReasons,
      };
      preprocessMemoryCache.set(cacheKey, { expiresAt: Date.now() + PREPROCESS_CACHE_TTL_MS, result });
      return result;
    }
  }

  const result = {
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
    textQualityScore,
    textQualityIsGarbage,
    textQualityReasons,
  };
  preprocessMemoryCache.set(cacheKey, { expiresAt: Date.now() + PREPROCESS_CACHE_TTL_MS, result });
  return result;
}
