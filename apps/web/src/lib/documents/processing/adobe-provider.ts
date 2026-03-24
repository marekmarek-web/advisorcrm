import {
  getAccessToken,
  createAssetUpload,
  uploadAssetContent,
  submitOcrJob,
  submitPdfToMarkdownJob,
  submitExtractJob,
  pollJobResult,
  downloadResult,
  resolvePollDownloadUri,
} from "@/lib/adobe/client";
import { isZipBuffer, unzipFirstMarkdown, unzipStructuredDataJson } from "@/lib/adobe/zip-helpers";
import { createAdminClient } from "@/lib/supabase/server";
import { getProcessingConfig } from "./config";
import type { DocumentProcessingProviderInterface, ProcessingInput, ProcessingOutput } from "./types";
import type { AdobeJobPollResponse } from "@/lib/adobe/types";

async function fetchFileContent(fileUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
  return response.arrayBuffer();
}

async function uploadToAdobe(
  token: string,
  fileContent: ArrayBuffer,
  mediaType: string
): Promise<string> {
  const asset = await createAssetUpload(token, mediaType);
  await uploadAssetContent(asset.uploadUri, fileContent, mediaType);
  return asset.assetID;
}

async function saveToStorage(
  storagePath: string,
  content: ArrayBuffer | Uint8Array | string,
  contentType: string
): Promise<void> {
  const admin = createAdminClient();
  const data = typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
  const { error } = await admin.storage.from("documents").upload(storagePath, data, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Storage save failed: ${error.message}`);
}

function providerJobIdFromPoll(poll: AdobeJobPollResponse): string | undefined {
  const id = poll.asset?.assetID ?? poll.resource?.assetID;
  return typeof id === "string" && id ? id : undefined;
}

export class AdobeProvider implements DocumentProcessingProviderInterface {
  readonly name = "adobe" as const;

  isEnabled(): boolean {
    const config = getProcessingConfig();
    return config.processingEnabled && config.provider === "adobe" && !!config.adobeClientId;
  }

  async runOcr(input: ProcessingInput): Promise<ProcessingOutput> {
    try {
      const token = await getAccessToken();
      const fileContent = await fetchFileContent(input.fileUrl);
      const assetId = await uploadToAdobe(token, fileContent, input.mimeType ?? "application/pdf");

      const pollUrl = await submitOcrJob(token, assetId);
      const result = await pollJobResult(token, pollUrl);
      const downloadUri = resolvePollDownloadUri(result);
      if (!downloadUri) {
        return { success: false, error: "OCR completed but no download URI returned" };
      }

      const ocrPdf = await downloadResult(downloadUri);
      const outputPath = `${input.tenantId}/processing/${input.documentId}/ocr-${Date.now()}.pdf`;
      await saveToStorage(outputPath, ocrPdf, "application/pdf");

      return {
        success: true,
        outputPath,
        providerJobId: providerJobIdFromPoll(result),
        metadata: { pageCount: input.pageCount },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Adobe OCR failed",
      };
    }
  }

  async runMarkdown(input: ProcessingInput): Promise<ProcessingOutput> {
    try {
      const token = await getAccessToken();
      const fileContent = await fetchFileContent(input.fileUrl);
      const assetId = await uploadToAdobe(token, fileContent, input.mimeType ?? "application/pdf");

      const pollUrl = await submitPdfToMarkdownJob(token, assetId);
      const result = await pollJobResult(token, pollUrl);
      const downloadUri = resolvePollDownloadUri(result);
      if (!downloadUri) {
        return { success: false, error: "PDF-to-Markdown completed but no download URI returned" };
      }

      const rawBytes = await downloadResult(downloadUri);
      let textContent: string;
      if (isZipBuffer(rawBytes)) {
        const fromZip = await unzipFirstMarkdown(rawBytes);
        textContent = fromZip ?? new TextDecoder("utf-8", { fatal: false }).decode(rawBytes);
      } else {
        textContent = new TextDecoder("utf-8", { fatal: false }).decode(rawBytes);
      }

      const outputPath = `${input.tenantId}/processing/${input.documentId}/markdown-${Date.now()}.md`;
      await saveToStorage(outputPath, textContent, "text/markdown");

      return {
        success: true,
        outputPath,
        outputContent: textContent,
        providerJobId: providerJobIdFromPoll(result),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Adobe PDF-to-Markdown failed",
      };
    }
  }

  async runExtract(input: ProcessingInput): Promise<ProcessingOutput> {
    try {
      const token = await getAccessToken();
      const fileContent = await fetchFileContent(input.fileUrl);
      const assetId = await uploadToAdobe(token, fileContent, input.mimeType ?? "application/pdf");

      const pollUrl = await submitExtractJob(token, assetId);
      const result = await pollJobResult(token, pollUrl);
      const downloadUri = resolvePollDownloadUri(result);
      if (!downloadUri) {
        return { success: false, error: "Extract completed but no download URI returned" };
      }

      const extractZip = await downloadResult(downloadUri);
      const ts = Date.now();
      const zipPath = `${input.tenantId}/processing/${input.documentId}/extract-${ts}.zip`;
      await saveToStorage(zipPath, extractZip, "application/zip");

      const jsonText = await unzipStructuredDataJson(extractZip);
      let outputPath = zipPath;
      if (jsonText) {
        const jsonPath = `${input.tenantId}/processing/${input.documentId}/extract-${ts}-structuredData.json`;
        await saveToStorage(jsonPath, jsonText, "application/json");
        outputPath = jsonPath;
      }

      return {
        success: true,
        outputPath,
        providerJobId: providerJobIdFromPoll(result),
        metadata: { format: "zip", zipPath, hasStructuredJson: Boolean(jsonText) },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Adobe Extract failed",
      };
    }
  }
}
