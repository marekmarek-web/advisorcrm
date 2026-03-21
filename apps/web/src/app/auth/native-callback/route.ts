import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Native OAuth callback – used when logging in from the Android/iOS native app.
 * Flow: Capacitor Browser → Google → Supabase → this route → aidvisora://auth/done
 * The aidvisora:// deep link is caught by Android intent filter, which brings the
 * user back into the native WebView. The session cookie is shared between Chrome
 * Custom Tab and the Android WebView on Android 7+.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const errorCode = url.searchParams.get("error_code");
    const errorDesc = url.searchParams.get("error_description");
    const origin = url.origin;

    if (errorCode || errorDesc) {
      const msg = encodeURIComponent(errorDesc || errorCode || "auth_failed");
      return NextResponse.redirect(`${origin}/prihlaseni?error=${msg}`);
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

    // Session is now set via cookie. Redirect to deep link so Android closes
    // Chrome Custom Tab and brings the user back into the native app.
    return NextResponse.redirect("aidvisora://auth/done");
  } catch (e) {
    const origin = request.url ? new URL(request.url).origin : "https://localhost:3000";
    const msg = e instanceof Error ? e.message : "Přihlášení selhalo.";
    return NextResponse.redirect(`${origin}/prihlaseni?error=${encodeURIComponent(msg)}`);
  }
}
