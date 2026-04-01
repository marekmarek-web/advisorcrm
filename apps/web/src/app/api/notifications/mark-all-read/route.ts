import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { markAllNotificationsReadForUser } from "@/lib/execution/notification-center";

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  let type: string | undefined;
  try {
    const body = (await request.json()) as { type?: string };
    type = typeof body?.type === "string" ? body.type : undefined;
  } catch {
    type = undefined;
  }

  const ok = await markAllNotificationsReadForUser(membership.tenantId, userId, type ? { type } : undefined);
  return NextResponse.json({ ok });
}
