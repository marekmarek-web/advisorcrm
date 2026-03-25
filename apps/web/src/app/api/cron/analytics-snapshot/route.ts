import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron-auth";
import { db } from "db";
import { analyticsSnapshots, tenants } from "db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  try {
    const allTenants = await db.select({ id: tenants.id }).from(tenants);

    for (const tenant of allTenants) {
      const payload: Record<string, unknown> = {};

      try {
        const { getExecutiveKPIs } = await import("@/lib/analytics/executive-analytics");
        payload.executiveKPIs = await getExecutiveKPIs(tenant.id);
      } catch {
        /* skip */
      }

      try {
        const { getPipelineMetrics } = await import("@/lib/analytics/pipeline-analytics");
        payload.pipelineMetrics = await getPipelineMetrics(tenant.id);
      } catch {
        /* skip */
      }

      try {
        const { getPaymentMetrics } = await import("@/lib/analytics/payment-analytics");
        payload.paymentMetrics = await getPaymentMetrics(tenant.id);
      } catch {
        /* skip */
      }

      try {
        const { computeHealthScore } = await import("@/lib/analytics/health-scoring");
        payload.healthScore = await computeHealthScore(tenant.id, "pipeline");
      } catch {
        /* skip */
      }

      await db.insert(analyticsSnapshots).values({
        tenantId: tenant.id,
        snapshotType: "daily",
        snapshotDate: new Date(),
        payload,
      });
    }

    return NextResponse.json({ ok: true, tenants: allTenants.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
