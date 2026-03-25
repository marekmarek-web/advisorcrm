import { NextResponse } from "next/server";
import { getAuthenticatedApiUserId } from "@/lib/auth/api-auth-user";
import { getMembership } from "@/lib/auth/get-membership";
import { deriveAdminScope, canAccessAdmin, canManageOpsDeadLetter } from "@/lib/admin/admin-permissions";
import {
  activateDegradedMode,
  deactivateDegradedMode,
  activateGlobalDegradedMode,
  deactivateGlobalDegradedMode,
  listActiveDegradedModes,
  type ProviderType,
} from "@/lib/resilience/provider-fallbacks";

const PROVIDER_TYPES: ProviderType[] = [
  "ai_extraction",
  "ai_assistant",
  "storage",
  "email",
  "sms",
  "pdf_rendering",
  "ocr",
  "payment_gateway",
  "calendar_sync",
  "document_preview",
];

function isProviderType(v: string): v is ProviderType {
  return PROVIDER_TYPES.includes(v as ProviderType);
}

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const adminScope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(adminScope) || !canManageOpsDeadLetter(adminScope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ activeKeys: listActiveDegradedModes() });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No membership" }, { status: 403 });

  const adminScope = deriveAdminScope(membership.roleName);
  if (!canAccessAdmin(adminScope) || !canManageOpsDeadLetter(adminScope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = body.mode === "deactivate" ? "deactivate" : "activate";
  const scopeKind = body.scope === "global" ? "global" : "tenant";
  const providerTypeRaw = typeof body.providerType === "string" ? body.providerType : "";
  if (!isProviderType(providerTypeRaw)) {
    return NextResponse.json({ error: "valid providerType required" }, { status: 400 });
  }

  if (scopeKind === "global") {
    if (mode === "activate") activateGlobalDegradedMode(providerTypeRaw);
    else deactivateGlobalDegradedMode(providerTypeRaw);
  } else {
    const tenantId =
      typeof body.tenantId === "string" && body.tenantId.trim()
        ? body.tenantId.trim()
        : membership.tenantId;
    if (tenantId !== membership.tenantId && adminScope !== "global_admin") {
      return NextResponse.json({ error: "Cannot change other tenant degraded mode" }, { status: 403 });
    }
    if (mode === "activate") activateDegradedMode(tenantId, providerTypeRaw);
    else deactivateDegradedMode(tenantId, providerTypeRaw);
  }

  return NextResponse.json({ ok: true, activeKeys: listActiveDegradedModes() });
}
