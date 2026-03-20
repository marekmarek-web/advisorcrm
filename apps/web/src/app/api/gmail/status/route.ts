import { NextResponse } from "next/server";
import { db, userGoogleGmailIntegrations } from "db";
import { eq, and } from "db";
import { getCalendarAuth } from "../../calendar/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await getCalendarAuth(request, { requireWrite: false });
  if (!authResult.ok) {
    return NextResponse.json({ connected: false });
  }
  const { userId, tenantId } = authResult.auth;

  try {
    const rows = await db
      .select({
        googleEmail: userGoogleGmailIntegrations.googleEmail,
        isActive: userGoogleGmailIntegrations.isActive,
      })
      .from(userGoogleGmailIntegrations)
      .where(and(
        eq(userGoogleGmailIntegrations.tenantId, tenantId),
        eq(userGoogleGmailIntegrations.userId, userId)
      ))
      .limit(1);

    const row = rows[0];
    const connected = !!row?.isActive;
    return NextResponse.json({
      connected,
      email: connected ? row.googleEmail ?? undefined : undefined,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
