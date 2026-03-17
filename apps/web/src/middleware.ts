import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PRODUCTION_DOMAIN = "https://www.aidvisora.cz";

export async function middleware(request: NextRequest) {
  // Přesměrovat starou Vercel URL na produkční doménu (aby Google login neposílal na advisorcrm-web.vercel.app)
  // Výjimka: /auth/callback s parametrem code NESMÍ být přesměrován – PKCE code_verifier je v cookie na této doméně,
  // po redirectu na jinou doménu by callback selhal s "PKCE code verifier not found in storage".
  const host = request.headers.get("host") ?? "";
  const isAuthCallbackWithCode =
    request.nextUrl.pathname === "/auth/callback" && request.nextUrl.searchParams.has("code");
  if (host.includes("advisorcrm-web.vercel.app") && !isAuthCallbackWithCode) {
    const path = request.nextUrl.pathname === "/" && request.nextUrl.searchParams.get("code") ? "/auth/callback" : request.nextUrl.pathname;
    const url = new URL(path + request.nextUrl.search, PRODUCTION_DOMAIN);
    return NextResponse.redirect(url);
  }

  // Odkaz z e-mailu vypršel (otp_expired) → stránka přihlášení s chybou
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.get("error_code") === "otp_expired") {
    const url = request.nextUrl.clone();
    url.pathname = "/prihlaseni";
    url.searchParams.set("error", "otp_expired");
    url.searchParams.delete("error_code");
    url.searchParams.delete("error_description");
    return NextResponse.redirect(url);
  }
  // Staré URL přihlášení/registrace → stránka přihlášení
  if (request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/prihlaseni";
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/register") {
    const url = request.nextUrl.clone();
    url.pathname = "/prihlaseni";
    url.searchParams.set("register", "1");
    return NextResponse.redirect(url);
  }

  const pathname = request.nextUrl.pathname;
  const isContractsApi = pathname.startsWith("/api/contracts");
  const isAiAssistantApi =
    pathname.startsWith("/api/ai/assistant") ||
    pathname === "/api/ai/dashboard-summary" ||
    pathname === "/api/ai/team-summary";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // /api/contracts/* a /api/ai/assistant/* (+ dashboard-summary): auth + dev bypass. Před skip auth.
  if ((isContractsApi || isAiAssistantApi) && supabaseUrl && supabaseAnonKey) {
    const method = request.method;
    const response = NextResponse.next({ request });
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    const userFound = !!user;
    const cookieCount = request.cookies.getAll().length;
    const hasSupabaseAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    // Diagnostický log: pathname, method, že contracts branch běžela, zda byl user, zda jsou cookies
    // eslint-disable-next-line no-console
    console.log("[middleware /api/contracts]", { pathname, method, contractsBranchRan: true, userFound, userIdMask: userFound ? `${user!.id.slice(0, 8)}…` : null, cookieCount, hasSupabaseAuthCookie });

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-debug-mw", "1");
    requestHeaders.set("x-debug-path", pathname);
    if (user) {
      requestHeaders.set("x-user-id", user.id);
    }

    const isDebugAuth = pathname === "/api/contracts/debug-auth";
    if (isDebugAuth) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    if (!user) {
      // --- DEV BYPASS: ODSTRANIT PŘED PRODUKCÍ ---
      // NEXT_PUBLIC_ kvůli Edge runtime (middleware) – jinak env nemusí být dostupný
      const isDev = process.env.NODE_ENV === "development";
      const devUserId = process.env.NEXT_PUBLIC_DEV_CONTRACTS_USER_ID ?? process.env.DEV_CONTRACTS_USER_ID;
      // eslint-disable-next-line no-console
      console.log("[middleware /api/contracts bypass check]", { isDev, hasDevUserId: !!devUserId?.trim() });
      if (isDev && devUserId?.trim()) {
        requestHeaders.set("x-user-id", devUserId.trim());
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
      // --- KONEC DEV BYPASS ---
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Dočasně: povolit dashboard bez přihlášení (nastav SKIP_AUTH=true v .env.local)
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === "true") {
    const requestHeaders = new Headers(request.headers);
    if (pathname.startsWith("/client")) {
      requestHeaders.set("x-demo-client-zone", "1");
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    url.pathname = request.nextUrl.searchParams.get("next") || "/portal/today";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/prihlaseni" && user) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.searchParams.get("next") || "/portal/today";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/prihlaseni",
    "/dashboard/:path*",
    "/client/:path*",
    "/board/:path*",
    "/portal/:path*",
    "/api/contracts/:path*",
    "/api/ai/assistant/:path*",
    "/api/ai/dashboard-summary",
    "/login",
    "/register",
  ],
};