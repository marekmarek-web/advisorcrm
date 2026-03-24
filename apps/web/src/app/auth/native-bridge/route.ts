import { NextResponse } from "next/server";

/**
 * Native OAuth bridge – receives the auth code from Supabase after Google
 * OAuth and passes it through to the native app via a deep link.
 *
 * IMPORTANT: This route does NOT exchange the code for a session. The code
 * must be exchanged client-side in the Capacitor WebView so the session
 * cookies end up in the correct cookie store (WebView, not Chrome Custom Tab).
 *
 * Flow: Chrome Custom Tab → this route → JS redirect → aidvisora://auth/callback?code=…
 *       → Android intent filter → back to app → NativeOAuthDeepLinkBridge
 *       → exchangeCodeForSession(code) in WebView → session created
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorCode = url.searchParams.get("error_code");
  const errorDesc = url.searchParams.get("error_description");

  if (errorCode || errorDesc) {
    const msg = encodeURIComponent(errorDesc || errorCode || "auth_failed");
    return bridgeHtml(`aidvisora://auth/error?message=${msg}`);
  }

  if (!code) {
    return NextResponse.redirect(`${url.origin}/prihlaseni?error=missing_code`);
  }

  return bridgeHtml(
    `aidvisora://auth/callback?code=${encodeURIComponent(code)}`
  );
}

function bridgeHtml(deepLink: string) {
  const intentUrl = deepLink
    .replace("aidvisora://", "intent://")
    .concat("#Intent;scheme=aidvisora;package=cz.aidvisor.app;end");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aidvisora</title></head>
<body style="background:#060918;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center">
<div>
<div style="width:48px;height:48px;border:3px solid rgba(255,255,255,.2);border-top-color:#818cf8;border-radius:50%;animation:s .8s linear infinite;margin:0 auto 1.5rem"></div>
<p style="font-size:18px;font-weight:700;margin-bottom:8px">Přesměrování do aplikace\u2026</p>
<p style="font-size:14px;opacity:.5">Přihlášení proběhlo úspěšně.</p>
<p id="m" style="display:none;margin-top:24px">
<a href="${esc(deepLink)}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;border-radius:16px;font-weight:800;font-size:14px;text-decoration:none;letter-spacing:.05em;text-transform:uppercase">Otevřít aplikaci</a></p>
<style>@keyframes s{to{transform:rotate(360deg)}}</style>
<script>
location.href=${JSON.stringify(deepLink)};
setTimeout(function(){location.href=${JSON.stringify(intentUrl)}},800);
setTimeout(function(){document.getElementById("m").style.display="block"},2500);
</script>
</div></body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
