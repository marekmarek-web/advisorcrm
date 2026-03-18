import { NextResponse } from "next/server";
import { db, userGoogleCalendarIntegrations } from "db";
import { eq, and } from "db";
import { getCalendarAuth } from "../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await getCalendarAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  const rows = await db
    .select({
      googleEmail: userGoogleCalendarIntegrations.googleEmail,
      isActive: userGoogleCalendarIntegrations.isActive,
    })
    .from(userGoogleCalendarIntegrations)
    .where(
      and(
        eq(userGoogleCalendarIntegrations.tenantId, tenantId),
        eq(userGoogleCalendarIntegrations.userId, userId)
      )
    )
    .limit(1);

  const row = rows[0];
  const connected = !!row?.isActive;
  return NextResponse.json({
    connected,
    email: connected ? row.googleEmail ?? undefined : undefined,
  });
}
