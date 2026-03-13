import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission } from "@/lib/auth/get-membership";
import { listContractReviews } from "@/lib/ai/review-queue-repository";
import type { ContractReviewStatus } from "db";
import type { ContractProcessingStatus } from "db";

export const dynamic = "force-dynamic";

function matchSearch(row: { extractedPayload?: unknown }, q: string): boolean {
  if (!q || q.length < 2) return true;
  const s = q.toLowerCase();
  const p = row.extractedPayload as Record<string, unknown> | null;
  if (!p) return false;
  const str = (v: unknown) => (v != null ? String(v).toLowerCase() : "");
  const client = p.client as Record<string, unknown> | undefined;
  const fullName = client ? str(client.fullName) || [str(client.firstName), str(client.lastName)].filter(Boolean).join(" ") : "";
  return (
    str(p.institutionName).includes(s) ||
    str(p.contractNumber).includes(s) ||
    fullName.includes(s) ||
    (client ? str(client.email).includes(s) || str(client.phone).includes(s) : false)
  );
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const membership = await getMembership(user.id);
    if (!membership || !hasPermission(membership.roleName, "documents:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const reviewStatus = searchParams.get("reviewStatus") as ContractReviewStatus | null;
    const processingStatus = searchParams.get("processingStatus") as ContractProcessingStatus | null;
    const search = searchParams.get("search")?.trim() ?? "";

    let rows = await listContractReviews(membership.tenantId, {
      limit: 100,
      ...(reviewStatus ? { reviewStatus } : {}),
    });

    if (processingStatus) {
      rows = rows.filter((r) => r.processingStatus === processingStatus);
    }
    if (search) {
      rows = rows.filter((r) => matchSearch(r, search));
    }

    return NextResponse.json({ items: rows });
  } catch {
    return NextResponse.json(
      { error: "Načtení seznamu selhalo." },
      { status: 500 }
    );
  }
}
