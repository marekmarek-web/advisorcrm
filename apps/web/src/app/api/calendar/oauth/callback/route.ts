import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, userGoogleCalendarIntegrations } from "db";
import { eq, and } from "db";
import { exchangeCodeForTokens, getGoogleUserEmail } from "@/lib/integrations/google-calendar";
import { encrypt } from "@/lib/integrations/encrypt";

export const dynamic = "force-dynamic";

const CSRF_COOKIE_NAME = "calendar_oauth_csrf";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const redirectToSetup = (success?: boolean, error?: string) => {
    const target = new URL("/portal/setup", origin);
    target.searchParams.set("tab", "integrace");
    if (success) target.searchParams.set("calendar", "connected");
    if (error) target.searchParams.set("calendar_error", error);
    const res = NextResponse.redirect(target.toString());
    res.cookies.delete(CSRF_COOKIE_NAME);
    return res;
  };

  if (errorParam) {
    return redirectToSetup(false, errorParam === "access_denied" ? "access_denied" : "auth_failed");
  }
  if (!code || !stateParam) {
    return redirectToSetup(false, "missing_code_or_state");
  }

  let state: { userId: string; tenantId: string; nonce: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8"));
    if (!state?.userId || !state?.tenantId || !state?.nonce) throw new Error("Invalid state");
  } catch {
    return redirectToSetup(false, "invalid_state");
  }

  const cookieStore = await cookies();
  const csrfCookie = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  if (!csrfCookie || csrfCookie !== state.nonce) {
    return redirectToSetup(false, "csrf_mismatch");
  }

  const redirectUri = `${origin}/api/calendar/oauth/callback`;
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, redirectUri);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "token_exchange_failed";
    return redirectToSetup(false, msg);
  }

  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    return redirectToSetup(false, "no_refresh_token");
  }

  let googleEmail: string | null = null;
  try {
    googleEmail = await getGoogleUserEmail(accessToken);
  } catch {
    // non-fatal
  }

  const tokenExpiry = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
  const scope = tokens.scope ?? null;

  try {
    const encryptedAccess = encrypt(accessToken);
    const encryptedRefresh = encrypt(refreshToken);

    const existing = await db
      .select()
      .from(userGoogleCalendarIntegrations)
      .where(
        and(
          eq(userGoogleCalendarIntegrations.tenantId, state.tenantId),
          eq(userGoogleCalendarIntegrations.userId, state.userId)
        )
      )
      .limit(1);

    const now = new Date();
    if (existing.length > 0) {
      await db
        .update(userGoogleCalendarIntegrations)
        .set({
          googleEmail,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiry,
          scope,
          isActive: true,
          updatedAt: now,
        })
        .where(
          and(
            eq(userGoogleCalendarIntegrations.tenantId, state.tenantId),
            eq(userGoogleCalendarIntegrations.userId, state.userId)
          )
        );
    } else {
      await db.insert(userGoogleCalendarIntegrations).values({
        userId: state.userId,
        tenantId: state.tenantId,
        googleEmail,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        tokenExpiry,
        scope,
        isActive: true,
        updatedAt: now,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "db_error";
    return redirectToSetup(false, msg);
  }

  return redirectToSetup(true);
}
