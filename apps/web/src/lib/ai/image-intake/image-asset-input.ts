/**
 * Raw image asset from assistant chat request body (before server-side HEIC→JPEG normalizace).
 */

export type ImageAssetInput = {
  /** Optional — generated if missing. */
  assetId?: string;
  /** Storage URL or data URL. Required. */
  url: string;
  mimeType: string;
  filename?: string | null;
  sizeBytes?: number;
  width?: number | null;
  height?: number | null;
  contentHash?: string | null;
};
