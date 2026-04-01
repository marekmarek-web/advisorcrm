import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AIDV_PROXY_AUTH_USER_HEADER } from "@/lib/auth/proxy-headers";
import { getPublicSupabaseKey } from "@/lib/supabase/get-public-supabase-key";
import {
  CLIENT_INVITE_QUERY_PARAM,
  LEGACY_CLIENT_INVITE_QUERY_PARAM,
  parseClientInviteTokenFromUrl,
} from "@/lib/auth/client-invite-url";

const PRODUCTION_DOMAIN = "https://www.aidvisora.cz";

/** Legacy Vercel preview hostnames → redirect traffic to canonical production (comma-separated in env). */
function legacyVercelHosts(): string[] {
  const raw = process.env.AIDVISORA_LEGACY_VERCEL_HOSTS?.trim();
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ["advisorcrm-web.vercel.app"];
}

export async function middleware(request: NextRequest) {
  const normalizeNext = (raw: string | null, fallback: string) => {
    if (!raw || !raw.startsWith("/")) return fallback;
    if (raw === "/" || raw === "/prihlaseni" || raw === "/login" || raw === "/register") return fallback;
    return raw;
  };

  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const host = request.headers.get("host") ?? "";
  const isAuthCallbackWithCode =
    request.nextUrl.pathname === "/auth/callback" && request.nextUrl.searchParams.has("code");
  const isGoogleOAuthCallbackWithCode =
    request.nextUrl.pathname.startsWith("/api/integrations/") &&
    request.nextUrl.pathname.endsWith("/callback") &&
    request.nextUrl.searchParams.has("code");
  if (legacyVercelHosts().some((h) => host.includes(h)) && !isAuthCallbackWithCode && !isGoogleOAuthCallbackWithCode) {
    const path = request.nextUrl.pathname === "/" && request.nextUrl.searchParams.get("code") ? "/auth/callback" : request.nextUrl.pathname;
    const url = new URL(path + request.nextUrl.search, PRODUCTION_DOMAIN);
    return NextResponse.redirect(url);
  }

  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.get("error_code") === "otp_expired") {
    const url = request.nextUrl.clone();
    url.pathname = "/prihlaseni";
    url.searchParams.set("error", "otp_expired");
    url.searchParams.delete("error_code");
    url.searchParams.delete("error_description");
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/prihlaseni";
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/register") {
    const url = request.nextUrl.clone();
    url.pathname = "/prihlaseni";
    const inviteToken = parseClientInviteTokenFromUrl(request.nextUrl.searchParams);
    if (inviteToken) {
      url.searchParams.delete(LEGACY_CLIENT_INVITE_QUERY_PARAM);
      url.searchParams.delete(CLIENT_INVITE_QUERY_PARAM);
      url.searchParams.set(CLIENT_INVITE_QUERY_PARAM, inviteToken);
      url.searchParams.delete("register");
    } else {
      url.searchParams.delete(LEGACY_CLIENT_INVITE_QUERY_PARAM);
      url.searchParams.delete(CLIENT_INVITE_QUERY_PARAM);
      url.searchParams.set("register", "1");
    }
    return NextResponse.redirect(url);
  }

  const pathname = request.nextUrl.pathname;
  const isContractsApi = pathname.startsWith("/api/contracts");
  const isAiAssistantApi =
    pathname.startsWith("/api/ai/assistant") ||
    pathname === "/api/ai/dashboard-summary" ||
    pathname === "/api/ai/team-summary";
  const isCalendarApi = pathname.startsWith("/api/calendar");
  const isDriveApi = pathname.startsWith("/api/drive");
  const isGmailApi = pathname.startsWith("/api/gmail");
  const isIntegrationsApi = pathname.startsWith("/api/integrations");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublicKey = getPublicSupabaseKey();

  if ((isContractsApi || isAiAssistantApi || isCalendarApi || isDriveApi || isGmailApi || isIntegrationsApi) && supabaseUrl && supabasePublicKey) {
    const response = NextResponse.next({ request });
    const supabase = createServerClient(supabaseUrl, supabasePublicKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    const requestHeaders = new Headers(request.headers);
    if (user) {
      requestHeaders.set("x-user-id", user.id);
    }

    const isDebugAuth = pathname === "/api/contracts/debug-auth";
    if (isDebugAuth) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    if (!user) {
      const isDev = process.env.NODE_ENV === "development";
      const devUserId = process.env.NEXT_PUBLIC_DEV_CONTRACTS_USER_ID ?? process.env.DEV_CONTRACTS_USER_ID;
      const allowDevBypass = !isProduction && isDev && process.env.VERCEL_ENV !== "production" && devUserId?.trim();
      if (allowDevBypass) {
        requestHeaders.set("x-user-id", devUserId!.trim());
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!isProduction && process.env.VERCEL_ENV !== "production" && process.env.NEXT_PUBLIC_SKIP_AUTH === "true") {
    const requestHeaders = new Headers(request.headers);
    if (pathname.startsWith("/client")) {
      requestHeaders.set("x-demo-client-zone", "1");
    }
    if (pathname.startsWith("/portal") || pathname.startsWith("/client")) {
      requestHeaders.set("x-pathname", pathname);
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (!supabaseUrl || !supabasePublicKey) {
    return NextResponse.next();
  }

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete(AIDV_PROXY_AUTH_USER_HEADER);
  if (pathname.startsWith("/portal") || pathname.startsWith("/client")) {
    forwardHeaders.set("x-pathname", pathname);
  }
  let response = NextResponse.next({ request: { headers: forwardHeaders } });
  const supabase = createServerClient(supabaseUrl, supabasePublicKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    forwardHeaders.set(AIDV_PROXY_AUTH_USER_HEADER, user.id);
  }
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isClientZone = request.nextUrl.pathname.startsWith("/client");
  const isBoard = request.nextUrl.pathname.startsWith("/board");
  const isPortal = request.nextUrl.pathname.startsWith("/portal");

  if ((isDashboard || isClientZone || isBoard || isPortal) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/prihlaseni";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = normalizeNext(request.nextUrl.searchParams.get("next"), "/portal/today");
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/prihlaseni" && user) {
    const errorParam = request.nextUrl.searchParams.get("error");
    const hasInviteToken = parseClientInviteTokenFromUrl(request.nextUrl.searchParams) !== null;
    if (
      hasInviteToken ||
      errorParam === "auth_error" ||
      errorParam === "database_error" ||
      errorParam === "client_no_access"
    ) {
      return NextResponse.next({ request });
    }
    const url = request.nextUrl.clone();
    url.pathname = normalizeNext(request.nextUrl.searchParams.get("next"), "/portal/today");
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname.startsWith("/prihlaseni/nastavit-heslo")) {
    const out = NextResponse.next({ request: { headers: forwardHeaders } });
    for (const c of response.cookies.getAll()) {
      out.cookies.set(c.name, c.value);
    }
    return out;
  }

  const out = NextResponse.next({ request: { headers: forwardHeaders } });
  for (const c of response.cookies.getAll()) {
    out.cookies.set(c.name, c.value);
  }
  return out;
}

export const config = {
  matcher: [
    "/",
    "/prihlaseni",
    "/prihlaseni/:path*",
    "/dashboard/:path*",
    "/client/:path*",
    "/board/:path*",
    "/portal/:path*",
    "/api/contracts/:path*",
    "/api/ai/assistant/:path*",
    "/api/ai/dashboard-summary",
    "/api/calendar/:path*",
    "/api/drive/:path*",
    "/api/gmail/:path*",
    "/api/integrations/:path*",
    "/login",
    "/register",
  ],
};
