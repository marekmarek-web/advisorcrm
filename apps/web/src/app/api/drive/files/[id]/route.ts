import { NextResponse } from "next/server";
import { getIntegrationApiAuth } from "../../../integrations/auth";
import { requireDriveAccessToken } from "@/lib/integrations/drive-access-token-api";
import {
  deleteDriveFile,
  getDriveFile,
  updateDriveFile,
} from "@/lib/integrations/google-drive";

async function getAccessToken(userId: string, tenantId: string) {
  return requireDriveAccessToken(userId, tenantId);
}

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getIntegrationApiAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;
  const { id } = await context.params;
  try {
    const accessToken = await getAccessToken(userId, tenantId);
    const file = await getDriveFile(accessToken, id);
    return NextResponse.json({ file });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getIntegrationApiAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    addParentId?: string;
    removeParentId?: string;
  };
  try {
    const accessToken = await getAccessToken(userId, tenantId);
    const file = await updateDriveFile(accessToken, id, {
      name: body.name?.trim() || undefined,
      addParents: body.addParentId ? [body.addParentId] : undefined,
      removeParents: body.removeParentId ? [body.removeParentId] : undefined,
    });
    return NextResponse.json({ file });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getIntegrationApiAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;
  const { id } = await context.params;
  try {
    const accessToken = await getAccessToken(userId, tenantId);
    await deleteDriveFile(accessToken, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
