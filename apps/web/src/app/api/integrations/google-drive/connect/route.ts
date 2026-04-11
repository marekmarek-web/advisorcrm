import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getIntegrationAuth } from "../../google-calendar/auth";
import { getGoogleClientConfig, buildGoogleOAuthUrl } from "@/lib/integrations/google-oauth";
import { assertPlanCapabilityForIntegration } from "@/lib/billing/plan-access-guards";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";

export const dynamic = "force-dynamic";

const CSRF_COOKIE = "google_drive_oauth_csrf";
const SCOPES = ["https://www.googleapis.com/auth/drive"];

export async function GET(request: Request) {
  const authResult = await getIntegrationAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  try {
    await assertPlanCapabilityForIntegration({ tenantId, userId, capability: "google_drive" });
  } catch (e) {
    const r = nextResponseFromPlanOrQuotaError(e);
    if (r) return r;
    throw e;
  }

  const { clientId } = getGoogleClientConfig();
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/google-drive/callback`;
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ userId, tenantId, nonce }), "utf8").toString("base64url");

  const url = buildGoogleOAuthUrl({ clientId, redirectUri, scopes: SCOPES, state });

  const redirect = NextResponse.redirect(url);
  redirect.cookies.set(CSRF_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return redirect;
}
