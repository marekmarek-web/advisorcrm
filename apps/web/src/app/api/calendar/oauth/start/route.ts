import { NextResponse } from "next/server";
import { getCalendarAuth } from "../../auth";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const CSRF_COOKIE_NAME = "calendar_oauth_csrf";
const CSRF_COOKIE_MAX_AGE = 600; // 10 min

export async function GET(request: Request) {
  const authResult = await getCalendarAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google Calendar is not configured" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/calendar/oauth/callback`;
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ userId, tenantId, nonce }), "utf8").toString("base64url");

  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent", // force refresh_token on first auth
    state,
  });

  const redirect = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  redirect.cookies.set(CSRF_COOKIE_NAME, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CSRF_COOKIE_MAX_AGE,
    path: "/",
  });
  return redirect;
}
