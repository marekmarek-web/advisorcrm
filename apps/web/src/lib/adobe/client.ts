import type { AdobeTokenResponse, AdobeAssetUploadResponse, AdobeJobPollResponse } from "./types";
import { getProcessingConfig } from "@/lib/documents/processing/config";

/** Adobe PDF Services host per region (see Getting Started). */
export function getAdobeServiceOrigin(region: string): string {
  const r = region.trim().toLowerCase();
  if (r === "ew1" || r === "eu") return "https://pdf-services-ew1.adobe.io";
  if (r === "ue1") return "https://pdf-services-ue1.adobe.io";
  return "https://pdf-services.adobe.io";
}

function serviceOrigin(): string {
  return getAdobeServiceOrigin(getProcessingConfig().adobeRegion);
}

function resolvePollLocation(location: string): string {
  if (location.startsWith("http://") || location.startsWith("https://")) return location;
  const origin = serviceOrigin();
  return `${origin}${location.startsWith("/") ? "" : "/"}${location}`;
}

let _cachedToken: { origin: string; token: string; expiresAt: number } | null = null;

export function getDownloadUriFromPollBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const top = o.downloadUri ?? o.dowloadUri;
  if (typeof top === "string" && top.trim()) return top;

  const pick = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const n = node as Record<string, unknown>;
    const u = n.downloadUri ?? n.dowloadUri;
    return typeof u === "string" && u.trim() ? u : null;
  };

  return pick(o.resource) ?? pick(o.asset);
}

export function resolvePollDownloadUri(poll: AdobeJobPollResponse): string | null {
  if (poll.downloadUri && typeof poll.downloadUri === "string") return poll.downloadUri;
  const fromNested =
    poll.asset?.downloadUri ??
    (poll.asset as { dowloadUri?: string } | undefined)?.dowloadUri ??
    poll.resource?.downloadUri ??
    (poll.resource as { dowloadUri?: string } | undefined)?.dowloadUri;
  if (typeof fromNested === "string" && fromNested.trim()) return fromNested;
  return null;
}

export async function getAccessToken(): Promise<string> {
  const origin = serviceOrigin();
  if (_cachedToken && _cachedToken.origin === origin && Date.now() < _cachedToken.expiresAt - 60_000) {
    return _cachedToken.token;
  }

  const config = getProcessingConfig();
  if (!config.adobeClientId || !config.adobeClientSecret) {
    throw new Error("Adobe PDF Services credentials not configured");
  }

  const body = new URLSearchParams({
    client_id: config.adobeClientId,
    client_secret: config.adobeClientSecret,
  });

  const response = await fetch(`${origin}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Adobe token request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AdobeTokenResponse;

  _cachedToken = {
    origin,
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export async function createAssetUpload(
  token: string,
  mediaType: string
): Promise<AdobeAssetUploadResponse> {
  const config = getProcessingConfig();
  const origin = serviceOrigin();

  const response = await fetch(`${origin}/assets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-key": config.adobeClientId!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mediaType }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Adobe asset creation failed: ${response.status} ${text}`);
  }

  return (await response.json()) as AdobeAssetUploadResponse;
}

export async function uploadAssetContent(
  uploadUri: string,
  content: ArrayBuffer,
  mediaType: string
): Promise<void> {
  const response = await fetch(uploadUri, {
    method: "PUT",
    headers: { "Content-Type": mediaType },
    body: content,
  });

  if (!response.ok) {
    throw new Error(`Adobe asset upload failed: ${response.status}`);
  }
}

export async function submitOcrJob(token: string, assetId: string): Promise<string> {
  const config = getProcessingConfig();
  const origin = serviceOrigin();
  const ocrLang = config.adobeOcrLang?.trim() || "en-US";

  const response = await fetch(`${origin}/operation/ocr`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-key": config.adobeClientId!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assetID: assetId,
      ocrLang,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Adobe OCR job submission failed: ${response.status} ${text}`);
  }

  const location = response.headers.get("location");
  if (!location) throw new Error("Adobe OCR: no location header in response");
  return resolvePollLocation(location);
}

export async function submitExportPdfJob(
  token: string,
  assetId: string,
  targetFormat: "docx" | "xlsx" | "pptx" | "rtf" | "md" = "docx"
): Promise<string> {
  const config = getProcessingConfig();
  const origin = serviceOrigin();

  const response = await fetch(`${origin}/operation/exportpdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-key": config.adobeClientId!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assetID: assetId,
      targetFormat,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Adobe Export job submission failed: ${response.status} ${text}`);
  }

  const location = response.headers.get("location");
  if (!location) throw new Error("Adobe Export: no location header in response");
  return resolvePollLocation(location);
}

/**
 * PDF → Markdown (dedicated op when available), else Export PDF with targetFormat md.
 * @see https://developer.adobe.com/document-services/docs/apis/#tag/PDF-To-Markdown
 */
export async function submitPdfToMarkdownJob(token: string, assetId: string): Promise<string> {
  const config = getProcessingConfig();
  const origin = serviceOrigin();
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-api-key": config.adobeClientId!,
    "Content-Type": "application/json",
  } as const;

  let response = await fetch(`${origin}/operation/pdftomarkdown`, {
    method: "POST",
    headers,
    body: JSON.stringify({ assetID: assetId }),
  });

  if (!response.ok) {
    response = await fetch(`${origin}/operation/exportpdf`, {
      method: "POST",
      headers,
      body: JSON.stringify({ assetID: assetId, targetFormat: "md" }),
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Adobe PDF-to-Markdown job submission failed: ${response.status} ${text}`);
  }

  const location = response.headers.get("location");
  if (!location) throw new Error("Adobe PDF-to-Markdown: no location header in response");
  return resolvePollLocation(location);
}

export async function submitExtractJob(token: string, assetId: string): Promise<string> {
  const config = getProcessingConfig();
  const origin = serviceOrigin();

  const response = await fetch(`${origin}/operation/extractpdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-key": config.adobeClientId!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assetID: assetId,
      elementsToExtract: ["text", "tables"],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Adobe Extract job submission failed: ${response.status} ${text}`);
  }

  const location = response.headers.get("location");
  if (!location) throw new Error("Adobe Extract: no location header in response");
  return resolvePollLocation(location);
}

export async function pollJobResult(
  token: string,
  pollUrl: string,
  maxAttempts = 60,
  intervalMs = 3000
): Promise<AdobeJobPollResponse> {
  const config = getProcessingConfig();
  const url = resolvePollLocation(pollUrl);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": config.adobeClientId!,
      },
    });

    if (!response.ok) {
      throw new Error(`Adobe poll failed: ${response.status}`);
    }

    const raw = (await response.json()) as Record<string, unknown> & AdobeJobPollResponse;
    const normalizedUri = getDownloadUriFromPollBody(raw);

    const data: AdobeJobPollResponse = {
      ...raw,
      downloadUri: normalizedUri ?? raw.downloadUri,
    };

    if (data.status === "done") return data;
    if (data.status === "failed") {
      const msg =
        data.error?.message ??
        (typeof raw.message === "string" ? raw.message : null) ??
        "unknown error";
      throw new Error(`Adobe job failed: ${msg}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Adobe job timed out after polling");
}

export async function downloadResult(downloadUri: string): Promise<ArrayBuffer> {
  const response = await fetch(downloadUri);
  if (!response.ok) {
    throw new Error(`Adobe result download failed: ${response.status}`);
  }
  return response.arrayBuffer();
}
