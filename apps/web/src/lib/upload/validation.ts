/**
 * Shared file-upload validation contract (client + server).
 *
 * Jediný zdroj pravdy pro:
 *  - seznamy povolených MIME typů (per-endpoint),
 *  - maximální velikosti,
 *  - tolerantní klientskou validaci (iOS/Safari často posílá prázdný `file.type`
 *    nebo `application/octet-stream` — finální rozhodnutí dělá server
 *    přes `detectMagicMimeTypeFromBytes`; klient tedy akceptuje přípona-based
 *    hint).
 */

export const ALLOWED_MIME_TYPES_GENERAL = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_MIME_TYPES_QUICK_IMAGES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_MIME_TYPES_CONTRACTS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_MIME_TYPES_CLIENT_PORTAL = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Backwards-compat alias — default allowlist = general. */
export const ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES_GENERAL;

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = "20 MB";

export const MAX_FILE_SIZE_BYTES_CLIENT_PORTAL = 10 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL_CLIENT_PORTAL = "10 MB";

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

/** Extract lowercase extension, without dot. */
function getExtension(name: string): string {
  const match = name.toLowerCase().trim().match(/\.([a-z0-9]+)$/);
  return match ? match[1]! : "";
}

/**
 * Infer a probable MIME type from filename, falling back when `file.type`
 * is empty or `application/octet-stream` (typical on iOS Safari).
 * Returns a MIME only if it is in the provided allowlist.
 */
export function inferMimeFromExtension(
  name: string,
  allowed: readonly string[] = ALLOWED_MIME_TYPES_GENERAL
): string | null {
  const ext = getExtension(name);
  const mime = EXTENSION_TO_MIME[ext];
  if (!mime) return null;
  return allowed.map((t) => t.toLowerCase()).includes(mime) ? mime : null;
}

/**
 * Accept `file.type` as-is if present and in allowlist.
 * If empty / `application/octet-stream` / unknown, try to infer from filename.
 * Returns `null` if nothing matches — caller decides whether to reject.
 */
export function resolveEffectiveMime(
  file: Pick<File, "type" | "name">,
  allowed: readonly string[] = ALLOWED_MIME_TYPES_GENERAL
): string | null {
  const declared = (file.type || "").toLowerCase().trim();
  const allowedSet = new Set(allowed.map((t) => t.toLowerCase()));
  if (declared && allowedSet.has(declared)) return declared;
  if (!declared || declared === "application/octet-stream" || declared === "binary/octet-stream") {
    return inferMimeFromExtension(file.name, allowed);
  }
  return null;
}

type ValidationOptions = {
  allowedMimeTypes?: readonly string[];
  maxSizeBytes?: number;
  /** Custom label to render in size errors; defaults based on maxSizeBytes. */
  maxSizeLabel?: string;
};

export type ValidationResult = { valid: boolean; error?: string; effectiveMime?: string };

function formatAllowedLabel(allowed: readonly string[]): string {
  const hasPdf = allowed.includes("application/pdf");
  const images = allowed.filter((t) => t.startsWith("image/"));
  const niceImageNames = images
    .map((t) => t.replace("image/", "").toUpperCase())
    .filter((n) => n !== "JPG")
    .join(", ");
  if (hasPdf && images.length) {
    return `Povolené jsou PDF a obrázky (${niceImageNames}).`;
  }
  if (hasPdf) return "Povolené je PDF.";
  return `Povolené jsou obrázky (${niceImageNames}).`;
}

function formatSizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const rounded = Number.isInteger(mb) ? mb.toFixed(0) : mb.toFixed(1);
  return `${rounded} MB`;
}

/**
 * Client-side validation. Tolerantní na prázdný `file.type` — spoléhá na
 * přípona-based hint; server stejně provede magic-byte kontrolu
 * (`detectMagicMimeTypeFromBytes`).
 */
export function validateFile(file: File, options: ValidationOptions = {}): ValidationResult {
  const allowed = options.allowedMimeTypes ?? ALLOWED_MIME_TYPES_GENERAL;
  const maxSize = options.maxSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const sizeLabel = options.maxSizeLabel ?? formatSizeLabel(maxSize);

  const effectiveMime = resolveEffectiveMime(file, allowed);
  if (!effectiveMime) {
    return {
      valid: false,
      error: `Nepodporovaný typ souboru. ${formatAllowedLabel(allowed)}`,
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `Soubor je příliš velký (max ${sizeLabel}).`,
    };
  }

  return { valid: true, effectiveMime };
}
