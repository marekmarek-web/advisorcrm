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
  let types: string[] | undefined;
  try {
    const body = (await request.json()) as { type?: string; types?: string[] };
    type = typeof body?.type === "string" ? body.type : undefined;
    types = Array.isArray(body?.types) ? body.types.filter((t): t is string => typeof t === "string") : undefined;
  } catch {
    type = undefined;
    types = undefined;
  }

  const ok = await markAllNotificationsReadForUser(
    membership.tenantId,
    userId,
    types?.length ? { types } : type ? { type } : undefined
  );
  return NextResponse.json({ ok });
}
