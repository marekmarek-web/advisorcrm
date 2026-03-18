import { NextResponse } from "next/server";
import { db, userGoogleCalendarIntegrations } from "db";
import { eq, and } from "db";
import { getCalendarAuth } from "../auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await getCalendarAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  await db
    .update(userGoogleCalendarIntegrations)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(userGoogleCalendarIntegrations.tenantId, tenantId),
        eq(userGoogleCalendarIntegrations.userId, userId)
      )
    );

  return NextResponse.json({ ok: true });
}
