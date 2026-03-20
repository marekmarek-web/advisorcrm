import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, getGoogleUserEmail } from "@/lib/integrations/google-oauth";
import { upsertDriveTokens, logDriveIntegration, logDriveIntegrationError } from "@/lib/integrations/google-drive-integration-service";

export const dynamic = "force-dynamic";

const CSRF_COOKIE = "google_drive_oauth_csrf";

function redirectToSetup(origin: string, success?: boolean, error?: string): NextResponse {
  const target = new URL("/portal/setup", origin);
  target.search = "tab=integrace" + (success ? "&drive=connected" : error ? "&drive_error=" + encodeURIComponent(error) : "");
  const res = NextResponse.redirect(target.toString());
  res.cookies.delete(CSRF_COOKIE);
  return res;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    logDriveIntegration("Callback: denied", { error: errorParam });
    return redirectToSetup(origin, false, errorParam === "access_denied" ? "access_denied" : "auth_failed");
  }

  if (!code || !stateParam) {
    logDriveIntegrationError("Callback: missing code or state");
    return redirectToSetup(origin, false, "missing_code_or_state");
  }

  let state: { userId: string; tenantId: string; nonce: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8"));
    if (!state?.userId || !state?.tenantId || !state?.nonce) throw new Error("Invalid state");
  } catch (e) {
    logDriveIntegrationError("Callback: invalid state", e);
    return redirectToSetup(origin, false, "invalid_state");
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get(CSRF_COOKIE)?.value;
  if (!csrf || csrf !== state.nonce) {
    logDriveIntegrationError("Callback: CSRF mismatch");
    return redirectToSetup(origin, false, "csrf_mismatch");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) {
    logDriveIntegrationError("Callback: user mismatch");
    return redirectToSetup(origin, false, "user_mismatch");
  }

  const redirectUri = `${origin}/api/integrations/google-drive/callback`;
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, redirectUri);
  } catch (e) {
    logDriveIntegrationError("Callback: token exchange failed", e);
    return redirectToSetup(origin, false, "token_exchange_failed");
  }

  if (!tokens.refresh_token) {
    logDriveIntegrationError("Callback: no refresh_token");
    return redirectToSetup(origin, false, "no_refresh_token");
  }

  let googleEmail: string | null = null;
  try {
    googleEmail = await getGoogleUserEmail(tokens.access_token);
  } catch { /* non-fatal */ }

  try {
    await upsertDriveTokens(state.userId, state.tenantId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope ?? undefined,
      googleEmail,
    });
  } catch (e) {
    logDriveIntegrationError("Callback: DB save failed", e);
    return redirectToSetup(origin, false, "db_error");
  }

  logDriveIntegration("Callback: success", { userId: state.userId.slice(0, 8) });
  return redirectToSetup(origin, true);
}
