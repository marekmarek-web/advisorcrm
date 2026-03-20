import { NextResponse } from "next/server";
import { getCalendarAuth } from "../../calendar/auth";
import { getValidDriveAccessToken } from "@/lib/integrations/google-drive-integration-service";
import { listDriveFiles } from "@/lib/integrations/google-drive";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await getCalendarAuth(request, { requireWrite: false });
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  const url = new URL(request.url);
  const folderId = url.searchParams.get("folderId") ?? undefined;
  const query = url.searchParams.get("q") ?? undefined;
  const pageToken = url.searchParams.get("pageToken") ?? undefined;

  let accessToken: string;
  try {
    accessToken = await getValidDriveAccessToken(userId, tenantId);
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === "not_connected") return NextResponse.json({ error: "Google Drive není připojen" }, { status: 400 });
    return NextResponse.json({ error: "Chyba přístupu k Drive" }, { status: 500 });
  }

  try {
    const result = await listDriveFiles(accessToken, { folderId, query, pageToken, pageSize: 50 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
