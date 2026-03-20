import { NextResponse } from "next/server";
import { db, userGoogleDriveIntegrations } from "db";
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
        googleEmail: userGoogleDriveIntegrations.googleEmail,
        isActive: userGoogleDriveIntegrations.isActive,
      })
      .from(userGoogleDriveIntegrations)
      .where(and(
        eq(userGoogleDriveIntegrations.tenantId, tenantId),
        eq(userGoogleDriveIntegrations.userId, userId)
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
