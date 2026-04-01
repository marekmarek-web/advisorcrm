import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { db, advisorNotifications, eq, and, desc } from "db";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);

  const conditions = [
    eq(advisorNotifications.tenantId, membership.tenantId),
    eq(advisorNotifications.targetUserId, userId),
  ];
  if (status) conditions.push(eq(advisorNotifications.status, status));
  if (type?.trim()) conditions.push(eq(advisorNotifications.type, type.trim()));

  const items = await db.select()
    .from(advisorNotifications)
    .where(and(...conditions))
    .orderBy(desc(advisorNotifications.createdAt))
    .limit(limit);

  return NextResponse.json({ items });
}
