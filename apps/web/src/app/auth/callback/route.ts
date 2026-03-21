import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { searchParams } = url;
    const origin = url.origin;
    const code = searchParams.get("code");
    const errorCode = searchParams.get("error_code");
    const errorDesc = searchParams.get("error_description");

    const normalizeNext = (raw: string | null, fallback: string) => {
      if (!raw || !raw.startsWith("/")) return fallback;
      if (raw === "/" || raw === "/prihlaseni" || raw === "/login" || raw === "/register") return fallback;
      return raw;
    };
    const next = normalizeNext(searchParams.get("next"), "/portal/today");

    if (errorCode === "otp_expired" || errorDesc?.includes("expired")) {
      return NextResponse.redirect(`${origin}/prihlaseni?error=otp_expired`);
    }
    if (errorCode || errorDesc) {
      return NextResponse.redirect(
        `${origin}/prihlaseni?error=${encodeURIComponent(errorDesc || errorCode || "auth_failed")}`
      );
    }

    if (code) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          `${origin}/prihlaseni?error=${encodeURIComponent(error.message)}`
        );
      }
    }

    // Prefer explicit flag from redirectTo for native OAuth.
    // Fallback to cookie-based detection for older flows.
    const nativeFromQuery = searchParams.get("native") === "1";
    const cookieStore = await cookies();
    const nativeFromCookie = cookieStore.get("mobile_ui_v1_beta")?.value === "1";
    const isNative = nativeFromQuery || nativeFromCookie;
    if (isNative) {
      return NextResponse.redirect("aidvisora://auth/done");
    }

    return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/" + next}`);
  } catch (e) {
    const origin = request.url ? new URL(request.url).origin : "https://localhost:3000";
    const msg = e instanceof Error ? e.message : "Přihlášení selhalo.";
    return NextResponse.redirect(`${origin}/prihlaseni?error=${encodeURIComponent(msg)}`);
  }
}
