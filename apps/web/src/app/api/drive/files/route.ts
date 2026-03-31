import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getIntegrationApiAuth } from "../../integrations/auth";
import { requireDriveAccessToken } from "@/lib/integrations/drive-access-token-api";
import {
  createDriveFolder,
  listDriveFiles,
  uploadDriveFile,
} from "@/lib/integrations/google-drive";

export const dynamic = "force-dynamic";

async function getAccessToken(userId: string, tenantId: string) {
  return requireDriveAccessToken(userId, tenantId);
}

export async function GET(request: Request) {
  const authResult = await getIntegrationApiAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  const url = new URL(request.url);
  const folderId = url.searchParams.get("folderId") ?? undefined;
  const query = url.searchParams.get("q") ?? undefined;
  const pageToken = url.searchParams.get("pageToken") ?? undefined;
  const extraQuery = url.searchParams.get("extraQuery") ?? undefined;

  try {
    const accessToken = await getAccessToken(userId, tenantId);
    const result = await listDriveFiles(accessToken, { folderId, query, pageToken, pageSize: 50, extraQuery });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const authResult = await getIntegrationApiAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  const limiter = checkRateLimit(request, "drive-files-write", `${tenantId}:${userId}`, { windowMs: 60_000, maxRequests: 15 });
  if (!limiter.ok) {
    return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } });
  }

  try {
    const accessToken = await getAccessToken(userId, tenantId);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const folderId = String(form.get("folderId") ?? "") || undefined;
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Soubor je povinný" }, { status: 400 });
      }
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const uploaded = await uploadDriveFile(accessToken, {
        name: file.name || "upload.bin",
        mimeType: file.type || "application/octet-stream",
        content: fileBuffer,
        folderId,
      });
      return NextResponse.json({ file: uploaded });
    }

    const body = (await request.json().catch(() => ({}))) as {
      type?: "folder";
      name?: string;
      folderId?: string;
    };
    if (body.type !== "folder" || !body.name?.trim()) {
      return NextResponse.json({ error: "Pro vytvoření složky chybí název." }, { status: 400 });
    }
    const folder = await createDriveFolder(accessToken, body.name.trim(), body.folderId);
    return NextResponse.json({ file: folder });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
