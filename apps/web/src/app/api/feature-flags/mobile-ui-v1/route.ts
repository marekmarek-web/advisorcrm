import { NextResponse } from "next/server";
import { MOBILE_UI_BETA_COOKIE } from "@/app/shared/mobile-ui/feature-flag";

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
