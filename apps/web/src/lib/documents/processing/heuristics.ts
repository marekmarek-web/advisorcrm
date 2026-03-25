import type { ProcessingDecision } from "./types";
import { getProcessingConfig } from "./config";

type HeuristicsInput = {
  mimeType: string | null;
  uploadSource: string | null;
  pageCount: number | null;
  sizeBytes: number | null;
  hasTextLayer: boolean | null;
  isScanLike: boolean | null;
};

const PDF_MIME = "application/pdf";
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);
const MAX_PAGES_FOR_PROCESSING = 50;
const MAX_SIZE_FOR_PROCESSING = 100 * 1024 * 1024; // 100 MB

export function decideProcessing(input: HeuristicsInput): ProcessingDecision {
  const config = getProcessingConfig();

  if (!config.processingEnabled) {
    return { shouldProcess: false, runOcr: false, runMarkdown: false, runExtract: false, reason: "processing_disabled" };
  }

  if (config.provider === "disabled" || config.provider === "none") {
    return { shouldProcess: false, runOcr: false, runMarkdown: false, runExtract: false, reason: "no_provider" };
  }

  const mime = input.mimeType?.toLowerCase() ?? "";
  const isPdf = mime === PDF_MIME;
  const isImage = IMAGE_MIMES.has(mime);

  if (!isPdf && !isImage) {
    return { shouldProcess: false, runOcr: false, runMarkdown: false, runExtract: false, reason: "unsupported_mime" };
  }

  if (input.sizeBytes && input.sizeBytes > MAX_SIZE_FOR_PROCESSING) {
    return { shouldProcess: false, runOcr: false, runMarkdown: false, runExtract: false, reason: "file_too_large" };
  }

  if (input.pageCount && input.pageCount > MAX_PAGES_FOR_PROCESSING) {
    return { shouldProcess: false, runOcr: false, runMarkdown: false, runExtract: false, reason: "too_many_pages" };
  }

  const isMobileScan =
    input.uploadSource === "mobile_scan" ||
    input.uploadSource === "web_scan" ||
    input.uploadSource === "mobile_camera";
  const scanLike = input.isScanLike ?? isMobileScan;
  const hasText = input.hasTextLayer ?? false;

  if (isMobileScan || scanLike) {
    return {
      shouldProcess: true,
      runOcr: true,
      runMarkdown: true,
      runExtract: config.extractEnabled,
      reason: "scan_document",
    };
  }

  if (isPdf && hasText) {
    return {
      shouldProcess: true,
      runOcr: false,
      runMarkdown: true,
      runExtract: config.extractEnabled,
      reason: "text_pdf",
    };
  }

  if (isPdf && !hasText) {
    return {
      shouldProcess: true,
      runOcr: true,
      runMarkdown: true,
      runExtract: config.extractEnabled,
      reason: "image_pdf_no_text",
    };
  }

  if (isImage) {
    return {
      shouldProcess: true,
      runOcr: true,
      runMarkdown: true,
      runExtract: false,
      reason: "image_file",
    };
  }

  return { shouldProcess: false, runOcr: false, runMarkdown: false, runExtract: false, reason: "no_match" };
}
