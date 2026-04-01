import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { markNotificationRead } from "@/lib/execution/notification-center";

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const { notificationId } = await request.json();
  if (!notificationId) return NextResponse.json({ error: "Missing notificationId" }, { status: 400 });

  const ok = await markNotificationRead(notificationId, membership.tenantId, userId);
  return NextResponse.json({ ok });
}
