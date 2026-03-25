import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import {
  deriveAdminScope,
  canAccessAdmin,
  canAccessSecurityConsole,
  canManageOpsDeadLetter,
} from "@/lib/admin/admin-permissions";
import {
  addToDeadLetter,
  listDeadLetterItems,
  retryDeadLetterItem,
  discardDeadLetterItem,
  type DeadLetterStatus,
} from "@/lib/resilience/dead-letter";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope) || !canAccessSecurityConsole(scope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as DeadLetterStatus | null;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));

  const items = await listDeadLetterItems(membership.tenantId, {
    ...(status && ["pending", "retried", "discarded"].includes(status) ? { status } : {}),
    limit,
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const scope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(scope) || !canManageOpsDeadLetter(scope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;

  if (action === "retry") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    try {
      const result = await retryDeadLetterItem(membership.tenantId, id);
      return NextResponse.json({ result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  if (action === "discard") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await discardDeadLetterItem(membership.tenantId, id);
    return NextResponse.json({ ok: true });
  }

  if (action === "enqueue") {
    const jobType = typeof body.jobType === "string" ? body.jobType.trim() : "";
    const payload =
      typeof body.payload === "object" && body.payload !== null && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null;
    if (!jobType || !payload) {
      return NextResponse.json({ error: "jobType and payload object required" }, { status: 400 });
    }
    const row = await addToDeadLetter({
      tenantId: membership.tenantId,
      jobType,
      payload,
      failureReason: typeof body.failureReason === "string" ? body.failureReason : undefined,
      attempts: typeof body.attempts === "number" ? body.attempts : undefined,
      correlationId: typeof body.correlationId === "string" ? body.correlationId : undefined,
    });
    return NextResponse.json({ id: row.id }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
