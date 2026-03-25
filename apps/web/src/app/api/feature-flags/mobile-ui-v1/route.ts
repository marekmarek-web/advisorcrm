import { NextResponse } from "next/server";
import { MOBILE_UI_BETA_COOKIE, isMobileUiV1EnabledForRequest } from "@/app/shared/mobile-ui/feature-flag";

/** Lightweight flag read for clients; short CDN cache. */
export async function GET(request: Request) {
  const ua = request.headers.get("user-agent");
  const enabled = isMobileUiV1EnabledForRequest({
    userAgent: ua,
    cookieStore: { get: () => undefined },
  });
  const res = NextResponse.json({ mobileUiV1Heuristic: enabled });
  res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
  return res;
}

export async function POST(req: Request) {
  let enabled = false;
  try {
    const body = (await req.json()) as { enabled?: boolean };
    enabled = !!body.enabled;
  } catch {
    enabled = false;
  }

  const res = NextResponse.json({ ok: true, enabled });
  res.cookies.set({
    name: MOBILE_UI_BETA_COOKIE,
    value: enabled ? "1" : "0",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
