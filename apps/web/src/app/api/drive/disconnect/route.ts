import { NextResponse } from "next/server";
import { getCalendarAuth } from "../../calendar/auth";
import { disconnectDrive } from "@/lib/integrations/google-drive-integration-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await getCalendarAuth(request, { requireWrite: false });
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  try {
    await disconnectDrive(userId, tenantId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Odpojení se nepovedlo." }, { status: 500 });
  }
}
