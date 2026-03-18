import { NextResponse } from "next/server";
import { and, db, eq, userDevices } from "db";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";

export const dynamic = "force-dynamic";

type RegisterBody = {
  pushToken?: string;
  platform?: string;
  deviceName?: string;
  appVersion?: string;
};

function isValidPlatform(value: string): value is "ios" | "android" {
  return value === "ios" || value === "android";
}

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const membership = await getMembership(user.id);
  if (!membership) return null;

  return {
    userId: user.id,
    tenantId: membership.tenantId,
  };
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as RegisterBody;
    const pushToken = typeof body.pushToken === "string" ? body.pushToken.trim() : "";
    const platform = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
    const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim() : "";
    const appVersion = typeof body.appVersion === "string" ? body.appVersion.trim() : "";

    if (!pushToken) return NextResponse.json({ error: "Push token is required." }, { status: 400 });
    if (!isValidPlatform(platform)) {
      return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });
    }

    await db
      .insert(userDevices)
      .values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        pushToken,
        platform,
        deviceName: deviceName || null,
        appVersion: appVersion || null,
        pushEnabled: true,
        lastSeenAt: new Date(),
        revokedAt: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userDevices.tenantId, userDevices.userId, userDevices.pushToken],
        set: {
          platform,
          deviceName: deviceName || null,
          appVersion: appVersion || null,
          pushEnabled: true,
          lastSeenAt: new Date(),
          revokedAt: null,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to register push device." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { pushToken?: string };
    const pushToken = typeof body.pushToken === "string" ? body.pushToken.trim() : "";
    if (!pushToken) return NextResponse.json({ error: "Push token is required." }, { status: 400 });

    await db
      .update(userDevices)
      .set({
        pushEnabled: false,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(userDevices.tenantId, auth.tenantId), eq(userDevices.userId, auth.userId), eq(userDevices.pushToken, pushToken)));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to revoke push device." }, { status: 500 });
  }
}
