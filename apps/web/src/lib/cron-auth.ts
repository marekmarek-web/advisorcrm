import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const BEARER = /^Bearer\s+(.+)$/i;

/**
 * Ověření volání cron route (Vercel Cron posílá `Authorization: Bearer <CRON_SECRET>`,
 * pokud je proměnná nastavená v projektu).
 */
export function cronAuthResponse(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  const isProduction =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (isProduction && !secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }

  if (!secret) {
    return null;
  }

  const raw = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const match = raw?.match(BEARER);
  const token = match?.[1]?.trim() ?? "";

  if (!safeEqualUtf8(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

function safeEqualUtf8(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) {
      return false;
    }
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
