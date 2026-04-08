/**
 * Převod HEIC/HEIF na JPEG před image intake vision voláními (OpenAI spolehlivě nebere HEIC v data URL).
 * Sharp + libvips na serveru — stejný princip jako scan PDF pipeline (build-pdf-from-images-server).
 *
 * Pozn.: Na některých prostředích bez podpory libheif může sharp selhat; pak vracíme srozumitelnou hlášku pro poradce.
 * Runtime: oficiální sharp prebuildy pro linux-x64/macOS často HEIC umí; vlastní minimální Docker/Alpine bez libheif
 * může převod shodit — ověřte `sharp` + HEIC na cílovém image před nasazením.
 */

import type { ImageAssetInput } from "./image-asset-input";
import { MAX_IMAGE_SIZE_BYTES } from "./types";

const HEIC_MIMES = new Set(["image/heic", "image/heif"]);

/** Parsování data URL pro testy a pro extrakci base64. */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  const mime = match[1]!.trim().toLowerCase();
  const base64 = match[2]!.replace(/\s/g, "");
  if (!base64) return null;
  return { mime, base64 };
}

function normalizedMime(mimeType: string): string {
  return mimeType.toLowerCase().split(";")[0]!.trim();
}

/**
 * Doplní MIME z data URL nebo přípony, když klient pošle prázdný/type špatně (časté u iOS).
 */
export function inferMimeTypeForIntakeAsset(asset: ImageAssetInput): ImageAssetInput {
  const parsed = parseDataUrl(asset.url);
  if (parsed && HEIC_MIMES.has(parsed.mime)) {
    const current = normalizedMime(asset.mimeType);
    if (!HEIC_MIMES.has(current)) {
      return { ...asset, mimeType: parsed.mime };
    }
  }
  const name = (asset.filename ?? "").toLowerCase();
  if (name.endsWith(".heif")) {
    const current = normalizedMime(asset.mimeType);
    if (!HEIC_MIMES.has(current)) {
      return { ...asset, mimeType: "image/heif" };
    }
  }
  if (name.endsWith(".heic")) {
    const current = normalizedMime(asset.mimeType);
    if (!HEIC_MIMES.has(current)) {
      return { ...asset, mimeType: "image/heic" };
    }
  }
  return asset;
}

export function isHeicOrHeifIntakeAsset(asset: ImageAssetInput): boolean {
  if (HEIC_MIMES.has(normalizedMime(asset.mimeType))) return true;
  const p = parseDataUrl(asset.url);
  if (p && HEIC_MIMES.has(p.mime)) return true;
  const n = (asset.filename ?? "").toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif");
}

function toJpegFilename(filename: string | null | undefined): string | null {
  if (!filename?.trim()) return null;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".heic")) return `${filename.slice(0, -5)}.jpg`;
  if (lower.endsWith(".heif")) return `${filename.slice(0, -5)}.jpg`;
  return `${filename.replace(/\.[^.]+$/, "") || "image"}.jpg`;
}

async function bufferFromAssetUrl(asset: ImageAssetInput): Promise<Buffer> {
  const { url } = asset;
  if (url.startsWith("data:")) {
    const p = parseDataUrl(url);
    if (!p) throw new Error("invalid_data_url");
    return Buffer.from(p.base64, "base64");
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > MAX_IMAGE_SIZE_BYTES) throw new Error("remote_too_large");
    return buf;
  }
  throw new Error("unsupported_url_scheme");
}

/**
 * Jedna položka: HEIC/HEIF → JPEG data URL; ostatní beze změny.
 */
export async function normalizeHeicHeifIntakeAssetIfNeeded(asset: ImageAssetInput): Promise<ImageAssetInput> {
  if (!isHeicOrHeifIntakeAsset(asset)) {
    return asset;
  }

  const buffer = await bufferFromAssetUrl(asset);
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("heic_source_too_large");
  }

  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(buffer).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const b64 = jpeg.toString("base64");

  return {
    ...asset,
    url: `data:image/jpeg;base64,${b64}`,
    mimeType: "image/jpeg",
    filename: toJpegFilename(asset.filename),
    sizeBytes: jpeg.length,
    width: null,
    height: null,
    contentHash: null,
  };
}

const HEIC_CONVERSION_ADVISOR_MESSAGE =
  "Fotku ve formátu HEIC/HEIF se nepodařilo převést na podporovaný obrázek. Zkuste ji v telefonu uložit jako JPEG, nebo v nastavení fotoaparátu použít „nejkompatibilnější“ formát. Můžete také zkusit jiný prohlížeč.";

/**
 * Inferuje MIME, převede všechny HEIC/HEIF assety na JPEG.
 */
export async function normalizeIntakeImageAssetsForVision(
  assets: ImageAssetInput[],
): Promise<
  | { ok: true; assets: ImageAssetInput[] }
  | { ok: false; advisorMessage: string; reasonCode: string }
> {
  const inferred = assets.map(inferMimeTypeForIntakeAsset);
  const out: ImageAssetInput[] = [];
  for (const a of inferred) {
    try {
      out.push(await normalizeHeicHeifIntakeAssetIfNeeded(a));
    } catch {
      return {
        ok: false,
        advisorMessage: HEIC_CONVERSION_ADVISOR_MESSAGE,
        reasonCode: "heic_conversion_failed",
      };
    }
  }
  return { ok: true, assets: out };
}
