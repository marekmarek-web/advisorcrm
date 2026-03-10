import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Odkaz z e-mailu vypršel (otp_expired) → úvodní stránka s chybou
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.get("error_code") === "otp_expired") {
    const url = request.nextUrl.clone();
    url.searchParams.set("error", "otp_expired");
    url.searchParams.delete("error_code");
    url.searchParams.delete("error_description");
    return NextResponse.redirect(url);
  }
  // Staré URL přihlášení/registrace → vždy nová úvodní stránka
  if (request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/register") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("register", "1");
    return NextResponse.redirect(url);
  }
  // Dočasně: povolit dashboard bez přihlášení (nastav SKIP_AUTH=true v .env.local)
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === "true") {
    return NextResponse.next();
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    url.pathname = "/";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.searchParams.get("next") || "/portal/today";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/client/:path*", "/board/:path*", "/portal/:path*", "/login", "/register"],
};