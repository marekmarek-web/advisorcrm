import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getIntegrationAuth } from "../auth";
import { logIntegration, logIntegrationError } from "@/lib/integrations/google-calendar-integration-service";

export const dynamic = "force-dynamic";

const CSRF_COOKIE_NAME = "google_calendar_oauth_csrf";
const CSRF_COOKIE_MAX_AGE = 600; // 10 min

/** Minimální scope pro první verzi: pouze události kalendáře (čtení + zápis). */
const GOOGLE_CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export async function GET(request: Request) {
  const authResult = await getIntegrationAuth(request);
  if (!authResult.ok) {
    logIntegration("Connect: unauthenticated or forbidden");
    return authResult.response;
  }
  const { userId, tenantId } = authResult.auth;

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (!clientId) {
    logIntegrationError("Connect: GOOGLE_CALENDAR_CLIENT_ID not set");
    return NextResponse.json(
      { error: "Google Calendar is not configured" },
      { status: 500 }
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/google-calendar/callback`;
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ userId, tenantId, nonce }), "utf8").toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  logIntegration("Connect: redirecting to Google", { userId: userId.slice(0, 8) });

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
