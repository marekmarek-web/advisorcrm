import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, getGoogleUserEmail } from "@/lib/integrations/google-calendar";
import { upsertIntegrationTokens, logIntegration, logIntegrationError } from "@/lib/integrations/google-calendar-integration-service";

export const dynamic = "force-dynamic";

const CSRF_COOKIE_NAME = "google_calendar_oauth_csrf";

const REDIRECT_SETUP = "/portal/setup";
const QUERY_TAB = "tab=integrace";
const QUERY_SUCCESS = "calendar=connected";
const QUERY_ERROR = "calendar_error";

function redirectToSetup(origin: string, success?: boolean, error?: string): NextResponse {
  const target = new URL(REDIRECT_SETUP, origin);
  target.search = QUERY_TAB + (success ? "&" + QUERY_SUCCESS : error ? "&" + QUERY_ERROR + "=" + encodeURIComponent(error) : "");
  const res = NextResponse.redirect(target.toString());
  res.cookies.delete(CSRF_COOKIE_NAME);
  return res;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    const errCode = errorParam === "access_denied" ? "access_denied" : "auth_failed";
    logIntegration("Callback: user or Google denied", { error: errorParam });
    return redirectToSetup(origin, false, errCode);
  }

  if (!code || !stateParam) {
    logIntegrationError("Callback: missing code or state", { hasCode: !!code, hasState: !!stateParam });
    return redirectToSetup(origin, false, "missing_code_or_state");
  }

  let state: { userId: string; tenantId: string; nonce: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8"));
    if (!state?.userId || !state?.tenantId || !state?.nonce) throw new Error("Invalid state shape");
  } catch (e) {
    logIntegrationError("Callback: invalid state", e);
    return redirectToSetup(origin, false, "invalid_state");
  }

  const cookieStore = await cookies();
  const csrfCookie = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  if (!csrfCookie || csrfCookie !== state.nonce) {
    logIntegrationError("Callback: CSRF mismatch");
    return redirectToSetup(origin, false, "csrf_mismatch");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    logIntegration("Callback: user not logged in");
    return redirectToSetup(origin, false, "not_logged_in");
  }
  if (user.id !== state.userId) {
    logIntegrationError("Callback: state userId does not match session", { stateUserId: state.userId.slice(0, 8), sessionUserId: user.id.slice(0, 8) });
    return redirectToSetup(origin, false, "user_mismatch");
  }

  const redirectUri = `${origin}/api/integrations/google-calendar/callback`;
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, redirectUri);
  } catch (e) {
    logIntegrationError("Callback: token exchange failed", e);
    return redirectToSetup(origin, false, "token_exchange_failed");
  }

  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    logIntegrationError("Callback: no refresh_token in response");
    return redirectToSetup(origin, false, "no_refresh_token");
  }

  let googleEmail: string | null = null;
  try {
    googleEmail = await getGoogleUserEmail(tokens.access_token);
  } catch {
    // nefatální
  }

  try {
    await upsertIntegrationTokens(state.userId, state.tenantId, {
      accessToken: tokens.access_token,
      refreshToken,
      expiresIn: tokens.expires_in,
      scope: tokens.scope ?? undefined,
      googleEmail,
    });
  } catch (e) {
    logIntegrationError("Callback: failed to save integration", e);
    return redirectToSetup(origin, false, "db_error");
  }

  logIntegration("Callback: success", { userId: state.userId.slice(0, 8) });
  return redirectToSetup(origin, true);
}
