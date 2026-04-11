import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getIntegrationAuth } from "../auth";
import { logIntegration, logIntegrationError } from "@/lib/integrations/google-calendar-integration-service";
import { buildGoogleOAuthUrl, getGoogleClientConfig } from "@/lib/integrations/google-oauth";
import { assertPlanCapabilityForIntegration } from "@/lib/billing/plan-access-guards";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";

export const dynamic = "force-dynamic";

const CSRF_COOKIE_NAME = "google_calendar_oauth_csrf";
const CSRF_COOKIE_MAX_AGE = 600; // 10 min

/** Minimální scope pro první verzi: pouze události kalendáře (čtení + zápis). */
const GOOGLE_CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export async function GET(request: Request) {
  const authResult = await getIntegrationAuth(request, { requireCalendarPermission: true });
  if (!authResult.ok) {
    logIntegration("Connect: unauthenticated or forbidden");
    return authResult.response;
  }
  const { userId, tenantId } = authResult.auth;

  try {
    await assertPlanCapabilityForIntegration({ tenantId, userId, capability: "google_calendar" });
  } catch (e) {
    const r = nextResponseFromPlanOrQuotaError(e);
    if (r) return r;
    throw e;
  }

  let clientId: string;
  try {
    ({ clientId } = getGoogleClientConfig());
  } catch {
    logIntegrationError("Connect: missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
    return NextResponse.json(
      { error: "Google Calendar is not configured" },
      { status: 500 }
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/google-calendar/callback`;
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ userId, tenantId, nonce }), "utf8").toString("base64url");

  const oauthUrl = buildGoogleOAuthUrl({
    clientId,
    redirectUri,
    scopes: GOOGLE_CALENDAR_SCOPES,
    state,
  });

  logIntegration("Connect: redirecting to Google", { userId: userId.slice(0, 8) });

  const redirect = NextResponse.redirect(oauthUrl);
  redirect.cookies.set(CSRF_COOKIE_NAME, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CSRF_COOKIE_MAX_AGE,
    path: "/",
  });
  return redirect;
}
