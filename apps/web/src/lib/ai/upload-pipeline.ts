/**
 * Server-side contract upload pipeline.
 * Flow: upload file -> storage -> DB metadata -> AI extraction (input_file) -> draft actions -> review queue.
 */

/** Supported input for extraction: file ID (OpenAI), URL (signed), or base64. Primary flow uses URL. */
export type ContractFileInput =
  | { type: "file_id"; fileId: string }
  | { type: "url"; url: string }
  | { type: "base64"; data: string; mimeType: string };

export interface ContractUploadMetadata {
  id: string;
  tenantId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedAt: string; // ISO
  extractionId?: string | null;
}

export interface ContractStorageService {
  upload(tenantId: string, file: Buffer | Blob, fileName: string): Promise<string>;
  getUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
}

export type ContractUploadResult =
  | { ok: true; metadata: ContractUploadMetadata }
  | { ok: false; error: string };

/**
 * Normalise non-PDF inputs before extraction.
 *
 * Strategy (as of current implementation):
 * - PDF: primary path, no conversion needed.
 * - Images (JPEG/PNG/WEBP/HEIC): accepted directly; scan gate handles text-less inputs.
 * - DOC/DOCX: explicitly rejected at upload API layer — no server-side Word→PDF converter.
 *   Users must convert to PDF before uploading.
 *
 * This function is intentionally not implemented — conversion depends on a LibreOffice or
 * cloud converter integration that is not yet available.
 */
export async function normaliseContractFileToPdf(
  _input: ContractFileInput
): Promise<{ ok: true; pdfUrl: string } | { ok: false; error: string }> {
  return {
    ok: false,
    error:
      "Převod formátu není implementován. Nahrajte PDF nebo obrázek (JPG, PNG). Soubory Word nejsou podporovány — převeďte je do PDF před nahráním.",
  };
}
