/**
 * Server-side contract upload pipeline (foundation).
 * Full flow: upload file -> storage -> DB metadata -> optional AI processing (e.g. input_file in Responses API).
 */

export interface ContractUploadMetadata {
  id: string;
  tenantId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedAt: string; // ISO
  /** TODO: link to extracted data / review queue when implemented */
  extractionId?: string | null;
}

export interface ContractStorageService {
  /** Upload file and return storage key (path/bucket key). */
  upload(tenantId: string, file: Buffer | Blob, fileName: string): Promise<string>;
  /** Get signed URL or stream for download. */
  getUrl(storageKey: string): Promise<string>;
}

export interface ContractUploadResult {
  ok: true;
  metadata: ContractUploadMetadata;
} | {
  ok: false;
  error: string;
}

/**
 * TODO: Implement in next phase.
 * 1. Accept multipart upload in API route.
 * 2. Store file in storage (e.g. Supabase Storage or S3) via ContractStorageService.
 * 3. Insert row into contracts/uploads table (or equivalent) with ContractUploadMetadata.
 * 4. Optionally enqueue for AI processing: pass file_id to Responses API as input_file for PDF extraction.
 */
export async function uploadContractFile(
  _tenantId: string,
  _file: Buffer | Blob,
  _fileName: string
): Promise<ContractUploadResult> {
  return { ok: false, error: "Upload pipeline not implemented yet." };
}
