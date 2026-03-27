import { NextResponse } from "next/server";
import { db, clientInvitations, contacts, eq, and, gt, isNull } from "db";
import { getClientIp, rateLimitByKey } from "@/lib/rate-limit-ip";

export const dynamic = "force-dynamic";

/**
 * Public metadata for a valid pending invite (prefill e-mail on /prihlaseni).
 * Token must match a non-revoked, non-accepted row with future expiry.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  if (!rateLimitByKey(`invite-metadata:${ip}`).ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (token.length < 16 || token.length > 128) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }

  const rows = await db
    .select({
      email: clientInvitations.email,
      expiresAt: clientInvitations.expiresAt,
      firstName: contacts.firstName,
    })
    .from(clientInvitations)
    .innerJoin(contacts, eq(clientInvitations.contactId, contacts.id))
    .where(
      and(
        eq(clientInvitations.token, token),
        gt(clientInvitations.expiresAt, new Date()),
        isNull(clientInvitations.acceptedAt),
        isNull(clientInvitations.revokedAt),
      ) as any,
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    email: row.email.trim(),
    expiresAt: row.expiresAt.toISOString(),
    firstName: row.firstName?.trim() ?? null,
  });
}
