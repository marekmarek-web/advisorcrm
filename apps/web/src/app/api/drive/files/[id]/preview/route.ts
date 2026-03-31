import { getIntegrationApiAuth } from "../../../../integrations/auth";
import { requireDriveAccessToken } from "@/lib/integrations/drive-access-token-api";
import {
  downloadDriveFile,
  exportDriveFile,
  getDriveFile,
} from "@/lib/integrations/google-drive";
import { getDrivePreviewStrategy } from "@/lib/integrations/drive-preview-strategy";

export const dynamic = "force-dynamic";

function safeAsciiFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, "_").slice(0, 200) || "preview";
}

function inlineDispositionHeaders(fileName: string, contentType: string, data: Uint8Array) {
  const ascii = safeAsciiFilename(fileName);
  const utf8 = encodeURIComponent(fileName).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return {
    "Content-Type": contentType,
    "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${utf8}`,
    "Content-Length": String(data.byteLength),
    "Cache-Control": "private, max-age=300",
  } as Record<string, string>;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getIntegrationApiAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;
  const { id } = await context.params;

  try {
    const accessToken = await requireDriveAccessToken(userId, tenantId);
    const metadata = await getDriveFile(accessToken, id);
    const strategy = getDrivePreviewStrategy(metadata.mimeType);

    if (strategy.kind === "unsupported") {
      return Response.json(
        {
          error: "preview_unsupported",
          message: "Tento typ souboru nelze zobrazit v náhledu. Otevři ho v Google Disku.",
          webViewLink: metadata.webViewLink ?? null,
        },
        { status: 415 }
      );
    }

    let payload: { data: Buffer; contentType: string | null };
    let outMime: string;
    let displayName = metadata.name;

    if (strategy.kind === "export_pdf" && strategy.exportMime) {
      payload = await exportDriveFile(accessToken, id, strategy.exportMime);
      outMime = payload.contentType || "application/pdf";
      if (!displayName.toLowerCase().endsWith(".pdf")) {
        displayName = `${displayName.replace(/\.[^/.]+$/, "")}.pdf`;
      }
    } else {
      payload = await downloadDriveFile(accessToken, id);
      outMime = payload.contentType || metadata.mimeType || "application/octet-stream";
    }

    const body = new Uint8Array(payload.data);
    return new Response(body, {
      status: 200,
      headers: inlineDispositionHeaders(displayName, outMime, body),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
