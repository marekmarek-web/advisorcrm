import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  try {
    const { evaluateEscalations } = await import("@/lib/execution/escalation-engine");
    const { dbService, withServiceTenantContext } = await import("@/lib/db/service-db");
    const { contractUploadReviews, memberships, roles, eq, and, sql } = await import("db");

    const reviews = await dbService
      .select({
        id: contractUploadReviews.id,
        tenantId: contractUploadReviews.tenantId,
        ageHours: sql<number>`extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600`,
      })
      .from(contractUploadReviews)
      .limit(500);

    const tenantItems = new Map<string, { entityType: string; entityId: string; ageHours: number }[]>();
    for (const r of reviews) {
      const list = tenantItems.get(r.tenantId) ?? [];
      list.push({ entityType: "review", entityId: r.id, ageHours: r.ageHours });
      tenantItems.set(r.tenantId, list);
    }

    let escalationsCreated = 0;
    for (const [tenantId, items] of tenantItems) {
      const targetUserId = await withServiceTenantContext({ tenantId }, async (tx) => {
        const managers = await tx
          .select({ userId: memberships.userId })
          .from(memberships)
          .innerJoin(roles, eq(memberships.roleId, roles.id))
          .where(and(eq(memberships.tenantId, tenantId), eq(roles.name, "Manager")))
          .limit(1);
        return managers[0]?.userId ?? null;
      });
      if (!targetUserId) continue;

      const events = await evaluateEscalations(tenantId, items, targetUserId);
      escalationsCreated += events.length;
    }

    return NextResponse.json({ ok: true, escalationsCreated });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
