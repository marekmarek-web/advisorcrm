export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = "20 MB";

type ValidationOptions = {
  allowedMimeTypes?: readonly string[];
  maxSizeBytes?: number;
};

export function validateFile(file: File, options: ValidationOptions = {}): { valid: boolean; error?: string } {
  const allowed = new Set((options.allowedMimeTypes ?? ALLOWED_MIME_TYPES).map((type) => type.toLowerCase()));
  const maxSize = options.maxSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const mimeType = (file.type || "").toLowerCase();

  if (!mimeType || !allowed.has(mimeType)) {
    return {
      valid: false,
      error: "Nepodporovaný typ souboru. Povolené jsou PDF a obrázky (JPG, PNG, WEBP, GIF, HEIC).",
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `Soubor je příliš velký (max ${MAX_FILE_SIZE_LABEL}).`,
    };
  }

  return { valid: true };
}

